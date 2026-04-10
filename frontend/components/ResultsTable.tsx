"use client";

import type { Summary } from "@/lib/types";

interface Props {
  summary: Summary | null;
}

export default function ResultsTable({ summary }: Props) {
  if (!summary) return null;

  return (
    <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
      <h2 className="text-lg font-bold text-white mb-3">Results</h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="text-left py-2 pr-4">Algorithm</th>
            <th className="text-right py-2 px-2">Avg Wait</th>
            <th className="text-right py-2 px-2">Avg Total</th>
            <th className="text-right py-2 px-2">Energy</th>
          </tr>
        </thead>
        <tbody>
          {summary.results.map((r) => (
            <tr
              key={r.algorithm}
              className={`border-b border-slate-700/50 ${
                r.algorithm === summary.selected
                  ? "text-green-400 font-bold"
                  : "text-slate-300"
              }`}
            >
              <td className="py-2 pr-4">
                {r.algorithm.toUpperCase()}
                {r.algorithm === summary.selected && (
                  <span className="ml-2 text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded">
                    BEST
                  </span>
                )}
              </td>
              <td className="text-right py-2 px-2">
                {r.metrics.avg_wait_time.toFixed(1)} ticks
              </td>
              <td className="text-right py-2 px-2">
                {r.metrics.avg_total_time.toFixed(1)} ticks
              </td>
              <td className="text-right py-2 px-2">
                {r.metrics.energy.toFixed(1)} units
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
