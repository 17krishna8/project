import { useState, useMemo } from "react";
import type { RouteInfo } from "../api";

interface RoutesTableProps {
  routes: RouteInfo[];
  onSelectRouteForTesting?: (route: RouteInfo) => void;
}

const METHOD_TONES: Record<string, string> = {
  GET: "bg-phosphor-cyan/15 text-phosphor-cyan border-phosphor-cyan/30",
  POST: "bg-phosphor-green/15 text-phosphor-green border-phosphor-green/30",
  PUT: "bg-phosphor-amber/15 text-phosphor-amber border-phosphor-amber/30",
  PATCH: "bg-signal-500/15 text-signal-400 border-signal-500/30",
  DELETE: "bg-phosphor-crimson/15 text-phosphor-crimson border-phosphor-crimson/30"
};

export function RoutesTable({ routes, onSelectRouteForTesting }: RoutesTableProps) {
  const [filter, setFilter] = useState("");
  const [method, setMethod] = useState("ALL");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return routes.filter((r) => {
      const matchFilter =
        r.path.toLowerCase().includes(filter.toLowerCase()) ||
        (r.resource && r.resource.toLowerCase().includes(filter.toLowerCase()));
      const matchMethod = method === "ALL" || r.method === method;
      return matchFilter && matchMethod;
    });
  }, [routes, filter, method]);

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(`http://127.0.0.1:3000${path}`);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  return (
    <div className="card-tactical overflow-hidden">
      {/* Table controls */}
      <div className="p-3.5 border-b border-slate-800/80 bg-obsidian-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by path or resource..."
            className="w-full rounded-lg border border-slate-800 bg-obsidian-900 px-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-signal-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-mono">
          {["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded px-2 py-1 font-semibold transition-colors ${
                method === m
                  ? "bg-signal-500 text-white shadow-sm"
                  : "bg-slate-800/50 text-slate-400 hover:bg-slate-800"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-obsidian-950 text-[10px] font-mono uppercase tracking-wider text-slate-400 sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2.5 font-medium">Method</th>
              <th className="px-4 py-2.5 font-medium">Endpoint Path</th>
              <th className="px-4 py-2.5 font-medium">Operation</th>
              <th className="px-4 py-2.5 font-medium">Resource Store</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 font-mono text-xs">
            {filtered.map((route) => (
              <tr key={`${route.method} ${route.path}`} className="hover:bg-slate-800/20 transition-colors">
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                      METHOD_TONES[route.method] ?? "bg-slate-800 text-slate-300 border-slate-700"
                    }`}
                  >
                    {route.method}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-200">
                  <span className="font-semibold">{route.path}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-400 capitalize">{route.kind}</td>
                <td className="px-4 py-2.5 text-slate-400">
                  {route.resource ? (
                    <span className="rounded bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-300">
                      {route.resource}
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleCopyPath(route.path)}
                    className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {copiedPath === route.path ? "✓ Copied" : "Copy URL"}
                  </button>

                  {onSelectRouteForTesting && (
                    <button
                      type="button"
                      onClick={() => onSelectRouteForTesting(route)}
                      className="rounded bg-signal-500/15 text-signal-400 border border-signal-500/30 px-2 py-1 text-[10px] font-semibold hover:bg-signal-500/25 transition-colors"
                    >
                      Run ➔
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 font-mono text-xs">
                  No matching endpoints.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
