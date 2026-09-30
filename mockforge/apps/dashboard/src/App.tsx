import { useEffect, useState } from "react";
import { api, formatDuration, type HealthInfo, type RouteInfo } from "./api";
import { StatCard } from "./components/StatCard";
import { RoutesTable } from "./components/RoutesTable";
import { ChaosPanel } from "./components/ChaosPanel";
import { SessionsPanel } from "./components/SessionsPanel";
import { LogStream } from "./components/LogStream";

export default function App() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const timer = setInterval(() => {
      api
        .health()
        .then(setHealth)
        .catch(() => setError("The mock server stopped answering /__health."));
    }, 2000);
    api.health().then(setHealth).catch(() => undefined);
    api.routes().then(setRoutes).catch(() => setError("Could not load the route table."));
    return () => clearInterval(timer);
  }, []);

  const spec = typeof __MOCKFORGE_SPEC__ === "object" ? __MOCKFORGE_SPEC__ : null;
  const uptime = health ? formatDuration(health.uptimeMs) : "-";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">MockForge Dashboard</h1>
            <p className="text-xs text-slate-500">
              {spec ? `${spec.title} v${spec.version}` : "Serving this API from its OpenAPI spec"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                health?.status === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
              }`}
            >
              {health?.status === "ok" ? "healthy" : "unreachable"}
            </span>
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
              {spec?.version ?? ""} {health ? `${health.routes} routes` : ""}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Routes" value={String(health?.routes ?? routes.length)} hint="from the loaded spec" />
          <StatCard label="Sessions" value={String(health?.sessions ?? 0)} hint="active in memory" />
          <StatCard label="Uptime" value={uptime} hint={`boot ${health?.bootMs ?? 0} ms`} />
          <StatCard
            label="Mode"
            value={document.querySelector("meta[name=mockforge-mode]")?.getAttribute("content") ?? "dev"}
            hint="dev validates every response"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-200">Routes</h2>
              <RoutesTable routes={routes} />
            </section>
            <LogStream />
          </div>
          <div className="space-y-6">
            <ChaosPanel />
            <SessionsPanel />
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-8 text-xs text-slate-600">
        MockForge - a spec-driven mock REST server. Chaos, sessions and logs are live.
      </footer>
    </div>
  );
}
