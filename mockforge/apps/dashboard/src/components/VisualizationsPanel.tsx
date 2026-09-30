import { useMemo } from "react";
import type { RouteInfo, HealthInfo, ChaosConfig, LogEvent, SessionInfo } from "../api";

interface VisualizationsPanelProps {
  routes: RouteInfo[];
  health: HealthInfo | null;
  chaos: ChaosConfig | null;
  logs: LogEvent[];
  sessions: SessionInfo[];
}

export function VisualizationsPanel({
  routes,
  health,
  chaos,
  logs,
  sessions
}: VisualizationsPanelProps) {
  // 1. Method distribution with Figma v3 colors
  const methodStats = useMemo(() => {
    const counts: Record<string, number> = { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0 };
    routes.forEach((r) => {
      const m = r.method.toUpperCase();
      counts[m] = (counts[m] ?? 0) + 1;
    });
    const total = routes.length || 1;
    return Object.entries(counts).map(([method, count]) => ({
      method,
      count,
      percent: Math.round((count / total) * 100)
    }));
  }, [routes]);

  // 2. Status code breakdown from logs
  const statusStats = useMemo(() => {
    let s2xx = 0;
    let s4xx = 0;
    let s5xx = 0;
    logs.forEach((l) => {
      if (l.status >= 500) s5xx++;
      else if (l.status >= 400) s4xx++;
      else s2xx++;
    });
    const total = logs.length || 1;
    return {
      s2xx: { count: s2xx, percent: Math.round((s2xx / total) * 100) },
      s4xx: { count: s4xx, percent: Math.round((s4xx / total) * 100) },
      s5xx: { count: s5xx, percent: Math.round((s5xx / total) * 100) },
      totalLogs: logs.length
    };
  }, [logs]);

  // 3. Provenance Origin breakdown (Proxied vs Mocked vs Fallback)
  const originStats = useMemo(() => {
    let proxied = 0;
    let mocked = 0;
    let fallback = 0;
    logs.forEach((l) => {
      if (l.source === "real-backend") proxied++;
      else if (l.fallback || l.source === "mock-fallback") fallback++;
      else mocked++;
    });
    const total = logs.length || 1;
    return {
      proxied: { count: proxied, percent: Math.round((proxied / total) * 100) },
      mocked: { count: mocked, percent: Math.round((mocked / total) * 100) },
      fallback: { count: fallback, percent: Math.round((fallback / total) * 100) }
    };
  }, [logs]);

  // 4. Average and peak latency from recent logs
  const latencyStats = useMemo(() => {
    if (logs.length === 0) return { avg: 0, max: 0, min: 0, history: [] };
    const values = logs.map((l) => l.latencyMs);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const history = logs.slice(0, 24).reverse().map((l) => l.latencyMs);
    return { avg, max, min, history };
  }, [logs]);

  // 5. Resource clustering
  const resourceStats = useMemo(() => {
    const map = new Map<string, number>();
    routes.forEach((r) => {
      const res = r.resource || "unclassified";
      map.set(res, (map.get(res) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([resource, count]) => ({
      resource,
      count
    }));
  }, [routes]);

  // Sparkline SVG path generator
  const sparklinePath = useMemo(() => {
    const data = latencyStats.history;
    if (data.length < 2) return "";
    const width = 360;
    const height = 70;
    const maxVal = Math.max(...data, 50);
    const step = width / (data.length - 1);

    const points = data.map((val, idx) => {
      const x = idx * step;
      const y = height - (val / maxVal) * (height - 10) - 5;
      return `${x},${y}`;
    });

    return `M ${points.join(" L ")}`;
  }, [latencyStats.history]);

  return (
    <div className="space-y-6">
      {/* Top Banner Metrics Cards - Rich Figma Theme with High Contrast */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Latency Average */}
        <div className="card-figma p-5 bg-white border border-[#e5e7df] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Avg Response Time
            </span>
            <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              Live Fastify
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900">
              {latencyStats.avg}
            </span>
            <span className="text-xs font-mono text-slate-600 font-semibold">ms</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 font-medium">
            Boot: <strong className="text-slate-800 font-mono">{health?.bootMs ?? 0} ms</strong> • Faults: <strong className="text-amber-800 font-mono">{chaos ? `${Math.round(chaos.errorRate * 100)}%` : "0%"}</strong>
          </p>
        </div>

        {/* Throughput & Sessions */}
        <div className="card-figma p-5 bg-white border border-[#e5e7df] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Traffic & Sessions
            </span>
            <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              Active RAM
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tracking-tight text-[#0f3d2e]">
              {logs.length}
            </span>
            <span className="text-xs font-mono text-slate-600 font-semibold">events</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 font-medium">
            <strong className="text-slate-800 font-mono">{sessions.length}</strong> isolated user sessions in RAM
          </p>
        </div>

        {/* Success Rate */}
        <div className="card-figma p-5 bg-white border border-[#e5e7df] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Success Ratio (2xx)
            </span>
            <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              Health
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tracking-tight text-emerald-800">
              {logs.length > 0 ? `${statusStats.s2xx.percent}%` : "100%"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 font-medium">
            <strong className="text-slate-800 font-mono">{statusStats.s2xx.count}</strong> successful HTTP responses
          </p>
        </div>

        {/* Provenance Origin Ratio */}
        <div className="card-figma p-5 bg-white border border-[#e5e7df] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Gateway Provenance
            </span>
            <span className="rounded-full bg-[#f1f2ec] border border-[#e5e7df] px-2 py-0.5 text-[10px] font-bold text-[#0f3d2e]">
              Transparency
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900">
              {originStats.proxied.percent}%
            </span>
            <span className="text-xs font-mono text-slate-600 font-semibold">proxied</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 font-medium">
            <strong className="text-emerald-800 font-mono">{originStats.proxied.count}</strong> backend • <strong className="text-slate-800 font-mono">{originStats.mocked.count}</strong> mocked
          </p>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Latency Timeline Sparkline */}
        <div className="card-figma p-6 space-y-4 bg-white border border-[#e5e7df] shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e5e7df] pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#0f3d2e]"></span>
                Latency Fluctuation Waveform
              </h3>
              <p className="text-xs text-slate-600 font-medium">Real-time response time across last 24 live Fastify requests</p>
            </div>
            <span className="font-mono text-xs font-semibold text-[#0f3d2e] bg-[#f1f2ec] px-2.5 py-1 rounded-lg border border-[#e5e7df]">
              Last 24 events
            </span>
          </div>

          <div className="relative h-28 w-full rounded-xl bg-[#f6f6f2] p-2 border border-[#e5e7df] flex items-center justify-center overflow-hidden">
            {latencyStats.history.length >= 2 ? (
              <svg className="w-full h-full overflow-visible" viewBox="0 0 360 70" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="latencyGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f3d2e" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#0f3d2e" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={`${sparklinePath} L 360,70 L 0,70 Z`} fill="url(#latencyGlow)" />
                <path d={sparklinePath} fill="none" stroke="#0f3d2e" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <span className="text-xs font-mono text-slate-500 font-semibold">
                Awaiting incoming requests to plot waveform...
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs font-mono font-semibold text-slate-600">
            <div>0 ms</div>
            <div>Avg: {latencyStats.avg} ms</div>
            <div>Peak: {latencyStats.max} ms</div>
          </div>
        </div>

        {/* HTTP Status Code Distribution */}
        <div className="card-figma p-6 space-y-4 bg-white border border-[#e5e7df] shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e5e7df] pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
                Response Code Composition
              </h3>
              <p className="text-xs text-slate-600 font-medium">Proportional breakdown of HTTP outcomes across traffic</p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-700 bg-[#f1f2ec] px-2.5 py-1 rounded-lg border border-[#e5e7df]">
              {logs.length} logged
            </span>
          </div>

          {/* Segmented bar */}
          <div className="h-6 w-full rounded-xl bg-[#f1f2ec] border border-[#e5e7df] flex overflow-hidden p-0.5">
            {logs.length === 0 ? (
              <div className="h-full w-full bg-slate-200/60 rounded-lg flex items-center justify-center text-xs text-slate-600 font-mono font-semibold">
                No traffic recorded yet
              </div>
            ) : (
              <>
                <div
                  style={{ width: `${statusStats.s2xx.percent}%` }}
                  className="bg-[#0f3d2e] h-full rounded-l-lg transition-all duration-300"
                  title={`2xx: ${statusStats.s2xx.count}`}
                />
                <div
                  style={{ width: `${statusStats.s4xx.percent}%` }}
                  className="bg-amber-600 h-full transition-all duration-300"
                  title={`4xx: ${statusStats.s4xx.count}`}
                />
                <div
                  style={{ width: `${statusStats.s5xx.percent}%` }}
                  className="bg-rose-600 h-full rounded-r-lg transition-all duration-300"
                  title={`5xx: ${statusStats.s5xx.count}`}
                />
              </>
            )}
          </div>

          {/* Legend Boxes - High Contrast Cards */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-[#e5e7df] bg-[#f6f6f2] p-3 shadow-xs">
              <span className="font-mono text-xl font-extrabold text-[#0f3d2e]">{statusStats.s2xx.count}</span>
              <p className="text-xs text-slate-800 font-bold mt-0.5">2xx Success</p>
              <p className="font-mono text-[11px] text-slate-600 font-semibold">{statusStats.s2xx.percent}%</p>
            </div>
            <div className="rounded-xl border border-[#e5e7df] bg-[#f6f6f2] p-3 shadow-xs">
              <span className="font-mono text-xl font-extrabold text-amber-700">{statusStats.s4xx.count}</span>
              <p className="text-xs text-slate-800 font-bold mt-0.5">4xx Client Error</p>
              <p className="font-mono text-[11px] text-slate-600 font-semibold">{statusStats.s4xx.percent}%</p>
            </div>
            <div className="rounded-xl border border-[#e5e7df] bg-[#f6f6f2] p-3 shadow-xs">
              <span className="font-mono text-xl font-extrabold text-rose-700">{statusStats.s5xx.count}</span>
              <p className="text-xs text-slate-800 font-bold mt-0.5">5xx Faults</p>
              <p className="font-mono text-[11px] text-slate-600 font-semibold">{statusStats.s5xx.percent}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Methods and Resource Clusters */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Method Distribution */}
        <div className="card-figma p-6 space-y-3 bg-white border border-[#e5e7df] shadow-sm">
          <div className="border-b border-[#e5e7df] pb-3">
            <h3 className="text-sm font-bold text-slate-900">HTTP Methods Breakdown</h3>
            <p className="text-xs text-slate-600 font-medium">Registered operations in the active OpenAPI specification</p>
          </div>

          <div className="space-y-3 pt-2">
            {methodStats.map(({ method, count, percent }) => {
              const barColor =
                method === "GET"
                  ? "bg-[#0f3d2e]"
                  : method === "POST"
                  ? "bg-emerald-600"
                  : method === "DELETE"
                  ? "bg-rose-600"
                  : "bg-amber-600";

              return (
                <div key={method} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-slate-900">{method}</span>
                    <span className="text-slate-600 font-semibold">
                      {count} routes ({percent}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#f1f2ec] overflow-hidden border border-[#e5e7df]">
                    <div
                      style={{ width: `${percent}%` }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resources Cluster */}
        <div className="card-figma p-6 space-y-3 bg-white border border-[#e5e7df] shadow-sm">
          <div className="border-b border-[#e5e7df] pb-3">
            <h3 className="text-sm font-bold text-slate-900">Discovered In-Memory Resources</h3>
            <p className="text-xs text-slate-600 font-medium">Inferred data entities backed by isolated stateful CRUD stores</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {resourceStats.map(({ resource, count }) => (
              <div
                key={resource}
                className="rounded-xl border border-[#e5e7df] bg-[#f6f6f2] p-3.5 flex items-center justify-between hover:border-[#0f3d2e] hover:bg-white transition-all shadow-xs"
              >
                <div>
                  <span className="text-xs font-bold text-slate-900 capitalize">
                    {resource}
                  </span>
                  <p className="text-[11px] font-mono text-slate-500 font-semibold">In-memory Store</p>
                </div>
                <span className="rounded-lg bg-[#0f3d2e] text-white px-2.5 py-1 text-xs font-mono font-bold shadow-xs">
                  {count} routes
                </span>
              </div>
            ))}

            {resourceStats.length === 0 && (
              <div className="col-span-2 py-6 text-center text-xs text-slate-500 font-mono">
                No resources registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
