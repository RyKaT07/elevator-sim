"use client";

import type { Summary } from "@/lib/types";

interface Props {
  summary: Summary | null;
}

const ALGO_LABELS: Record<string, string> = {
  fcfs: "Wg kolejności",
  largest_group: "Wg ilości",
  scan: "Góra-dół",
  sstf: "Najbliższe",
};

export default function ResultsTable({ summary }: Props) {
  if (!summary) return null;

  return (
    <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
      <h2 className="text-lg font-bold text-white mb-3">Wyniki</h2>

      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="text-left py-2 pr-2 w-[30%]">Algorytm</th>
            <th className="text-right py-2 px-1 w-[20%]">Śr. (s)</th>
            <th className="text-right py-2 px-1 w-[20%]">Maks. (s)</th>
            <th className="text-right py-2 px-1 w-[30%]">Energia (j/os·p)</th>
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
              <td className="py-2 pr-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>{ALGO_LABELS[r.algorithm] ?? r.algorithm.toUpperCase()}</span>
                  {r.algorithm === summary.selected && (
                    <span className="text-[10px] bg-green-900 text-green-300 px-1 py-0.5 rounded leading-none whitespace-nowrap">
                      BEST
                    </span>
                  )}
                </div>
              </td>
              <td className="text-right py-2 px-1 tabular-nums whitespace-nowrap">
                {r.metrics.avg_wait_time.toFixed(1)}
              </td>
              <td className="text-right py-2 px-1 tabular-nums whitespace-nowrap">
                {r.metrics.max_wait_time.toFixed(1)}
              </td>
              <td className="text-right py-2 px-1 tabular-nums whitespace-nowrap">
                {r.metrics.energy.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
