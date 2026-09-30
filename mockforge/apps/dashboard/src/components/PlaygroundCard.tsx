import { useState, useEffect } from "react";
import type { RouteInfo } from "../api";

interface PlaygroundCardProps {
  routes: RouteInfo[];
}

export function PlaygroundCard({ routes }: PlaygroundCardProps) {
  const [selectedRoute, setSelectedRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    sizeBytes: number;
    data: unknown;
  } | null>(null);

  useEffect(() => {
    if (routes.length > 0 && !selectedRoute) {
      setSelectedRoute(routes[0]!);
    }
  }, [routes, selectedRoute]);

  const handleSend = async () => {
    if (!selectedRoute) return;
    setLoading(true);
    const start = performance.now();

    try {
      const isMutation = ["POST", "PUT", "PATCH"].includes(selectedRoute.method);
      const res = await fetch(selectedRoute.path, {
        method: selectedRoute.method,
        headers: {
          Accept: "application/json",
          ...(isMutation ? { "Content-Type": "application/json" } : {})
        },
        body: isMutation
          ? JSON.stringify({
              title: "Created via Playground",
              priority: "high",
              done: false
            })
          : undefined
      });

      const durationMs = Math.round(performance.now() - start);
      let data: unknown = null;
      let sizeBytes = 0;
      try {
        const text = await res.text();
        sizeBytes = new Blob([text]).size;
        data = JSON.parse(text);
      } catch {
        data = { message: "No JSON payload returned" };
      }

      setResponse({
        status: res.status,
        statusText: res.statusText || (res.status === 200 ? "OK" : "Created"),
        durationMs,
        sizeBytes,
        data
      });
    } catch {
      setResponse({
        status: 500,
        statusText: "Error",
        durationMs: Math.round(performance.now() - start),
        sizeBytes: 0,
        data: { error: "Failed to connect to mock" }
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-figma p-5 flex flex-col justify-between space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">API playground</h3>
        <p className="text-[11px] text-slate-500 font-medium">Send a real request to your mock</p>
      </div>

      {/* Request Row */}
      <div className="flex items-center gap-2">
        <select
          value={selectedRoute ? `${selectedRoute.method} ${selectedRoute.path}` : ""}
          onChange={(e) => {
            const [m, p] = e.target.value.split(" ");
            const found = routes.find((r) => r.method === m && r.path === p);
            if (found) setSelectedRoute(found);
          }}
          className="flex-1 rounded-xl border border-slate-200 bg-[#f9fafb] px-3 py-2 text-xs font-mono font-medium text-slate-800 focus:bg-white focus:border-[#0f3d2e] focus:outline-none truncate"
        >
          {routes.map((r) => (
            <option key={`${r.method} ${r.path}`} value={`${r.method} ${r.path}`}>
              {r.method} {r.path}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !selectedRoute}
          className="btn-figma-primary px-4 py-2 text-xs font-bold shrink-0 disabled:opacity-50"
        >
          {loading ? "..." : "Send ➔"}
        </button>
      </div>

      {/* Response Status Pill */}
      {response ? (
        <div className="flex items-center gap-2 text-xs font-mono">
          <span
            className={`rounded-full px-2.5 py-0.5 font-bold ${
              response.status < 300
                ? "bg-emerald-100 text-emerald-800"
                : response.status < 500
                ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800"
            }`}
          >
            ● {response.status} {response.statusText}
          </span>
          <span className="text-slate-500 text-[11px]">{response.durationMs} ms</span>
          <span className="text-slate-400 text-[11px]">•</span>
          <span className="text-slate-500 text-[11px]">{response.sizeBytes} B</span>
        </div>
      ) : (
        <div className="text-[11px] font-mono text-slate-400">
          Click Send to inspect live output.
        </div>
      )}

      {/* JSON Code block */}
      <div className="rounded-xl border border-slate-200 bg-[#f8f9fa] p-3 text-xs font-mono text-slate-800 max-h-36 overflow-y-auto leading-relaxed">
        <pre className="text-[11px]">
          {response
            ? JSON.stringify(response.data, null, 2).slice(0, 1500)
            : `{\n  "status": "ready",\n  "hint": "Click Send ➔ to test this endpoint live"\n}`}
        </pre>
      </div>

      {/* Footer Info Note */}
      <div className="text-[10px] text-slate-500 font-medium">
        Stateful in-memory CRUD: mutations update the mock database in real time.
      </div>
    </div>
  );
}
