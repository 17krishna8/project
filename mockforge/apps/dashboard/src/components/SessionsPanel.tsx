import { useCallback, useEffect, useState } from "react";
import { api, formatDuration, type SessionInfo } from "../api";

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "-";
  if (ms < 0) return "just now";
  return `${formatDuration(ms)} ago`;
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, Array<Record<string, unknown>>>>({});

  const refresh = useCallback(() => {
    api
      .sessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const inspect = async (id: string) => {
    if (selected === id) {
      setSelected(null);
      setData({});
      return;
    }
    setSelected(id);
    try {
      setData(await api.sessionData(id));
    } catch {
      setData({});
    }
  };

  return (
    <section className="card-tactical p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-phosphor-cyan"></span>
            Isolated Client Sessions
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Per-session in-memory CRUD datasets via X-Session-Id
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void api.resetSessions().then(refresh);
            setSelected(null);
            setData({});
          }}
          className="rounded-lg border border-slate-700/80 bg-obsidian-950 px-2.5 py-1 text-xs font-mono text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Reset All
        </button>
      </div>

      <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
        {sessions.map((session) => (
          <div key={session.id} className="space-y-1">
            <button
              type="button"
              onClick={() => void inspect(session.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-mono text-xs border transition-all ${
                selected === session.id
                  ? "border-phosphor-cyan/50 bg-phosphor-cyan/10"
                  : "border-slate-800/80 bg-obsidian-950/60 hover:border-slate-700 hover:bg-slate-800/30"
              }`}
            >
              <div className="truncate">
                <span className="font-semibold text-slate-200 truncate">{session.id}</span>
                <span className="block text-[10px] text-slate-500">accessed {ago(session.lastAccessAt)}</span>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-signal-400 font-bold">
                  {session.records} records
                </span>
              </div>
            </button>
          </div>
        ))}

        {sessions.length === 0 ? (
          <p className="py-6 text-center text-xs font-mono text-slate-500">
            No active sessions in memory. Make a request with X-Session-Id to spawn one.
          </p>
        ) : null}
      </div>

      {selected && (
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              Data in &ldquo;{selected}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[10px] font-mono text-slate-500 hover:text-slate-300"
            >
              Close
            </button>
          </div>
          <pre className="max-h-48 overflow-auto rounded-xl border border-slate-800 bg-obsidian-950 p-3 font-mono text-[11px] text-slate-300">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
