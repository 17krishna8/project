import { useEffect, useRef, useState, useMemo } from "react";
import { subscribeToLogs, type LogEvent } from "../api";

const MAX_ROWS = 250;

interface LogStreamProps {
  onEventsChange?: (events: LogEvent[]) => void;
}

const METHOD_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: "bg-emerald-50", text: "text-[#0f3d2e]", border: "border-emerald-300" },
  POST: { bg: "bg-[#0f3d2e]", text: "text-white", border: "border-[#0f3d2e]" },
  PUT: { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  PATCH: { bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-300" },
  DELETE: { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300" }
};

export function LogStream({ onEventsChange }: LogStreamProps) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filterMode, setFilterMode] = useState<"ALL" | "SUCCESS" | "ERRORS">("ALL");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    return subscribeToLogs((event) => {
      if (pausedRef.current) return;
      setEvents((current) => {
        const next = [event, ...current].slice(0, MAX_ROWS);
        if (onEventsChange) onEventsChange(next);
        return next;
      });
    });
  }, [onEventsChange]);

  const filteredEvents = useMemo(() => {
    if (filterMode === "SUCCESS") return events.filter((e) => e.status < 400);
    if (filterMode === "ERRORS") return events.filter((e) => e.status >= 400);
    return events;
  }, [events, filterMode]);

  return (
    <section className="card-figma p-6 space-y-4 bg-white border border-[#e5e7df] shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5e7df] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Live Traffic & SSE Logs</h2>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
              <span className={`h-2 w-2 rounded-full ${paused ? "bg-amber-500" : "bg-[#0f3d2e] animate-pulse"}`} />
              {paused ? "Stream Paused" : "Live SSE Stream"}
            </span>
          </div>
          <p className="text-xs text-slate-600 font-medium">Real-time HTTP traffic telemetry emitted by Fastify catch-all router</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter chips */}
          <div className="flex items-center rounded-xl bg-[#f1f2ec] p-0.5 border border-[#e5e7df] text-xs font-semibold">
            <button
              onClick={() => setFilterMode("ALL")}
              className={`rounded-lg px-3 py-1 font-semibold transition-all ${
                filterMode === "ALL" ? "bg-[#0f3d2e] text-white shadow-sm font-bold" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              All ({events.length})
            </button>
            <button
              onClick={() => setFilterMode("SUCCESS")}
              className={`rounded-lg px-3 py-1 font-semibold transition-all ${
                filterMode === "SUCCESS" ? "bg-[#0f3d2e] text-white shadow-sm font-bold" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              2xx Success
            </button>
            <button
              onClick={() => setFilterMode("ERRORS")}
              className={`rounded-lg px-3 py-1 font-semibold transition-all ${
                filterMode === "ERRORS" ? "bg-[#0f3d2e] text-white shadow-sm font-bold" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Faults & Errors
            </button>
          </div>

          {/* Pause / Resume */}
          <button
            onClick={() => setPaused(!paused)}
            className="rounded-xl border border-[#e5e7df] bg-[#f6f6f2] hover:bg-[#e5e7df] px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors"
          >
            {paused ? "▶ Resume Stream" : "⏸ Pause"}
          </button>
        </div>
      </div>

      {/* Log Feed Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e5e7df] bg-white shadow-xs">
        <table className="w-full text-left font-mono text-xs">
          <thead className="border-b border-[#e5e7df] bg-[#f1f2ec] text-[11px] uppercase tracking-wider text-slate-700 font-sans font-bold">
            <tr>
              <th className="py-2.5 px-3">Time</th>
              <th className="py-2.5 px-3">Method</th>
              <th className="py-2.5 px-3">Path</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Gateway Origin</th>
              <th className="py-2.5 px-3">Latency</th>
              <th className="py-2.5 px-3">Session</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7df] bg-white">
            {filteredEvents.map((event, i) => {
              const badge = METHOD_BADGES[event.method] ?? { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-300" };
              const isError = event.status >= 400;

              return (
                <tr key={`${event.time}-${i}`} className="hover:bg-[#f6f6f2] transition-colors">
                  <td className="py-2 px-3 text-slate-600 text-[11px] font-semibold whitespace-nowrap">
                    {event.time.slice(11, 19)}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text} ${badge.border}`}>
                      {event.method}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-900 truncate max-w-xs">
                    {event.path}
                    {event.fault && (
                      <span className="ml-2 rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[9px] text-amber-900 font-sans font-bold">
                        Simulated Fault
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        isError
                          ? "bg-rose-100 text-rose-900 border border-rose-300"
                          : "bg-emerald-100 text-[#0f3d2e] border border-emerald-300"
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {event.source === "real-backend" ? (
                      <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900 font-sans inline-flex items-center gap-1 shadow-xs">
                        <span>🟢</span>
                        <span>PROXIED: REAL BACKEND (:8080)</span>
                      </span>
                    ) : event.fallback || event.source === "mock-fallback" ? (
                      <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 font-sans inline-flex items-center gap-1 shadow-xs">
                        <span>⚠️</span>
                        <span>FALLBACK: MOCK (Circuit Breaker Active)</span>
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#f1f2ec] border border-[#e5e7df] px-2.5 py-0.5 text-[10px] font-bold text-[#0f3d2e] font-sans inline-flex items-center gap-1">
                        <span>🟡</span>
                        <span>MOCKED: IN-MEMORY (:3000)</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-700 font-semibold text-[11px]">
                    {event.latencyMs} ms
                  </td>
                  <td className="py-2 px-3 text-slate-600 font-mono text-[11px] truncate max-w-[120px]">
                    {event.session}
                  </td>
                </tr>
              );
            })}

            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500 text-xs font-mono font-semibold">
                  {events.length === 0
                    ? "Awaiting incoming HTTP requests over /__admin/logs..."
                    : "No requests match the selected filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
