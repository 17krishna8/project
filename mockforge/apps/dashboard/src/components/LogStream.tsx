import { useEffect, useRef, useState } from "react";
import { subscribeToLogs, type LogEvent } from "../api";

const MAX_ROWS = 200;

function statusTone(status: number): string {
  if (status >= 500) return "text-rose-400";
  if (status >= 400) return "text-amber-400";
  if (status >= 300) return "text-sky-400";
  return "text-emerald-400";
}

export function LogStream() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    return subscribeToLogs((event) => {
      if (pausedRef.current) return;
      setEvents((current) => [event, ...current].slice(0, MAX_ROWS));
    });
  }, []);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Live request log</h2>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> streaming
          </span>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>
      <div className="mt-3 max-h-80 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-900/95 text-slate-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Time</th>
              <th className="py-1.5 pr-3 font-medium">Method</th>
              <th className="py-1.5 pr-3 font-medium">Path</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 font-medium">Latency</th>
              <th className="py-1.5 pr-3 font-medium">Session</th>
              <th className="py-1.5 font-medium">Fault</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {events.map((event, index) => (
              <tr key={`${event.time}-${index}`}>
                <td className="py-1.5 pr-3 text-slate-500">{event.time.slice(11, 19)}</td>
                <td className="py-1.5 pr-3 text-slate-300">{event.method}</td>
                <td className="py-1.5 pr-3 text-slate-200">{event.path}</td>
                <td className={`py-1.5 pr-3 ${statusTone(event.status)}`}>{event.status}</td>
                <td className="py-1.5 pr-3 text-slate-400">{event.latencyMs} ms</td>
                <td className="py-1.5 pr-3 text-slate-500">{event.session.slice(0, 18)}</td>
                <td className="py-1.5 text-rose-400">{event.fault ?? ""}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  Waiting for traffic...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
