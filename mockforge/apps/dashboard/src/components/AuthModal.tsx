import { useEffect, useState } from "react";
import { api, type AuthConfig, type ProxyConfig } from "../api";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthUpdated?: (config: AuthConfig) => void;
}

export function AuthModal({ isOpen, onClose, onAuthUpdated }: AuthModalProps) {
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    enabled: false,
    type: "bearer",
    token: "mf_secret_token_123",
    requiredRole: "viewer"
  });
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | null>(null);
  const [backendAuthHeader, setBackendAuthHeader] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    api.authConfig().then((cfg) => {
      setAuthConfig(cfg);
    }).catch(() => undefined);
    api.proxyConfig().then((cfg) => {
      setProxyConfig(cfg);
      setBackendAuthHeader(cfg.authHeader || "");
    }).catch(() => undefined);
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await api.updateAuth(authConfig);
      setAuthConfig(updated);
      if (proxyConfig) {
        const updatedProxy = await api.updateProxy({ authHeader: backendAuthHeader.trim() });
        setProxyConfig(updatedProxy);
      }
      if (onAuthUpdated) onAuthUpdated(updated);
      setSaveMsg("Security settings applied live!");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch {
      setSaveMsg("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const setPresetToken = (role: "viewer" | "editor" | "admin") => {
    const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
      JSON.stringify({ sub: "dev-user-01", role, iat: Math.floor(Date.now() / 1000) })
    )}.mockforge_sig_${role}`;
    setAuthConfig({
      ...authConfig,
      token: fakeJwt,
      requiredRole: role
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#e5e7df] bg-white shadow-2xl transition-all text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5e7df] bg-[#f6f6f2] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f3d2e] text-white font-bold text-lg shadow-sm">
              🔐
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Authentication & Authorization Guard</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    authConfig.enabled
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-slate-200 text-slate-700 border-slate-300"
                  }`}
                >
                  {authConfig.enabled ? "Shield Active" : "Mock Auth Disabled (Permissive)"}
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                Enforce Bearer JWT / API Key & RBAC roles on MockForge, or inject auth tokens into proxied backend requests.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Section 1: Mock Server Auth Enforcement */}
          <div className="space-y-4 rounded-xl border border-[#e5e7df] bg-[#fbfbf9] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">1. Mock Server Auth Enforcement</h3>
                <p className="text-xs text-slate-600">
                  When enabled, unauthenticated requests to mock endpoints will receive 401 Unauthorized or 403 Forbidden.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={authConfig.enabled}
                  onChange={(e) => setAuthConfig({ ...authConfig, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0f3d2e]"></div>
              </label>
            </div>

            {authConfig.enabled && (
              <div className="space-y-4 pt-3 border-t border-[#e5e7df] animate-in fade-in duration-150">
                {/* Auth Scheme Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAuthConfig({ ...authConfig, type: "bearer" })}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      authConfig.type === "bearer"
                        ? "border-[#0f3d2e] bg-emerald-50 text-[#0f3d2e] font-bold shadow-sm"
                        : "border-[#e5e7df] bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <div className="text-xs font-bold">Bearer JWT Token</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">Authorization: Bearer &lt;token&gt;</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthConfig({ ...authConfig, type: "apikey" })}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      authConfig.type === "apikey"
                        ? "border-[#0f3d2e] bg-emerald-50 text-[#0f3d2e] font-bold shadow-sm"
                        : "border-[#e5e7df] bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <div className="text-xs font-bold">API Key Header</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">x-api-key: &lt;token&gt;</div>
                  </button>
                </div>

                {/* Token Value */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Configured Secret / Token:</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(authConfig.token)}
                      className="text-[11px] text-[#0f3d2e] font-mono hover:underline"
                    >
                      {copiedToken ? "✓ Copied!" : "📋 Copy Token"}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={authConfig.token}
                    onChange={(e) => setAuthConfig({ ...authConfig, token: e.target.value })}
                    className="w-full rounded-lg border border-[#e5e7df] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#0f3d2e] focus:outline-none shadow-sm"
                    placeholder="e.g. mf_secret_key_xyz"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-500 font-medium">Quick JWT presets:</span>
                    <button
                      type="button"
                      onClick={() => setPresetToken("viewer")}
                      className="rounded bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-0.5 text-[10px] font-mono font-semibold"
                    >
                      Viewer JWT
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetToken("admin")}
                      className="rounded bg-[#0f3d2e] hover:bg-[#15523e] text-white px-2 py-0.5 text-[10px] font-mono font-semibold"
                    >
                      Admin JWT
                    </button>
                  </div>
                </div>

                {/* RBAC Role Requirements */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 block">Required RBAC Role:</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["viewer", "editor", "admin"] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setAuthConfig({ ...authConfig, requiredRole: role })}
                        className={`rounded-lg border py-2 px-3 text-xs font-semibold capitalize transition-all ${
                          authConfig.requiredRole === role
                            ? "bg-[#0f3d2e] text-white border-[#0f3d2e] shadow-sm"
                            : "bg-white text-slate-700 border-[#e5e7df] hover:border-slate-400"
                        }`}
                      >
                        {role}
                        <span className="block text-[9px] font-normal opacity-80">
                          {role === "viewer" ? "Read GET" : role === "editor" ? "Read/Write" : "Full Admin"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Real Backend Gateway Injected Credentials (Question 3 Solution) */}
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <div>
                <h3 className="text-sm font-bold text-[#0f3d2e]">
                  2. Gateway Injected Backend Auth (Question 3 Solution)
                </h3>
                <p className="text-xs text-slate-600">
                  Real backend requires JWT/API Key, but frontend hasn't built login yet? MockForge automatically injects this credential into proxied requests to :8080!
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Injected Default Auth Header:</span>
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                  Passthrough by default (frontend tokens take priority)
                </span>
              </div>
              <input
                type="text"
                value={backendAuthHeader}
                onChange={(e) => setBackendAuthHeader(e.target.value)}
                placeholder="e.g. Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#0f3d2e] focus:outline-none shadow-sm"
              />
              <p className="text-[11px] text-slate-500">
                Leave blank if the real backend requires no auth or if frontend sends its own headers.
              </p>
            </div>
          </div>

          {/* Test Snippet */}
          <div className="rounded-xl border border-[#e5e7df] bg-slate-900 p-4 space-y-1.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">
              Frontend Client Test Header (How your app talks to MockForge)
            </span>
            <pre className="text-xs font-mono text-emerald-400 overflow-x-auto">
              {authConfig.enabled
                ? authConfig.type === "bearer"
                  ? `fetch("http://localhost:3000/tasks", {\n  headers: {\n    "Authorization": "Bearer ${authConfig.token}",\n    "x-user-role": "${authConfig.requiredRole}"\n  }\n})`
                  : `fetch("http://localhost:3000/tasks", {\n  headers: {\n    "x-api-key": "${authConfig.token}",\n    "x-user-role": "${authConfig.requiredRole}"\n  }\n})`
                : `// Mock auth is disabled. Standard requests accepted without auth headers:\nfetch("http://localhost:3000/tasks")`}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#e5e7df] bg-[#f6f6f2] px-6 py-4">
          <span className="text-xs font-semibold text-emerald-800 font-mono">
            {saveMsg}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-figma-secondary px-4 py-2 text-xs"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-figma-primary px-5 py-2 text-xs font-bold"
            >
              {saving ? "Applying..." : "Save & Enforce Live"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
