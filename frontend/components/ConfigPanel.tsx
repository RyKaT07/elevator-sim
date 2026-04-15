"use client";

import { useState } from "react";
import type { RunRequest } from "@/lib/types";

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

export default function ConfigPanel({ onRun, isRunning, onStop, speed, onSpeedChange }: Props) {
  const [scenario, setScenario] = useState("apartment_morning");
  const [metric, setMetric] = useState<"wait_time" | "total_time" | "energy">("wait_time");
  const [algorithm, setAlgorithm] = useState("");
  const [passengerCount, setPassengerCount] = useState(14);
  const [customPassengers, setCustomPassengers] = useState("");

  const handleRun = () => {
    if (scenario === "custom") {
      try {
        const parsed = JSON.parse(customPassengers);
        onRun({
          passengers: parsed,
          scenario: "custom",
          metric,
          algorithm: algorithm || undefined,
        });
      } catch {
        alert("Nieprawidłowy JSON. Format: [{\"floor\":0,\"destination\":3}]");
      }
      return;
    }

    onRun({
      passengers: [],
      scenario,
      metric,
      algorithm: algorithm || undefined,
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

      {/* Liczba pasażerów */}
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

      {/* Własne dane */}
      {scenario === "custom" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Pasażerowie (JSON)</span>
          <textarea
            value={customPassengers}
            onChange={(e) => setCustomPassengers(e.target.value)}
            placeholder='[{"floor":0,"destination":3},{"floor":2,"destination":0}]'
            rows={4}
            className="bg-slate-700 text-white rounded px-3 py-2 text-sm font-mono"
          />
        </label>
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
