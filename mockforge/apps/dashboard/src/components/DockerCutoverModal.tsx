import { useEffect, useState } from "react";
import {
  api,
  type DockerInfo,
  type HandshakeResult,
  type DualMemoryState,
  type ProxyConfig
} from "../api";

interface DockerCutoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTargetUrl: string;
  onTargetChanged: (newTargetUrl: string) => void;
}

type ModalTab = "handshake" | "dual-memory" | "docker";

export function DockerCutoverModal({
  isOpen,
  onClose,
  currentTargetUrl,
  onTargetChanged
}: DockerCutoverModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>("handshake");
  const [targetUrl, setTargetUrl] = useState(currentTargetUrl || "http://127.0.0.1:8080");
  const [sessionId, setSessionId] = useState("default");
  const [authHeader, setAuthHeader] = useState("");
  const [strategy, setStrategy] = useState<"upsert" | "append" | "clean_sync">("upsert");
  const [autoProxy, setAutoProxy] = useState(true);
  const [stopDummy, setStopDummy] = useState(false);

  // Live telemetry & state
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | null>(null);
  const [handshakeResult, setHandshakeResult] = useState<HandshakeResult | null>(null);
  const [dualMemory, setDualMemory] = useState<DualMemoryState | null>(null);

  // Probing & execution
  const [probing, setProbing] = useState(false);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const [backendLatency, setBackendLatency] = useState<number | null>(null);
  const [executing, setExecuting] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCompose, setCopiedCompose] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }
    api.dockerInfo().then(setDockerInfo).catch(() => undefined);
    api.proxyConfig().then(setProxyConfig).catch(() => undefined);
    checkBackendHealth();
    fetchDualMemory();
  }, [isOpen]);

  const checkBackendHealth = async () => {
    setProbing(true);
    setBackendReady(null);
    try {
      const probeStart = performance.now();
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(2500) });
      const latency = Math.round(performance.now() - probeStart);
      setBackendLatency(latency);
      setBackendReady(res.status < 500);
    } catch {
      setBackendReady(false);
      setBackendLatency(null);
    } finally {
      setProbing(false);
    }
  };

  const fetchDualMemory = async () => {
    setMemoryLoading(true);
    try {
      const state = await api.dualMemory(targetUrl, sessionId);
      setDualMemory(state);
    } catch {
      /* ignore */
    } finally {
      setMemoryLoading(false);
    }
  };

  const handleRunHandshake = async () => {
    setExecuting(true);
    setError(null);

    try {
      const result = await api.runHandshake({
        targetUrl,
        sessionId,
        strategy,
        authHeader: authHeader.trim() || undefined,
        autoProxy,
        autoStop: stopDummy,
        transferMemory: true
      });
      setHandshakeResult(result);
      onTargetChanged(targetUrl);
      // Refresh memory state after handshake
      await fetchDualMemory();
      // Refresh proxy config
      api.proxyConfig().then(setProxyConfig).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const copyDockerCompose = () => {
    if (!dockerInfo) return;
    navigator.clipboard.writeText(dockerInfo.dockerCompose);
    setCopiedCompose(true);
    setTimeout(() => setCopiedCompose(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#f8f9fa] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f3d2e] text-white font-bold text-lg shadow-sm">
              🤝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#0f3d2e]">Automated Handshake Pipeline & Gateway</h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  🔒 Multi-User Isolated
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Verify backend readiness, transfer memory safely, and bridge frontend traffic seamlessly
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 px-6 pt-2">
          <button
            onClick={() => setActiveTab("handshake")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === "handshake"
                ? "border-[#0f3d2e] text-[#0f3d2e]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            ⚡ 4-Stage Handshake Pipeline
          </button>
          <button
            onClick={() => {
              setActiveTab("dual-memory");
              fetchDualMemory();
            }}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === "dual-memory"
                ? "border-[#0f3d2e] text-[#0f3d2e]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>⚖️ Dual Memory Inspector</span>
            {dualMemory && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  dualMemory.syncStatus === "in_sync"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {dualMemory.syncStatus === "in_sync" ? "Synced" : "Review"}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("docker")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === "docker"
                ? "border-[#0f3d2e] text-[#0f3d2e]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            🐳 Docker Compose Spec
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* TAB 1: 4-STAGE HANDSHAKE PIPELINE */}
          {activeTab === "handshake" && (
            <div className="space-y-5">
              {/* Connection & Target URL Input */}
              <div className="rounded-xl border border-slate-200 bg-[#fbfbf9] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Target Real Backend URL:</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">User Session Scope:</span>
                    <input
                      type="text"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      className="font-mono text-xs font-semibold bg-white px-2 py-0.5 rounded border border-slate-200 text-[#0f3d2e] w-24 text-center focus:outline-none focus:border-[#0f3d2e]"
                      title="Multi-user isolation: Only records for this session will be transferred"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8080"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0f3d2e] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={checkBackendHealth}
                    disabled={probing}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    {probing ? "Probing..." : "Ping Probe"}
                  </button>
                </div>

                {/* Optional Auth Header & Strategy */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">
                      Inject Test Auth Header (Optional):
                    </label>
                    <input
                      type="text"
                      value={authHeader}
                      onChange={(e) => setAuthHeader(e.target.value)}
                      placeholder="Bearer test_token_xyz"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-700 placeholder:text-slate-400 focus:border-[#0f3d2e] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">
                      Memory Transfer Strategy:
                    </label>
                    <select
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#0f3d2e] focus:outline-none"
                    >
                      <option value="upsert">Upsert / Merge by ID (Recommended)</option>
                      <option value="append">Append Only (Skip Existing)</option>
                      <option value="clean_sync">Clean Sync (Wipe & Replace)</option>
                    </select>
                  </div>
                </div>

                {/* Mode Toggles */}
                <div className="pt-2 border-t border-slate-200/80 flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoProxy}
                      onChange={(e) => setAutoProxy(e.target.checked)}
                      className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e]"
                    />
                    <span>Enable Transparent Gateway Bridge (:3000 proxies to :8080)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={stopDummy}
                      onChange={(e) => setStopDummy(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-slate-600">Auto-stop MockForge dummy server upon cutover</span>
                  </label>
                </div>
              </div>

              {/* 4-STAGE VISUAL PIPELINE */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Handshake Execution Pipeline
                  </h3>
                  <span className="text-[11px] text-slate-400">4 Automated Verification Gates</span>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {/* Stage 1: Ping Probe */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">STAGE 1</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          handshakeResult?.stages.connectivity.passed || backendReady
                            ? "bg-emerald-500"
                            : "bg-slate-300"
                        }`}
                      />
                    </div>
                    <div className="font-semibold text-xs text-slate-800">TCP Ping</div>
                    <div className="text-[11px] text-slate-500">
                      {backendLatency !== null ? `${backendLatency} ms RTT` : "Waiting probe"}
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        backendReady ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {backendReady ? "Reachable ✓" : "Unverified"}
                    </span>
                  </div>

                  {/* Stage 2: Schema Parity */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">STAGE 2</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          handshakeResult?.stages.schema.passed ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                    </div>
                    <div className="font-semibold text-xs text-slate-800">Schema Parity</div>
                    <div className="text-[11px] text-slate-500">
                      {handshakeResult ? `${handshakeResult.stages.schema.parityPercent}% match` : "Route checks"}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      {handshakeResult ? "Validated ✓" : "Ready"}
                    </span>
                  </div>

                  {/* Stage 3: User Memory Seed */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">STAGE 3</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          handshakeResult?.stages.memory.passed ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                    </div>
                    <div className="font-semibold text-xs text-slate-800">Memory Transfer</div>
                    <div className="text-[11px] text-slate-500">
                      {handshakeResult
                        ? `${handshakeResult.stages.memory.entitiesCount} entities`
                        : "Scoped snapshot"}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      {handshakeResult ? handshakeResult.stages.memory.transferStatus : "Isolated"}
                    </span>
                  </div>

                  {/* Stage 4: Gateway Bridge */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">STAGE 4</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          handshakeResult?.stages.handoff.passed ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                    </div>
                    <div className="font-semibold text-xs text-slate-800">Gateway Bridge</div>
                    <div className="text-[11px] text-slate-500">
                      {proxyConfig?.enabled ? "Bridge Active" : "Cutover Ready"}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      {handshakeResult ? "Acknowledged ✓" : "Standby"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Handshake Result Alert */}
              {handshakeResult && (
                <div className="rounded-xl border border-emerald-200 bg-[#f0fdf4] p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0f3d2e] flex items-center gap-1.5">
                      <span>✓ Handshake Succeeded</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(handshakeResult.handshakeToken);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2000);
                      }}
                      className="text-[10px] font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300 hover:bg-emerald-50"
                    >
                      {copiedToken ? "Copied Token! ✓" : `Token: ${handshakeResult.handshakeToken}`}
                    </button>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{handshakeResult.message}</p>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
                  <strong>Handshake Failed:</strong> {error}
                </div>
              )}

              {/* Execute Button */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("dual-memory");
                    fetchDualMemory();
                  }}
                  className="text-xs font-semibold text-[#0f3d2e] hover:underline flex items-center gap-1"
                >
                  <span>⚖️ Inspect Memory Diff Before/After</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunHandshake}
                  disabled={executing}
                  className="rounded-xl bg-[#0f3d2e] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#0c3125] disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {executing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Executing 4-Stage Handshake...
                    </>
                  ) : (
                    <>⚡ Run Automated Handshake & Bridge</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: SIDE-BY-SIDE DUAL MEMORY INSPECTOR */}
          {activeTab === "dual-memory" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#0f3d2e]">Sync Status:</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                      dualMemory?.syncStatus === "in_sync"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {dualMemory?.syncStatus === "in_sync"
                      ? "🟢 100% In Sync (Both Stores Matched)"
                      : "🟡 Staged / Partial Sync"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>User Session: <strong className="font-mono text-slate-700">{sessionId}</strong></span>
                  <button
                    onClick={fetchDualMemory}
                    disabled={memoryLoading}
                    className="rounded bg-white px-2 py-1 text-slate-700 border border-slate-200 hover:bg-slate-100 font-semibold"
                  >
                    {memoryLoading ? "Refreshing..." : "↻ Refresh Stores"}
                  </button>
                </div>
              </div>

              {/* Split Dual-Pane View */}
              <div className="grid grid-cols-2 gap-4">
                {/* Left Pane: Dummy Server Memory */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-xs text-[#0f3d2e] flex items-center gap-1.5">
                      <span>📦 MockForge RAM (:3000)</span>
                    </span>
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {dualMemory?.dummy.entitiesCount ?? 0} entities
                    </span>
                  </div>
                  <pre className="h-56 overflow-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 leading-tight">
                    {JSON.stringify(dualMemory?.dummy.resources ?? {}, null, 2)}
                  </pre>
                </div>

                {/* Right Pane: Real Backend Memory */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-xs text-[#0f3d2e] flex items-center gap-1.5">
                      <span>🚀 Real Backend Store (:8080)</span>
                    </span>
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {dualMemory?.backend.entitiesCount ?? 0} ingested
                    </span>
                  </div>
                  <pre className="h-56 overflow-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-sky-400 leading-tight">
                    {JSON.stringify(dualMemory?.backend.resources ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DOCKER COMPOSE */}
          {activeTab === "docker" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700">Auto-Generated Docker Compose Configuration</h4>
                  <p className="text-[11px] text-slate-500">
                    Use this definition to run your containerized backend service locally
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyDockerCompose}
                  className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  {copiedCompose ? "Copied! ✓" : "Copy Compose Spec"}
                </button>
              </div>

              <pre className="rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto">
                {dockerInfo?.dockerCompose || "Loading Docker specification..."}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
