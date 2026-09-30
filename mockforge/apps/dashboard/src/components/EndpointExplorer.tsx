import { useState } from "react";
import type { RouteInfo } from "../api";

/** A live request bench: pick a route, send it, see the real status and body.
 *  Everything goes to the mock on the same origin, so a route that needs a path
 *  parameter gets the sample id filled in for you. */
export function EndpointExplorer({ routes }: { routes: RouteInfo[] }) {
  const [selected, setSelected] = useState<string>("");
  const [response, setResponse] = useState<{ status: number; ms: number; body: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const route = routes.find((candidate) => `${candidate.method} ${candidate.path}` === selected) ?? routes[0];

  const send = async () => {
    if (!route) return;
    setBusy(true);
    setError("");
    const started = Date.now();
    // A read route is the safe default: no body to invent, and it works against
    // whatever the session has stored.
    const path = route.path.replace(/\{[^}]+\}/g, "demo-id");
    try {
      const res = await fetch(path, { headers: { "x-session-id": "explorer" } });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON - show it raw */
      }
      setResponse({ status: res.status, ms: Date.now() - started, body: pretty.slice(0, 4000) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (routes.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-200">Try a route</h2>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={`${route?.method ?? ""} ${route?.path ?? ""}`}
            onChange={(event) => setSelected(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            {routes.map((candidate) => (
              <option key={`${candidate.method} ${candidate.path}`} value={`${candidate.method} ${candidate.path}`}>
                {candidate.method} {candidate.path}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Sending..." : "Send"}
          </button>
          {route ? <span className="text-xs text-slate-500">kind: {route.kind}</span> : null}
        </div>

        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}

        {response ? (
          <div className="mt-3">
            <div className="flex items-center gap-3 text-xs">
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  response.status < 300
                    ? "bg-emerald-500/15 text-emerald-300"
                    : response.status < 500
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {response.status}
              </span>
              <span className="text-slate-500">{response.ms} ms</span>
              <span className="text-slate-600">session: explorer</span>
            </div>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
              {response.body || "(empty body)"}
            </pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
