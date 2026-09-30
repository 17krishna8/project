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
    setSelected(id);
    try {
      setData(await api.sessionData(id));
    } catch {
      setData({});
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Sessions</h2>
        <button
          type="button"
          onClick={() => {
            void api.resetSessions().then(refresh);
            setSelected(null);
            setData({});
          }}
          className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Reset all
        </button>
      </div>
      <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => void inspect(session.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-800/50 ${
                selected === session.id ? "bg-slate-800/70" : ""
              }`}
            >
              <span className="truncate font-mono text-xs text-slate-200">{session.id}</span>
              <span className="ml-3 shrink-0 text-xs text-slate-500">
                {session.records} records - {ago(session.lastAccessAt)}
              </span>
            </button>
          </li>
        ))}
        {sessions.length === 0 ? <li className="px-3 py-4 text-xs text-slate-500">No active sessions.</li> : null}
      </ul>
      {selected ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-xs text-slate-500">Records in {selected}</div>
          <pre className="mt-2 max-h-48 overflow-auto text-xs text-slate-300">
            {JSON.stringify(data, null, 2).slice(0, 4000)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
