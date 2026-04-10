"use client";

import { useState } from "react";
import type { RunRequest } from "@/lib/types";

const SCENARIOS = [
  { value: "apartment_morning", label: "Apartment — Morning" },
  { value: "apartment_evening", label: "Apartment — Evening" },
  { value: "office_morning", label: "Office — Morning" },
  { value: "office_evening", label: "Office — Evening" },
  { value: "custom", label: "Custom (manual)" },
];

const METRICS = [
  { value: "wait_time", label: "Avg Wait Time" },
  { value: "total_time", label: "Avg Total Time" },
  { value: "energy", label: "Energy" },
];

const ALGORITHMS = [
  { value: "", label: "Auto (compare all)" },
  { value: "fcfs", label: "FCFS" },
  { value: "batch", label: "Batch" },
  { value: "sweep", label: "Sweep" },
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
        alert("Invalid JSON for custom passengers. Format: [{\"floor\":0,\"destination\":3}]");
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
      <h2 className="text-lg font-bold text-white">Configuration</h2>

      {/* Scenario */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Scenario</span>
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

      {/* Passenger count for predefined scenarios */}
      {scenario !== "custom" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Passengers</span>
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

      {/* Custom passengers input */}
      {scenario === "custom" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Passengers (JSON)</span>
          <textarea
            value={customPassengers}
            onChange={(e) => setCustomPassengers(e.target.value)}
            placeholder='[{"floor":0,"destination":3},{"floor":2,"destination":0}]'
            rows={4}
            className="bg-slate-700 text-white rounded px-3 py-2 text-sm font-mono"
          />
        </label>
      )}

      {/* Metric */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Optimize for</span>
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

      {/* Algorithm */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Algorithm</span>
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

      {/* Speed */}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Playback Speed</span>
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

      {/* Run / Stop */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          {isRunning ? "Running..." : "▶ Run"}
        </button>
        {isRunning && (
          <button
            onClick={onStop}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            ■ Stop
          </button>
        )}
      </div>
    </div>
  );
}
