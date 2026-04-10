"use client";

import type { StateFrame } from "@/lib/types";

interface Props {
  frame: StateFrame | null;
}

export default function MetricsBar({ frame }: Props) {
  if (!frame) return null;

  const { metrics } = frame;
  const totalWaiting = frame.floors.reduce((sum, f) => sum + f.waiting.length, 0);
  const totalInElevators = frame.elevators.reduce((sum, e) => sum + e.passengers.length, 0);

  return (
    <div className="flex gap-4 p-3 bg-slate-800 rounded-lg border border-slate-700 text-sm">
      <Stat label="Avg Wait" value={`${metrics.avg_wait_time.toFixed(1)}t`} />
      <Stat label="Avg Total" value={`${metrics.avg_total_time.toFixed(1)}t`} />
      <Stat label="Energy" value={`${metrics.energy.toFixed(1)}u`} />
      <Stat label="Waiting" value={`${totalWaiting}`} color="text-amber-400" />
      <Stat label="In Transit" value={`${totalInElevators}`} color="text-green-400" />
    </div>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
