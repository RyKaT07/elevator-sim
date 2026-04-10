"use client";

import { useSimSocket } from "@/lib/useSimSocket";
import ElevatorCanvas from "@/components/ElevatorCanvas";
import ConfigPanel from "@/components/ConfigPanel";
import ResultsTable from "@/components/ResultsTable";
import MetricsBar from "@/components/MetricsBar";

export default function Home() {
  const { currentFrame, summary, isRunning, error, run, stop } = useSimSocket();

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Elevator Simulator</h1>
        <p className="text-slate-400 text-sm">
          PiASCR — 2 elevators, 7 floors, 3 algorithms
        </p>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Canvas + Metrics */}
        <div className="flex flex-col gap-4">
          <ElevatorCanvas frame={currentFrame} />
          <MetricsBar frame={currentFrame} />
        </div>

        {/* Right: Config + Results */}
        <div className="flex flex-col gap-4 w-full lg:w-80">
          <ConfigPanel onRun={run} isRunning={isRunning} onStop={stop} />
          <ResultsTable summary={summary} />
        </div>
      </div>
    </div>
  );
}
