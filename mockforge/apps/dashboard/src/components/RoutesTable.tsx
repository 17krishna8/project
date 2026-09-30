import type { RouteInfo } from "../api";

const METHOD_TONES: Record<string, string> = {
  GET: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  POST: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PUT: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  DELETE: "bg-rose-500/15 text-rose-300 border-rose-500/30"
};

export function RoutesTable({ routes }: { routes: RouteInfo[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Method</th>
            <th className="px-4 py-2 font-medium">Path</th>
            <th className="px-4 py-2 font-medium">Kind</th>
            <th className="px-4 py-2 font-medium">Resource</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {routes.map((route) => (
            <tr key={`${route.method} ${route.path}`} className="hover:bg-slate-800/30">
              <td className="px-4 py-2">
                <span
                  className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                    METHOD_TONES[route.method] ?? "bg-slate-700/30 text-slate-300 border-slate-600/40"
                  }`}
                >
                  {route.method}
                </span>
              </td>
              <td className="px-4 py-2 font-mono text-slate-200">{route.path}</td>
              <td className="px-4 py-2 text-slate-400">{route.kind}</td>
              <td className="px-4 py-2 text-slate-400">{route.resource ?? "-"}</td>
            </tr>
          ))}
          {routes.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                No routes loaded.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
