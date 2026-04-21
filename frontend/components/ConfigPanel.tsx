"use client";

import { useState } from "react";
import type { RunRequest } from "@/lib/types";

const NUM_FLOORS = 7;

const SCENARIOS = [
  { value: "apartment_morning", label: "Blok — Poranek" },
  { value: "apartment_evening", label: "Blok — Wieczór" },
  { value: "office_morning", label: "Biuro — Poranek" },
  { value: "office_evening", label: "Biuro — Wieczór" },
  { value: "custom", label: "Własne (ręczne)" },
];

const METRICS = [
  { value: "wait_time", label: "Śr. czas oczekiwania" },
  { value: "max_wait_time", label: "Maks. czas oczekiwania" },
  { value: "energy", label: "Energia (j/os·p)" },
];

const ALGORITHMS = [
  { value: "", label: "Auto (porównaj wszystkie)" },
  { value: "fcfs", label: "Wg kolejności wezwań" },
  { value: "largest_group", label: "Wg ilości pasażerów" },
  { value: "scan", label: "Góra-dół" },
  { value: "sstf", label: "Najbliższe wezwanie" },
];

const COOPERATION_MODES = [
  { value: "", label: "Brak (niezależne)" },
  { value: "zone_split", label: "Podział strefowy (góra/dół)" },
  { value: "task_split", label: "Podział zadaniowy (grupy/pojedyncze)" },
];

interface Props {
  onRun: (req: RunRequest) => void;
  isRunning: boolean;
  onStop: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [
  { value: 2000, label: "0.5x" },
  { value: 1000, label: "1x" },
  { value: 500,  label: "2x" },
  { value: 200,  label: "5x" },
  { value: 100,  label: "10x" },
];

interface ManualGroup {
  floor: number;
  destination: number;
  count: number;
}

const MAX_GROUP_SIZE = 20;

export default function ConfigPanel({ onRun, isRunning, onStop, speed, onSpeedChange }: Props) {
  const [scenario, setScenario] = useState("apartment_morning");
  const [metric, setMetric] = useState<"wait_time" | "max_wait_time" | "energy">("wait_time");
  const [algorithm, setAlgorithm] = useState("");
  const [cooperation, setCooperation] = useState("");
  const [passengerCount, setPassengerCount] = useState(14);

  // Manual passenger editor state — now grouped by (from, to, count)
  const [manualGroups, setManualGroups] = useState<ManualGroup[]>([]);
  const [addFloor, setAddFloor] = useState(0);
  const [addDest, setAddDest] = useState(3);
  const [addCount, setAddCount] = useState(1);

  const totalManual = manualGroups.reduce((s, g) => s + g.count, 0);

  const addGroup = () => {
    if (addFloor === addDest) return;
    const count = Math.max(1, Math.min(MAX_GROUP_SIZE, addCount));
    setManualGroups((prev) => {
      // Merge with existing group if same route
      const idx = prev.findIndex(
        (g) => g.floor === addFloor && g.destination === addDest,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          count: Math.min(MAX_GROUP_SIZE, next[idx].count + count),
        };
        return next;
      }
      return [...prev, { floor: addFloor, destination: addDest, count }];
    });
  };

  const updateGroupCount = (idx: number, count: number) => {
    const c = Math.max(1, Math.min(MAX_GROUP_SIZE, count));
    setManualGroups((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, count: c } : g)),
    );
  };

  const removeGroup = (idx: number) => {
    setManualGroups((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearGroups = () => setManualGroups([]);

  const handleRun = () => {
    if (scenario === "custom") {
      if (manualGroups.length === 0) {
        alert("Dodaj co najmniej jednego pasażera.");
        return;
      }
      // Expand groups to individual passengers
      const passengers = manualGroups.flatMap((g) =>
        Array.from({ length: g.count }, () => ({
          floor: g.floor,
          destination: g.destination,
        })),
      );
      onRun({
        passengers,
        scenario: "custom",
        metric,
        algorithm: algorithm || undefined,
        cooperation: cooperation || undefined,
      });
      return;
    }

    onRun({
      passengers: [],
      scenario,
      metric,
      algorithm: algorithm || undefined,
      cooperation: cooperation || undefined,
      passenger_count: passengerCount,
    } as any);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
      <h2 className="text-lg font-bold text-white">Konfiguracja</h2>

      {/* Scenariusz */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Scenariusz</span>
        <select
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          className="bg-slate-700 text-white rounded px-3 py-2 text-sm"
        >
          {SCENARIOS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>

      {/* Liczba pasażerów — scenariusze predefiniowane */}
      {scenario !== "custom" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Pasażerowie</span>
          <input
            type="number"
            min={1}
            max={30}
            value={passengerCount}
            onChange={(e) => setPassengerCount(Number(e.target.value))}
            className="bg-slate-700 text-white rounded px-3 py-2 text-sm w-24"
          />
        </label>
      )}

      {/* Edytor pasażerów — tryb ręczny */}
      {scenario === "custom" && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-slate-400">
            Pasażerowie ({totalManual})
          </span>

          {/* Dodaj grupę pasażerów */}
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-slate-500">Z piętra</span>
              <select
                value={addFloor}
                onChange={(e) => setAddFloor(Number(e.target.value))}
                className="bg-slate-700 text-white rounded px-2 py-1.5 text-sm w-16"
              >
                {Array.from({ length: NUM_FLOORS }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </label>
            <span className="text-slate-500 pb-1.5">→</span>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-slate-500">Na piętro</span>
              <select
                value={addDest}
                onChange={(e) => setAddDest(Number(e.target.value))}
                className="bg-slate-700 text-white rounded px-2 py-1.5 text-sm w-16"
              >
                {Array.from({ length: NUM_FLOORS }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-slate-500">Liczba osób</span>
              <input
                type="number"
                min={1}
                max={MAX_GROUP_SIZE}
                value={addCount}
                onChange={(e) => setAddCount(Number(e.target.value) || 1)}
                className="bg-slate-700 text-white rounded px-2 py-1.5 text-sm w-16"
              />
            </label>
            <button
              onClick={addGroup}
              disabled={addFloor === addDest}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-bold px-3 py-1.5 rounded transition-colors"
            >
              + Dodaj
            </button>
          </div>

          {/* Lista grup pasażerów */}
          {manualGroups.length > 0 && (
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {manualGroups.map((g, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-slate-700/50 rounded px-2 py-1 text-sm gap-2"
                >
                  <span className="text-slate-300 flex-1">
                    <span className="text-amber-400 font-mono">F{g.floor}</span>
                    {" → "}
                    <span className="text-green-400 font-mono">F{g.destination}</span>
                    <span className="text-slate-500 ml-1.5 text-xs">
                      ({g.destination > g.floor ? "↑" : "↓"})
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 text-xs">×</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_GROUP_SIZE}
                      value={g.count}
                      onChange={(e) =>
                        updateGroupCount(i, Number(e.target.value) || 1)
                      }
                      className="bg-slate-700 text-white rounded px-1.5 py-0.5 text-xs w-12 text-center"
                    />
                    <button
                      onClick={() => removeGroup(i)}
                      className="text-red-400 hover:text-red-300 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {manualGroups.length > 0 && (
            <button
              onClick={clearGroups}
              className="text-xs text-slate-500 hover:text-slate-300 self-start transition-colors"
            >
              Wyczyść wszystkich
            </button>
          )}
        </div>
      )}

      {/* Metryka */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Optymalizuj pod kątem</span>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
          className="bg-slate-700 text-white rounded px-3 py-2 text-sm"
        >
          {METRICS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>

      {/* Algorytm */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Algorytm</span>
        <select
          value={algorithm}
          onChange={(e) => setAlgorithm(e.target.value)}
          className="bg-slate-700 text-white rounded px-3 py-2 text-sm"
        >
          {ALGORITHMS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </label>

      {/* Współpraca wind */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Współpraca wind</span>
        <select
          value={cooperation}
          onChange={(e) => setCooperation(e.target.value)}
          className="bg-slate-700 text-white rounded px-3 py-2 text-sm"
        >
          {COOPERATION_MODES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>

      {/* Prędkość */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Prędkość odtwarzania</span>
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              onClick={() => onSpeedChange(s.value)}
              className={`flex-1 py-1 px-2 rounded text-xs font-mono transition-colors ${
                speed === s.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </label>

      {/* Uruchom / Zatrzymaj */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          {isRunning ? "Symulacja..." : "▶ Uruchom"}
        </button>
        {isRunning && (
          <button
            onClick={onStop}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            ■ Zatrzymaj
          </button>
        )}
      </div>
    </div>
  );
}
