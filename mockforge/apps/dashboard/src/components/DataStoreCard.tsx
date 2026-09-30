import { useEffect, useState } from "react";
import {
  api,
  type SessionInfo,
  type DualMemoryState,
  type HandshakeResult,
  type ProxyConfig
} from "../api";

interface DataStoreCardProps {
  sessions: SessionInfo[];
  routesCount?: number;
  currentTargetUrl?: string;
  onProxyUpdated?: (config: ProxyConfig) => void;
  onSessionRefresh?: () => void;
}

type ViewMode = "split" | "dummy" | "backend";

export function DataStoreCard({
  sessions,
  routesCount: _routesCount,
  currentTargetUrl,
  onProxyUpdated,
  onSessionRefresh
}: DataStoreCardProps) {
  const [activeSessionId, setActiveSessionId] = useState<string>(
    sessions[0]?.id || "docker-session"
  );
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [dualMemory, setDualMemory] = useState<DualMemoryState | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetUrl, setTargetUrl] = useState<string>(
    currentTargetUrl || "http://real-production-backend:8080"
  );
  const [strategy, setStrategy] = useState<"upsert" | "append" | "clean_sync">("upsert");
  const [direction, setDirection] = useState<"push" | "pull">("push");
  const [autoProxy, setAutoProxy] = useState(true);

  // Execution states
  const [executing, setExecuting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [testingGateway, setTestingGateway] = useState(false);
  const [gatewayTestResult, setGatewayTestResult] = useState<{
    status: number;
    source: string | null;
    fallback: string | null;
    recordCount: number;
    timeMs: number;
  } | null>(null);
  const [handshakeResult, setHandshakeResult] = useState<HandshakeResult | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Keep targetUrl updated if prop changes
  useEffect(() => {
    if (currentTargetUrl && currentTargetUrl !== targetUrl) {
      setTargetUrl(currentTargetUrl);
    }
  }, [currentTargetUrl]);

  // Keep activeSessionId sensible if sessions change
  useEffect(() => {
    if (sessions.length > 0 && sessions[0] && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Fetch memory whenever activeSessionId or targetUrl changes
  const fetchMemory = async (customSession?: string, customTarget?: string) => {
    const sId = customSession ?? activeSessionId;
    const tUrl = customTarget ?? targetUrl;
    setLoading(true);
    try {
      const state = await api.dualMemory(tUrl, sId);
      setDualMemory(state);
    } catch {
      /* ignore fetch errors during polling */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, [activeSessionId, targetUrl]);

  // Quick Seed 3 Records into Container A RAM
  const handleSeedMockData = async () => {
    setSeeding(true);
    setNotification(null);
    try {
      const timestamp = new Date().toLocaleTimeString();
      const samples = [
        {
          title: `Docker Cloud Worker Sync #${Math.floor(Math.random() * 900 + 100)}`,
          priority: "high",
          done: false,
          stagedAt: timestamp
        },
        {
          title: `Postgres Schema Migration Task #${Math.floor(Math.random() * 900 + 100)}`,
          priority: "medium",
          done: false,
          stagedAt: timestamp
        },
        {
          title: `Distributed Cache Invalidation #${Math.floor(Math.random() * 900 + 100)}`,
          priority: "low",
          done: true,
          stagedAt: timestamp
        }
      ];

      for (const task of samples) {
        await fetch("/tasks", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-session-id": activeSessionId
          },
          body: JSON.stringify(task)
        });
      }

      setNotification({
        type: "success",
        message: `Successfully seeded 3 new records into MockForge RAM for session '${activeSessionId}'. Ready to transfer!`
      });

      if (onSessionRefresh) onSessionRefresh();
      await fetchMemory();
    } catch (err) {
      setNotification({
        type: "error",
        message: `Failed to seed mock data: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setSeeding(false);
    }
  };

  // Seed 3 Records directly into Container B (Real Backend DB)
  const handleSeedRealBackend = async () => {
    setSeeding(true);
    setNotification(null);
    try {
      const timestamp = new Date().toISOString();
      const samples = [
        {
          id: `tsk_real_${Math.random().toString(36).slice(2, 8)}`,
          title: `Production PostgreSQL Record #${Math.floor(Math.random() * 900 + 100)}`,
          priority: "high",
          done: false,
          createdAt: timestamp
        },
        {
          id: `tsk_real_${Math.random().toString(36).slice(2, 8)}`,
          title: `Staging Kafka Stream Record #${Math.floor(Math.random() * 900 + 100)}`,
          priority: "medium",
          done: false,
          createdAt: timestamp
        },
        {
          id: `tsk_real_${Math.random().toString(36).slice(2, 8)}`,
          title: `Live Redis Snapshot #${Math.floor(Math.random() * 900 + 100)}`,
          priority: "low",
          done: true,
          createdAt: timestamp
        }
      ];

      for (const task of samples) {
        await fetch(`${targetUrl}/tasks`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-session-id": activeSessionId
          },
          body: JSON.stringify(task)
        });
      }

      setNotification({
        type: "success",
        message: `Created 3 records on Real Backend (${targetUrl}) under session '${activeSessionId}'. Now click 'Pull Snapshot from Real DB' to hydrate them into Mock RAM!`
      });

      await fetchMemory();
    } catch (err) {
      setNotification({
        type: "error",
        message: `Failed to seed real backend: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setSeeding(false);
    }
  };

  // Run Memory Transfer (Forward Push or Reverse Pull)
  const handleRunTransfer = async (forcedDirection?: "push" | "pull") => {
    const activeDir = forcedDirection || direction;
    setExecuting(true);
    setNotification(null);
    setGatewayTestResult(null);

    try {
      const result = await api.runHandshake({
        targetUrl,
        sessionId: activeSessionId,
        strategy,
        direction: activeDir,
        transferMemory: true,
        autoProxy: activeDir === "push" ? autoProxy : false
      });

      setHandshakeResult(result);

      if (result.success) {
        if (activeDir === "pull") {
          const count = result.stages.memory.entitiesCount;
          if (count === 0) {
            setNotification({
              type: "info",
              message: `Real Backend currently has 0 tasks for session '${activeSessionId}'. Click 'Seed 3 Tasks in Real DB' first to add live records to pull!`
            });
          } else {
            setNotification({
              type: "success",
              message: `Reverse Pull SUCCESS! Cloned and hydrated ${count} entities from Real Backend (${targetUrl}) into MockForge RAM for session '${activeSessionId}'.`
            });
          }
        } else {
          setNotification({
            type: "success",
            message: `Forward Push COMPLETE! Migrated ${result.stages.memory.entitiesCount} entities to real backend (${targetUrl}) in ${result.stages.connectivity.latencyMs}ms. Token: ${result.handshakeToken}`
          });
        }

        // Notify parent if proxy updated
        if (onProxyUpdated && autoProxy && activeDir === "push") {
          api.proxyConfig().then(onProxyUpdated).catch(() => undefined);
        }
      } else {
        setNotification({
          type: "error",
          message: `Transfer failed: Target backend at ${targetUrl} is unreachable.`
        });
      }

      if (onSessionRefresh) onSessionRefresh();
      await fetchMemory();
    } catch (err) {
      setNotification({
        type: "error",
        message: `Memory transfer error: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setExecuting(false);
    }
  };

  // Test the Gateway directly via :3000 to verify data routing
  const handleTestGateway = async () => {
    setTestingGateway(true);
    const start = performance.now();
    try {
      const res = await fetch("/tasks", {
        headers: { "x-session-id": activeSessionId }
      });
      const data = (await res.json()) as unknown[];
      const timeMs = Math.round(performance.now() - start);

      setGatewayTestResult({
        status: res.status,
        source: res.headers.get("x-mockforge-source"),
        fallback: res.headers.get("x-mockforge-fallback"),
        recordCount: Array.isArray(data) ? data.length : 0,
        timeMs
      });
    } catch {
      setGatewayTestResult(null);
    } finally {
      setTestingGateway(false);
    }
  };

  const totalRecords = sessions.reduce((acc, s) => acc + s.records, 0);

  return (
    <div className="card-figma p-6 space-y-6">
      {/* Header & Isolation Notice */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0f3d2e] text-white text-base font-bold shadow-xs">
              ⚡
            </span>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              Bidirectional Container Database Memory Transfer Studio
            </h3>
            <span className="rounded-full bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 text-[11px] border border-emerald-200">
              🔒 Multi-User Isolated
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Bidirectional state synchronization: Push mock RAM to real backend DB, or pull live backend snapshots into mock RAM for safe offline testing.
          </p>
        </div>

        {/* Sync & Stats Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {dualMemory && (
            <span
              className={`rounded-full px-3 py-1 font-bold text-xs flex items-center gap-1.5 shadow-xs ${
                dualMemory.syncStatus === "in_sync"
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                  : "bg-amber-100 text-amber-900 border border-amber-300"
              }`}
            >
              <span>{dualMemory.syncStatus === "in_sync" ? "🟢" : "🟡"}</span>
              <span>
                {dualMemory.syncStatus === "in_sync"
                  ? "100% In Sync (Stores Match)"
                  : "Staged / Partial Sync"}
              </span>
            </span>
          )}
          <span className="rounded-full bg-slate-100 text-slate-700 font-bold px-3 py-1 text-xs border border-slate-200 shadow-xs">
            {totalRecords} records across {sessions.length} sessions
          </span>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl text-xs font-semibold animate-in fade-in duration-150 border ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-950 border-emerald-300"
              : notification.type === "error"
              ? "bg-rose-50 text-rose-950 border-rose-300"
              : "bg-sky-50 text-sky-950 border-sky-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{notification.type === "success" ? "✓" : "⚠️"}</span>
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 font-bold ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control Panel: Configuration & 1-Click Execution */}
      <div className="rounded-2xl border border-slate-200 bg-[#fbfbf9] p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
          {/* Direction Switcher Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#0f3d2e] flex items-center gap-1.5 mr-2">
              <span>🎮</span>
              <span>Mode:</span>
            </span>
            <div className="flex rounded-xl bg-slate-200/80 p-0.5 text-xs font-bold border border-slate-300 shadow-2xs">
              <button
                type="button"
                onClick={() => setDirection("push")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  direction === "push"
                    ? "bg-[#0f3d2e] text-white shadow-xs"
                    : "text-slate-700 hover:text-slate-900"
                }`}
                title="Forward Migration: Push MockForge RAM records into Real Backend DB"
              >
                <span>➡️</span>
                <span>Push (Mock ➔ Real DB)</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("pull")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  direction === "pull"
                    ? "bg-[#0f3d2e] text-white shadow-xs"
                    : "text-slate-700 hover:text-slate-900"
                }`}
                title="Reverse Pull: Clone Real Backend DB snapshot into MockForge RAM"
              >
                <span>⬅️</span>
                <span>Reverse Pull (Real DB ➔ Mock RAM)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium">Quick Target Presets:</span>
            <button
              type="button"
              onClick={() => setTargetUrl("http://real-production-backend:8080")}
              className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 transition-colors"
              title="Internal Docker network DNS (Container to Container)"
            >
              🐳 Docker (:8080)
            </button>
            <button
              type="button"
              onClick={() => setTargetUrl("http://127.0.0.1:8080")}
              className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 transition-colors"
              title="Host loopback interface"
            >
              💻 Localhost (:8080)
            </button>
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* 1. Target Backend URL */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 block">Target Real Backend URL:</label>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full font-mono text-xs font-semibold bg-white px-3 py-2 rounded-xl border border-slate-200 text-[#0f3d2e] focus:border-[#0f3d2e] focus:outline-none shadow-xs"
              placeholder="http://real-production-backend:8080"
            />
          </div>

          {/* 2. Session ID */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 block">Developer Session Scope:</label>
              <span className="text-[10px] text-slate-400 font-mono">Isolated</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={activeSessionId}
                onChange={(e) => setActiveSessionId(e.target.value)}
                className="w-full font-mono text-xs font-semibold bg-white px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:border-[#0f3d2e] focus:outline-none shadow-xs"
                placeholder="docker-session"
              />
              <button
                type="button"
                onClick={() => setActiveSessionId(`session-${Math.floor(Math.random() * 9000 + 1000)}`)}
                className="whitespace-nowrap px-2.5 py-2 text-[11px] font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
                title="Create a new isolated session ID"
              >
                + New
              </button>
            </div>
          </div>

          {/* 3. Conflict Resolution Strategy */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 block">Conflict Strategy:</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as "upsert" | "append" | "clean_sync")}
              className="w-full font-semibold text-xs bg-white px-3 py-2 rounded-xl border border-slate-200 text-slate-900 focus:border-[#0f3d2e] focus:outline-none shadow-xs"
            >
              <option value="upsert">upsert — Update matching IDs, insert new</option>
              <option value="append">append — Add all as fresh records</option>
              <option value="clean_sync">clean_sync — Wipe target first & mirror</option>
            </select>
          </div>
        </div>

        {/* Options & Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Checkbox Options */}
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
            {direction === "push" ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoProxy}
                  onChange={(e) => setAutoProxy(e.target.checked)}
                  className="rounded text-[#0f3d2e] focus:ring-[#0f3d2e]"
                />
                <span>Auto-Cutover Gateway (Proxy traffic to :8080 on success)</span>
              </label>
            ) : (
              <span className="text-[11px] text-slate-500 italic">
                ℹ️ Reverse pull hydrates MockForge RAM for local offline testing (keeps mock mode active).
              </span>
            )}
          </div>

          {/* Interactive Trigger Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Seed Mock RAM Button */}
            <button
              type="button"
              onClick={handleSeedMockData}
              disabled={seeding || executing}
              className="rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Seed 3 sample CRUD task records into Container A Mock RAM"
            >
              <span>🌱</span>
              <span>{seeding ? "Seeding..." : "Seed in Mock RAM"}</span>
            </button>

            {/* Seed Real Backend Button */}
            <button
              type="button"
              onClick={handleSeedRealBackend}
              disabled={seeding || executing}
              className="rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Create 3 sample CRUD task records directly in Container B Real Backend DB"
            >
              <span>🗄️</span>
              <span>{seeding ? "Seeding..." : "Seed in Real DB"}</span>
            </button>

            {/* Quick Reverse Pull Button */}
            <button
              type="button"
              onClick={() => handleRunTransfer("pull")}
              disabled={executing || seeding}
              className="rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-950 px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Pull latest database state from Real Backend (:8080) into MockForge RAM"
            >
              <span>📥</span>
              <span>Pull Snapshot from Real DB</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchMemory()}
              disabled={loading || executing}
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <span>↻</span>
              <span>{loading ? "Checking..." : "Refresh"}</span>
            </button>

            {/* Main Transfer Button */}
            <button
              type="button"
              onClick={() => handleRunTransfer()}
              disabled={executing || seeding}
              className="btn-figma-primary px-4 py-2 text-xs flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <span>{direction === "pull" ? "📥" : "🚀"}</span>
              <span>
                {executing
                  ? direction === "pull"
                    ? "Pulling from Backend..."
                    : "Transferring to Backend..."
                  : direction === "pull"
                  ? "Execute Reverse Pull to Mock RAM"
                  : "Execute Push to Real Backend"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-Stage Visual Handshake Pipeline Result (Displayed after execution) */}
      {handshakeResult && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xs text-slate-900">
                4-Stage Pipeline Execution ({handshakeResult.direction === "pull" ? "⬅️ Reverse Pull: Real DB ➔ Mock RAM" : "➡️ Forward Push: Mock RAM ➔ Real DB"}):
              </span>
              <span
                className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded-full ${
                  handshakeResult.success
                    ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                    : "bg-rose-100 text-rose-900 border border-rose-300"
                }`}
              >
                {handshakeResult.success ? "OVERALL SUCCESS" : "FAILED"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Mutual Token: <span className="text-[#0f3d2e] font-bold">{handshakeResult.handshakeToken}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Stage 1 */}
            <div
              className={`p-3 rounded-xl border ${
                handshakeResult.stages.connectivity.passed
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                  : "bg-rose-50/70 border-rose-200 text-rose-950"
              }`}
            >
              <div className="flex items-center justify-between font-bold mb-1">
                <span>Stage 1: TCP Ping</span>
                <span>{handshakeResult.stages.connectivity.passed ? "✓ PASS" : "✗ FAIL"}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Roundtrip: {handshakeResult.stages.connectivity.latencyMs}ms (HTTP {handshakeResult.stages.connectivity.status})
              </p>
            </div>

            {/* Stage 2 */}
            <div
              className={`p-3 rounded-xl border ${
                handshakeResult.stages.schema.passed
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                  : "bg-amber-50/70 border-amber-200 text-amber-950"
              }`}
            >
              <div className="flex items-center justify-between font-bold mb-1">
                <span>Stage 2: Schema Parity</span>
                <span>{handshakeResult.stages.schema.passed ? "✓ PASS" : "⚠️ WARN"}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Parity: {handshakeResult.stages.schema.parityPercent}% match
              </p>
            </div>

            {/* Stage 3 */}
            <div
              className={`p-3 rounded-xl border ${
                handshakeResult.stages.memory.passed
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                  : "bg-rose-50/70 border-rose-200 text-rose-950"
              }`}
            >
              <div className="flex items-center justify-between font-bold mb-1">
                <span>Stage 3: {handshakeResult.direction === "pull" ? "Reverse Hydration" : "Memory Stream"}</span>
                <span>{handshakeResult.stages.memory.passed ? "✓ PASS" : "✗ FAIL"}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                {handshakeResult.direction === "pull" ? "Pulled & Ingested into RAM" : "Transferred to DB"}: {handshakeResult.stages.memory.entitiesCount} entities ({strategy})
              </p>
            </div>

            {/* Stage 4 */}
            <div
              className={`p-3 rounded-xl border ${
                handshakeResult.stages.handoff.passed
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              <div className="flex items-center justify-between font-bold mb-1">
                <span>Stage 4: Gateway Cutover</span>
                <span>{handshakeResult.stages.handoff.passed ? "✓ PASS" : "STANDBY"}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Bridge: {autoProxy ? "Active Forwarding" : "Manual Mock Mode"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Dual Store Inspector View */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Display View:</span>
            <div className="flex rounded-lg bg-white p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === "split"
                    ? "bg-[#0f3d2e] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ⚖️ Side-by-Side Dual View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("dummy")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === "dummy"
                    ? "bg-[#0f3d2e] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📦 Container A: MockForge RAM (:3000)
              </button>
              <button
                type="button"
                onClick={() => setViewMode("backend")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === "backend"
                    ? "bg-[#0f3d2e] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🚀 Container B: Real Backend DB (:8080)
              </button>
            </div>
          </div>

          {/* Quick Gateway REST Verifier Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestGateway}
              disabled={testingGateway}
              className="text-xs font-bold px-3 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[#0f3d2e] transition-colors flex items-center gap-1.5 shadow-xs"
              title="Issue a GET /tasks request to port 3000 to verify origin headers"
            >
              <span>🔍</span>
              <span>{testingGateway ? "Probing..." : "Test GET /tasks via Gateway (:3000)"}</span>
            </button>
          </div>
        </div>

        {/* Gateway Test Result Callout */}
        {gatewayTestResult && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 text-white text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-bold">GET /tasks: HTTP {gatewayTestResult.status}</span>
              <span className="text-slate-300">
                Source:{" "}
                <span
                  className={`font-bold px-1.5 py-0.5 rounded ${
                    gatewayTestResult.source === "real-backend"
                      ? "bg-emerald-900/90 text-emerald-300 border border-emerald-500"
                      : "bg-amber-900/90 text-amber-300 border border-amber-500"
                  }`}
                >
                  {gatewayTestResult.source || "mock"}
                </span>
              </span>
              {gatewayTestResult.fallback && (
                <span className="text-amber-400 font-bold">[FALLBACK ACTIVE]</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>Records: {gatewayTestResult.recordCount}</span>
              <span>Roundtrip: {gatewayTestResult.timeMs}ms</span>
            </div>
          </div>
        )}

        {/* Dual Memory Panels */}
        {viewMode === "split" && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Left Pane: Container A Mock RAM */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-[#0f3d2e] flex items-center gap-1.5">
                    <span>📦 Container A: MockForge RAM</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">(:3000)</span>
                </div>
                <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  {dualMemory?.dummy.entitiesCount ?? 0} entities staged
                </span>
              </div>
              <pre className="h-72 overflow-auto rounded-lg bg-slate-950 p-3.5 font-mono text-[11px] text-emerald-400 leading-tight border border-slate-800">
                {JSON.stringify(dualMemory?.dummy.resources ?? {}, null, 2)}
              </pre>
            </div>

            {/* Right Pane: Container B Real Backend DB */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-[#0f3d2e] flex items-center gap-1.5">
                    <span>🚀 Container B: Real Production DB</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">(:8080)</span>
                </div>
                <span className="text-[10px] font-mono bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-full font-bold">
                  {dualMemory?.backend.entitiesCount ?? 0} records ingested
                </span>
              </div>
              <pre className="h-72 overflow-auto rounded-lg bg-slate-950 p-3.5 font-mono text-[11px] text-sky-400 leading-tight border border-slate-800">
                {JSON.stringify(dualMemory?.backend.resources ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {viewMode === "dummy" && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-xs text-[#0f3d2e]">
                Container A: MockForge In-Memory Store (Session: {activeSessionId})
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700">
                {dualMemory?.dummy.entitiesCount ?? 0} records
              </span>
            </div>
            <pre className="h-80 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-emerald-400 leading-relaxed border border-slate-800">
              {JSON.stringify(dualMemory?.dummy.resources ?? {}, null, 2)}
            </pre>
          </div>
        )}

        {viewMode === "backend" && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-xs text-[#0f3d2e]">
                Container B: Real Production Ingested Database JSON (Target: {targetUrl})
              </span>
              <span className="text-xs font-mono font-bold text-sky-700">
                {dualMemory?.backend.entitiesCount ?? 0} records
              </span>
            </div>
            <pre className="h-80 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-sky-400 leading-relaxed border border-slate-800">
              {JSON.stringify(dualMemory?.backend.resources ?? {}, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Strict Multi-Tenant Isolation Callout Cards */}
      <div className="rounded-2xl border border-slate-200 bg-[#fbfbf9] p-5 space-y-3">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0f3d2e]">
          Strict Multi-Developer Isolation Guarantees
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700">
          <div className="flex items-start gap-2.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-emerald-600 font-bold text-base">🔒</span>
            <div>
              <strong className="block font-bold text-slate-800">No Cross-User Access</strong>
              <span className="text-slate-600">Developer Alice cannot view, mutate, or transfer records created by Developer Bob.</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-emerald-600 font-bold text-base">⚡</span>
            <div>
              <strong className="block font-bold text-slate-800">Scoped Memory Transfers</strong>
              <span className="text-slate-600">Memory migrations export only the active developer's authenticated session records.</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-emerald-600 font-bold text-base">🛡️</span>
            <div>
              <strong className="block font-bold text-slate-800">Zero Disk Leak</strong>
              <span className="text-slate-600">Everything is held in container RAM and synced directly to the target database API.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
