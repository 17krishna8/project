import { useState, useMemo } from "react";
import type { RouteInfo } from "../api";

interface FigmaEndpointsCardProps {
  routes: RouteInfo[];
  onSelectRoute?: (route: RouteInfo) => void;
}

const METHOD_BADGES: Record<string, { bg: string; text: string }> = {
  GET: { bg: "bg-[#e0f2fe]", text: "text-[#0369a1]" },
  POST: { bg: "bg-[#dcfce7]", text: "text-[#15803d]" },
  PUT: { bg: "bg-[#fef3c7]", text: "text-[#b45309]" },
  PATCH: { bg: "bg-[#ffedd5]", text: "text-[#c2410c]" },
  DELETE: { bg: "bg-[#ffe4e6]", text: "text-[#be123c]" }
};

export function FigmaEndpointsCard({ routes, onSelectRoute }: FigmaEndpointsCardProps) {
  const [filterMethod, setFilterMethod] = useState("ALL");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    let list = routes;
    if (filterMethod !== "ALL") {
      list = list.filter((r) => r.method === filterMethod);
    }
    return showAll ? list : list.slice(0, 6);
  }, [routes, filterMethod, showAll]);

  // Compute a descriptive label from route
  const getRouteDescription = (route: RouteInfo): string => {
    const res = route.resource ?? "record";
    switch (route.kind) {
      case "list":
        return `List all ${res}s`;
      case "create":
        return `Create a ${res}`;
      case "read":
        return `Get a ${res} by ID`;
      case "update":
        return `Update a ${res}`;
      case "remove":
        return `Delete a ${res}`;
      default:
        return `Handle ${route.method} ${route.path}`;
    }
  };

  return (
    <div className="card-figma p-5 flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Endpoints</h3>
            <span className="rounded-full bg-[#f1f2ec] px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600">
              {routes.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {routes.length} routes generated from your spec
          </p>
        </div>

        {/* Action and Filter Pills */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-[#f1f2ec] p-0.5 text-[10px] font-mono">
            {["ALL", "GET", "POST", "PUT", "DELETE"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFilterMethod(m)}
                className={`rounded px-2 py-0.5 font-semibold transition-all ${
                  filterMethod === m
                    ? "bg-[#0f3d2e] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] font-bold text-[#0f3d2e] hover:underline shrink-0"
          >
            {showAll ? "Show less" : `View all ${routes.length}`}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 pb-2">
            <tr>
              <th className="py-2 pr-3 font-semibold">Method</th>
              <th className="py-2 pr-3 font-semibold">Path</th>
              <th className="py-2 pr-3 font-semibold">Description</th>
              <th className="py-2 pr-3 font-semibold">Avg latency</th>
              <th className="py-2 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {filtered.map((route, i) => {
              const badge = METHOD_BADGES[route.method] ?? { bg: "bg-slate-100", text: "text-slate-800" };
              const mockLatency = 220 + ((i * 47) % 210);

              return (
                <tr
                  key={`${route.method} ${route.path}`}
                  onClick={() => onSelectRoute && onSelectRoute(route)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-3">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                      {route.method}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-bold text-slate-800">{route.path}</td>
                  <td className="py-2.5 pr-3 text-slate-500 font-sans text-xs">
                    {getRouteDescription(route)}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span>{mockLatency} ms</span>
                      <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, (mockLatency / 500) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-sans font-semibold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      Active
                    </span>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400 font-mono text-xs">
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
