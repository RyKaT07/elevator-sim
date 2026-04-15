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
  { value: "total_time", label: "Śr. czas całkowity" },
  { value: "energy", label: "Energia" },
];

const ALGORITHMS = [
  { value: "", label: "Auto (porównaj wszystkie)" },
  { value: "fcfs", label: "FCFS" },
  { value: "batch", label: "Batch" },
  { value: "sweep", label: "Sweep" },
  { value: "sequential", label: "Sekwencyjny (bez algorytmu)" },
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
  { value: 2000, label: "0.25x" },
  { value: 1000, label: "0.5x" },
  { value: 500,  label: "1x" },
  { value: 150,  label: "2x" },
  { value: 50,   label: "5x" },
];

interface ManualPassenger {
  floor: number;
  destination: number;
}

export default function ConfigPanel({ onRun, isRunning, onStop, speed, onSpeedChange }: Props) {
  const [scenario, setScenario] = useState("apartment_morning");
  const [metric, setMetric] = useState<"wait_time" | "total_time" | "energy">("wait_time");
  const [algorithm, setAlgorithm] = useState("");
  const [cooperation, setCooperation] = useState("");
  const [passengerCount, setPassengerCount] = useState(14);

  // Manual passenger editor state
  const [manualPassengers, setManualPassengers] = useState<ManualPassenger[]>([]);
  const [addFloor, setAddFloor] = useState(0);
  const [addDest, setAddDest] = useState(3);

  const addPassenger = () => {
    if (addFloor === addDest) return;
    setManualPassengers((prev) => [...prev, { floor: addFloor, destination: addDest }]);
  };

  const removePassenger = (idx: number) => {
    setManualPassengers((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearPassengers = () => setManualPassengers([]);

  const handleRun = () => {
    if (scenario === "custom") {
      if (manualPassengers.length === 0) {
        alert("Dodaj co najmniej jednego pasażera.");
        return;
      }
      onRun({
        passengers: manualPassengers,
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
          <span className="text-sm text-slate-400">Pasażerowie ({manualPassengers.length})</span>

          {/* Dodaj pasażera */}
          <div className="flex items-end gap-2">
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
            <button
              onClick={addPassenger}
              disabled={addFloor === addDest}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-bold px-3 py-1.5 rounded transition-colors"
            >
              + Dodaj
            </button>
          </div>

          {/* Lista pasażerów */}
          {manualPassengers.length > 0 && (
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {manualPassengers.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-slate-700/50 rounded px-2 py-1 text-sm"
                >
                  <span className="text-slate-300">
                    <span className="text-amber-400 font-mono">F{p.floor}</span>
                    {" → "}
                    <span className="text-green-400 font-mono">F{p.destination}</span>
                    <span className="text-slate-500 ml-1.5 text-xs">
                      ({p.destination > p.floor ? "↑" : "↓"})
                    </span>
                  </span>
                  <button
                    onClick={() => removePassenger(i)}
                    className="text-red-400 hover:text-red-300 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {manualPassengers.length > 0 && (
            <button
              onClick={clearPassengers}
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
