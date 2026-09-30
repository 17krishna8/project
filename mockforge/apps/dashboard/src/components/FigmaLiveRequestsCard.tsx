import { useState } from "react";
import type { LogEvent } from "../api";

interface FigmaLiveRequestsCardProps {
  logs: LogEvent[];
}

const METHOD_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: "bg-emerald-50", text: "text-[#0f3d2e]", border: "border-emerald-300" },
  POST: { bg: "bg-[#0f3d2e]", text: "text-white", border: "border-[#0f3d2e]" },
  PUT: { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  PATCH: { bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-300" },
  DELETE: { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300" }
};

export function FigmaLiveRequestsCard({ logs }: FigmaLiveRequestsCardProps) {
  const [filter, setFilter] = useState<"ALL" | "ERRORS">("ALL");

  const displayLogs = logs.filter((l) => (filter === "ERRORS" ? l.status >= 400 : true)).slice(0, 8);

  return (
    <div className="card-figma p-5 flex flex-col justify-between space-y-4 bg-white border border-[#e5e7df] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e5e7df] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Live requests</h3>
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0f3d2e] animate-pulse" />
              Live SSE
            </span>
          </div>
          <p className="text-xs text-slate-600 font-medium">Traffic hitting the mock right now with provenance origin</p>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
              filter === "ALL" ? "bg-[#0f3d2e] text-white shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("ERRORS")}
            className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
              filter === "ERRORS" ? "bg-amber-600 text-white shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Faults
          </button>
        </div>
      </div>

      {/* Live Log Items List */}
      <div className="divide-y divide-[#e5e7df] font-mono text-xs">
        {displayLogs.map((log, i) => {
          const badge = METHOD_BADGES[log.method] ?? { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-300" };
          const isError = log.status >= 400;

          return (
            <div
              key={`${log.time}-${i}`}
              className="py-2.5 flex items-center justify-between gap-3 hover:bg-[#f6f6f2] transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text} ${badge.border}`}>
                  {log.method}
                </span>
                <span className="font-bold text-slate-900 text-xs truncate">{log.path}</span>
                {log.fault && (
                  <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.2 text-[9px] text-amber-900 font-sans font-bold">
                    Simulated
                  </span>
                )}
                {/* Provenance Origin Badge (Question 4) */}
                {log.source === "real-backend" ? (
                  <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.2 text-[9px] font-bold text-emerald-900 font-sans inline-flex items-center gap-1">
                    🟢 Proxied (:8080)
                  </span>
                ) : log.fallback || log.source === "mock-fallback" ? (
                  <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.2 text-[9px] font-bold text-amber-900 font-sans inline-flex items-center gap-1">
                    ⚠️ Fallback (Mock)
                  </span>
                ) : (
                  <span className="rounded-full bg-[#f1f2ec] border border-[#e5e7df] px-2 py-0.2 text-[9px] font-bold text-[#0f3d2e] font-sans inline-flex items-center gap-1">
                    🟡 Mock (:3000)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs">
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[10px] font-mono ${
                    isError
                      ? "bg-rose-100 text-rose-900 border border-rose-300"
                      : "bg-emerald-100 text-[#0f3d2e] border border-emerald-300"
                  }`}
                >
                  {log.status}
                </span>
                <span className="text-slate-700 font-semibold text-xs w-14 text-right">{log.latencyMs} ms</span>
                <span className="text-slate-500 font-mono text-[10px]">{log.time.slice(11, 19)}</span>
              </div>
            </div>
          );
        })}

        {displayLogs.length === 0 && (
          <div className="py-12 text-center text-slate-500 text-xs font-mono font-semibold">
            Awaiting incoming HTTP traffic...
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-[11px] text-slate-600 font-mono font-semibold flex items-center justify-between pt-1 border-t border-[#e5e7df]">
        <span>SSE stream: /__admin/logs</span>
        <span>Buffer: {logs.length} events</span>
      </div>
    </div>
  );
}
