import { useEffect, useState } from "react";
import {
  api,
  type HealthInfo,
  type RouteInfo,
  type ReloadResult,
  type ChaosConfig,
  type SessionInfo,
  type LogEvent,
  type SpecDetails,
  type ProxyConfig
} from "./api";
import { HeroBanner } from "./components/HeroBanner";
import { ResponseTimeCard } from "./components/ResponseTimeCard";
import { PlaygroundCard } from "./components/PlaygroundCard";
import { SimulationCard } from "./components/SimulationCard";
import { FigmaEndpointsCard } from "./components/FigmaEndpointsCard";
import { FigmaLiveRequestsCard } from "./components/FigmaLiveRequestsCard";
import { DataStoreCard } from "./components/DataStoreCard";
import { UploadSpecModal } from "./components/UploadSpecModal";
import { DockerCutoverModal } from "./components/DockerCutoverModal";
import { PlaygroundPanel } from "./components/PlaygroundPanel";
import { LogStream } from "./components/LogStream";
import { VisualizationsPanel } from "./components/VisualizationsPanel";
import { AuthModal } from "./components/AuthModal";
import { ForgeBotCopilot } from "./components/ForgeBotCopilot";

type NavTab = "overview" | "endpoints" | "playground" | "simulation" | "memory-transfer" | "datastore" | "logs" | "analytics";
type GatewayMode = "mock" | "hybrid" | "live";

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [chaos, setChaos] = useState<ChaosConfig | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogEvent[]>([]);
  const [specInfo, setSpecInfo] = useState<SpecDetails | null>(null);
  const [error, setError] = useState<string>("");

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDockerModalOpen, setIsDockerModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Target Server & Gateway Proxy State
  const [targetServerUrl, setTargetServerUrl] = useState("http://127.0.0.1:8080");
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>({
    enabled: false,
    targetUrl: "http://127.0.0.1:8080",
    authHeader: "",
    circuitBreaker: true
  });
  const [dismissFallbackNotice, setDismissFallbackNotice] = useState(false);

  const refreshAll = () => {
    api
      .health()
      .then(setHealth)
      .catch(() => setError("MockForge dummy server unreachable."));
    api
      .routes()
      .then(setRoutes)
      .catch(() => setError("Could not load route table."));
    api
      .chaos()
      .then(setChaos)
      .catch(() => undefined);
    api
      .sessions()
      .then(setSessions)
      .catch(() => undefined);
    api
      .spec()
      .then(setSpecInfo)
      .catch(() => undefined);
    api
      .proxyConfig()
      .then((cfg) => {
        setProxyConfig(cfg);
        if (cfg.targetUrl) setTargetServerUrl(cfg.targetUrl);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    refreshAll();
    const timer = setInterval(() => {
      api.health().then(setHealth).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleSpecLoaded = (result: ReloadResult) => {
    setSpecInfo({
      title: result.title,
      version: result.version,
      routes: result.routes,
      resources: 1,
      sourcePath: result.source ?? null
    });
    refreshAll();
  };

  // Determine active Gateway Mode
  const activeGatewayMode: GatewayMode = !proxyConfig.enabled
    ? "mock"
    : proxyConfig.circuitBreaker
    ? "hybrid"
    : "live";

  // Handle 1-Click Gateway Switcher (Question 2 Solution)
  const handleSwitchGateway = async (mode: GatewayMode) => {
    try {
      if (mode === "mock") {
        const updated = await api.updateProxy({ enabled: false });
        setProxyConfig(updated);
      } else if (mode === "hybrid") {
        const updated = await api.updateProxy({
          enabled: true,
          circuitBreaker: true,
          targetUrl: targetServerUrl
        });
        setProxyConfig(updated);
      } else {
        const updated = await api.updateProxy({
          enabled: true,
          circuitBreaker: false,
          targetUrl: targetServerUrl
        });
        setProxyConfig(updated);
      }
    } catch {
      setError("Failed to switch gateway mode.");
    }
  };

  // Check if circuit breaker fallback triggered in recent logs (Question 1 Solution)
  const hasFallbackActive =
    !dismissFallbackNotice &&
    liveLogs.slice(0, 10).some((l) => l.fallback || l.source === "mock-fallback");

  return (
    <div className="min-h-screen bg-[#f6f6f2] text-slate-800 flex flex-col font-sans">
      {/* Upload Spec Modal */}
      <UploadSpecModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSpecLoaded={handleSpecLoaded}
      />

      {/* Docker Handoff & Cutover Modal */}
      <DockerCutoverModal
        isOpen={isDockerModalOpen}
        onClose={() => {
          setIsDockerModalOpen(false);
          api.proxyConfig().then(setProxyConfig).catch(() => undefined);
        }}
        currentTargetUrl={targetServerUrl}
        onTargetChanged={(newUrl) => {
          setTargetServerUrl(newUrl);
          api.proxyConfig().then(setProxyConfig).catch(() => undefined);
        }}
      />

      {/* Auth & Authorization Shield Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Figma Top Navigation Bar */}
      <header className="border-b border-[#e5e7df] bg-white sticky top-0 z-40 shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          {/* Left Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f3d2e] text-white font-bold text-sm shadow-sm">
              M
            </div>
            <span className="text-base font-extrabold text-slate-900 tracking-tight">MockForge</span>
            <span className="text-[10px] font-mono font-bold text-emerald-900 bg-emerald-100 rounded px-1.5 py-0.5 border border-emerald-300">
              v3 Figma
            </span>
          </div>

          {/* Center Navigation Pills */}
          <nav className="flex items-center rounded-xl bg-[#f1f2ec] p-1 text-xs font-semibold border border-[#e5e7df]">
            {(
              [
                { id: "overview", label: "Overview" },
                { id: "endpoints", label: "Endpoints" },
                { id: "playground", label: "Playground" },
                { id: "simulation", label: "Simulation" },
                { id: "memory-transfer", label: "⚡ Memory Transfer" },
                { id: "logs", label: "Logs" },
                { id: "analytics", label: "Analytics" }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as NavTab)}
                className={`rounded-lg px-3.5 py-1.5 transition-all ${
                  activeTab === tab.id || (tab.id === "memory-transfer" && activeTab === "datastore")
                    ? "bg-[#0f3d2e] text-white shadow-sm font-bold"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3">
            {/* Interactive 3-Way Gateway Switcher (Question 2 Solution) */}
            <div
              className="flex items-center rounded-full bg-[#f1f2ec] p-0.5 border border-[#e2e4dc] text-[11px] font-mono shadow-xs"
              title="Instant 1-Click Gateway Switcher: Toggle between pure mock, hybrid bridge with circuit breaker, and live backend proxy"
            >
              <button
                type="button"
                onClick={() => handleSwitchGateway("mock")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all font-semibold ${
                  activeGatewayMode === "mock"
                    ? "bg-amber-100 text-amber-900 font-bold shadow-xs border border-amber-300"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🟡</span>
                <span>Mock (:3000)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchGateway("hybrid")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all font-semibold ${
                  activeGatewayMode === "hybrid"
                    ? "bg-emerald-700 text-white font-bold shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>⚡</span>
                <span>Hybrid</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchGateway("live")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all font-semibold ${
                  activeGatewayMode === "live"
                    ? "bg-emerald-100 text-emerald-900 font-bold shadow-xs border border-emerald-300"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🟢</span>
                <span>Real (:8080)</span>
              </button>
            </div>

            {/* Memory Transfer Action Trigger */}
            <button
              type="button"
              onClick={() => setActiveTab("memory-transfer")}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                activeTab === "memory-transfer"
                  ? "border-[#0f3d2e] bg-[#0f3d2e] text-white"
                  : "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[#0f3d2e]"
              }`}
              title="Open Live Container Database Memory Transfer Studio"
            >
              <span>⚡</span>
              <span className="hidden sm:inline">Memory Transfer</span>
            </button>

            {/* Handshake & Bridge Modal Trigger */}
            <button
              type="button"
              onClick={() => setIsDockerModalOpen(true)}
              className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 text-xs font-semibold transition-all flex items-center gap-1 shadow-xs"
              title="Automated 4-Stage Handshake and Dual Memory Inspector Modal"
            >
              <span>🤝</span>
              <span className="hidden sm:inline">Modal</span>
            </button>

            {/* Security & Auth Modal Trigger */}
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="rounded-xl border border-[#e5e7df] bg-[#f1f2ec] hover:bg-[#e5e7dd] text-slate-800 px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              title="Configure Mock Authentication Enforcement & Injected Credentials"
            >
              <span>🔐</span>
              <span className="hidden sm:inline">Auth</span>
            </button>

            {/* New Mock Button */}
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="btn-figma-primary px-3.5 py-1.5 text-xs flex items-center gap-1.5"
            >
              <span>+</span>
              <span>New mock</span>
            </button>

            {/* User Avatar Circle */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f3d2e] text-white font-bold text-xs shadow-xs">
              VK
            </div>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="mx-auto max-w-7xl flex-1 space-y-6 px-6 py-6 w-full">
        {/* Circuit Breaker Notification Chip / Banner (Question 1 Solution) */}
        {hasFallbackActive && (
          <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm animate-in fade-in duration-200 font-medium">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">⚠️</span>
              <div>
                <strong className="font-bold text-amber-950">Backend Unreachable — Temporary Mock Fallback Active (Zero Frontend Crashes):</strong>
                <span className="ml-1 text-amber-900">
                  MockForge detected real backend container offline/timeout and smoothly served cached mock data with header{" "}
                  <code className="rounded bg-amber-200/80 px-1 py-0.5 font-mono font-bold text-amber-950 text-[11px]">
                    X-MockForge-Fallback: true
                  </code>
                  . As soon as your backend restarts, traffic resumes without UI disruption.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissFallbackNotice(true)}
              className="rounded-lg hover:bg-amber-100 p-1 text-amber-800 hover:text-amber-950 transition-colors ml-4 text-xs font-bold"
            >
              ✕ Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-mono">
            {error}
          </div>
        )}

        {/* TAB 1: OVERVIEW (The exact Figma layout) */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* 1. Hero Live Banner with Stepper and Circular Gauge */}
            <HeroBanner spec={specInfo} health={health} routesCount={routes.length} />

            {/* 2. Middle Row: 3 Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <ResponseTimeCard logs={liveLogs} chaos={chaos} />
              <PlaygroundCard routes={routes} />
              <SimulationCard chaos={chaos} onChaosUpdated={(c) => setChaos(c)} />
            </div>

            {/* 3. Bottom Row: 2 Cards */}
            <div className="grid gap-6 lg:grid-cols-2">
              <FigmaEndpointsCard
                routes={routes}
                onSelectRoute={() => setActiveTab("playground")}
              />
              <FigmaLiveRequestsCard logs={liveLogs} />
            </div>
          </div>
        )}

        {/* TAB 2: ENDPOINTS */}
        {activeTab === "endpoints" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <FigmaEndpointsCard
              routes={routes}
              onSelectRoute={() => setActiveTab("playground")}
            />
            <PlaygroundCard routes={routes} />
          </div>
        )}

        {/* TAB 3: PLAYGROUND */}
        {activeTab === "playground" && (
          <div className="animate-in fade-in duration-150">
            <PlaygroundPanel routes={routes} />
          </div>
        )}

        {/* TAB 4: SIMULATION */}
        {activeTab === "simulation" && (
          <div className="grid gap-6 lg:grid-cols-2 animate-in fade-in duration-150">
            <SimulationCard chaos={chaos} onChaosUpdated={(c) => setChaos(c)} />
            <ResponseTimeCard logs={liveLogs} chaos={chaos} />
          </div>
        )}

        {/* TAB 5: MEMORY TRANSFER / DATA STORE */}
        {(activeTab === "memory-transfer" || activeTab === "datastore") && (
          <div className="animate-in fade-in duration-150">
            <DataStoreCard
              sessions={sessions}
              routesCount={routes.length}
              currentTargetUrl={targetServerUrl}
              onProxyUpdated={(cfg) => setProxyConfig(cfg)}
              onSessionRefresh={() => refreshAll()}
            />
          </div>
        )}

        {/* TAB 6: LOGS */}
        {activeTab === "logs" && (
          <div className="animate-in fade-in duration-150">
            <LogStream onEventsChange={setLiveLogs} />
          </div>
        )}

        {/* TAB 7: ANALYTICS / VISUALIZATIONS */}
        {activeTab === "analytics" && (
          <div className="animate-in fade-in duration-150">
            <VisualizationsPanel
              routes={routes}
              health={health}
              chaos={chaos}
              logs={liveLogs}
              sessions={sessions}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e5e7df] bg-white px-6 py-4 text-xs text-slate-600 font-sans shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#0f3d2e]" />
            <span className="font-bold text-slate-900">MockForge v3</span>
            <span>• Spec-driven Mock REST Server & Live Gateway Bridge</span>
          </div>
          <div className="flex items-center gap-4 text-slate-700 font-medium">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="hover:text-[#0f3d2e] transition-colors font-semibold"
            >
              Upload Spec
            </button>
            <button
              onClick={() => setIsDockerModalOpen(true)}
              className="hover:text-[#0f3d2e] transition-colors font-semibold"
            >
              Handshake Bridge
            </button>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="hover:text-[#0f3d2e] transition-colors font-semibold"
            >
              Auth Shield
            </button>
            <button
              onClick={() => setActiveTab("playground")}
              className="hover:text-[#0f3d2e] transition-colors font-semibold"
            >
              Playground
            </button>
          </div>
        </div>
      </footer>
      {/* ForgeBot Autonomous AI Copilot */}
      <ForgeBotCopilot
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        proxyConfig={proxyConfig}
        onProxyChange={(cfg) => setProxyConfig(cfg)}
        chaos={chaos}
        onChaosChange={(c) => setChaos(c)}
        targetServerUrl={targetServerUrl}
        onTargetServerUrlChange={(url) => setTargetServerUrl(url)}
        routes={routes}
        onRefreshAll={refreshAll}
      />
    </div>
  );
}
