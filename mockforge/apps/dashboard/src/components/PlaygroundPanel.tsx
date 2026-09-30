import { useState, useMemo } from "react";
import type { RouteInfo } from "../api";

interface PlaygroundPanelProps {
  routes: RouteInfo[];
}

const METHOD_BADGES: Record<string, { bg: string; text: string }> = {
  GET: { bg: "bg-[#e0f2fe]", text: "text-[#0369a1]" },
  POST: { bg: "bg-[#dcfce7]", text: "text-[#15803d]" },
  PUT: { bg: "bg-[#fef3c7]", text: "text-[#b45309]" },
  PATCH: { bg: "bg-[#ffedd5]", text: "text-[#c2410c]" },
  DELETE: { bg: "bg-[#ffe4e6]", text: "text-[#be123c]" }
};

export function PlaygroundPanel({ routes }: PlaygroundPanelProps) {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [selectedRoute, setSelectedRoute] = useState<RouteInfo | null>(routes[0] ?? null);

  // Form inputs for request
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryParams, setQueryParams] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("default");
  const [authHeader, setAuthHeader] = useState<string>("");
  const [requestBody, setRequestBody] = useState<string>('{\n  "title": "New item from Studio",\n  "status": "in_progress"\n}');

  // Execution state
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    headers: Record<string, string>;
    body: string;
    isError: boolean;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Filter routes
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      const matchSearch = r.path.toLowerCase().includes(search.toLowerCase());
      const matchMethod = methodFilter === "ALL" || r.method === methodFilter;
      return matchSearch && matchMethod;
    });
  }, [routes, search, methodFilter]);

  // Extract path params from route
  const currentParams = useMemo(() => {
    if (!selectedRoute) return [];
    const matches = selectedRoute.path.match(/\{([^}]+)\}/g);
    if (!matches) return [];
    return matches.map((m) => m.slice(1, -1));
  }, [selectedRoute]);

  // Compute final execution path
  const resolvedPath = useMemo(() => {
    if (!selectedRoute) return "";
    let p = selectedRoute.path;
    currentParams.forEach((param) => {
      const val = pathParams[param] || `example-${param}`;
      p = p.replace(`{${param}}`, encodeURIComponent(val));
    });
    if (queryParams.trim()) {
      p += (p.includes("?") ? "&" : "?") + queryParams.trim().replace(/^\?/, "");
    }
    return p;
  }, [selectedRoute, currentParams, pathParams, queryParams]);

  const handleExecute = async () => {
    if (!selectedRoute) return;
    setLoading(true);
    const start = performance.now();

    try {
      const headers: Record<string, string> = {
        Accept: "application/json"
      };
      if (sessionId.trim()) {
        headers["X-Session-Id"] = sessionId.trim();
      }
      if (authHeader.trim()) {
        headers["Authorization"] = authHeader.trim();
      }

      const options: RequestInit = {
        method: selectedRoute.method,
        headers
      };

      if (["POST", "PUT", "PATCH"].includes(selectedRoute.method)) {
        headers["Content-Type"] = "application/json";
        options.body = requestBody;
      }

      const res = await fetch(resolvedPath, options);
      const durationMs = Math.round(performance.now() - start);

      const headerObj: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headerObj[k] = v;
      });

      let bodyText = "";
      try {
        const json = await res.json();
        bodyText = JSON.stringify(json, null, 2);
      } catch {
        bodyText = await res.text();
      }

      setResponse({
        status: res.status,
        statusText: res.statusText || (res.status === 200 ? "OK" : ""),
        durationMs,
        headers: headerObj,
        body: bodyText,
        isError: res.status >= 400
      });
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      setResponse({
        status: 0,
        statusText: "Network Error",
        durationMs,
        headers: {},
        body: err instanceof Error ? err.message : String(err),
        isError: true
      });
    } finally {
      setLoading(false);
    }
  };

  const copyCurl = () => {
    if (!selectedRoute) return;
    let cmd = `curl -X ${selectedRoute.method} "http://127.0.0.1:3000${resolvedPath}"`;
    if (sessionId) cmd += ` -H "X-Session-Id: ${sessionId}"`;
    if (authHeader) cmd += ` -H "Authorization: ${authHeader}"`;
    if (["POST", "PUT", "PATCH"].includes(selectedRoute.method)) {
      cmd += ` -H "Content-Type: application/json" -d '${requestBody.replace(/'/g, "'\\''")}'`;
    }
    navigator.clipboard.writeText(cmd);
    setCopied("curl");
    setTimeout(() => setCopied(null), 2000);
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.body);
    setCopied("response");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Route List sidebar */}
      <div className="lg:col-span-4 card-figma p-5 flex flex-col h-[700px] space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Select Endpoint</h3>
          <p className="text-xs text-slate-500">Pick any mock route to test live</p>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search route path or resource..."
          className="w-full rounded-xl border border-slate-200 bg-[#fbfbf9] px-3 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-[#0f3d2e] focus:outline-none"
        />

        {/* Method filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-[10px] font-mono">
          {["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                methodFilter === m
                  ? "bg-[#0f3d2e] text-white shadow-sm font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Route scroll list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
          {filteredRoutes.map((r, i) => {
            const badge = METHOD_BADGES[r.method] ?? { bg: "bg-slate-100", text: "text-slate-700" };
            const isSelected = selectedRoute?.method === r.method && selectedRoute?.path === r.path;

            return (
              <button
                key={`${r.method}-${r.path}-${i}`}
                type="button"
                onClick={() => {
                  setSelectedRoute(r);
                  setResponse(null);
                }}
                className={`w-full text-left p-3 flex items-center justify-between transition-colors ${
                  isSelected ? "bg-emerald-50/70 border-l-4 border-l-[#0f3d2e]" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                    {r.method}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-800 truncate">
                    {r.path}
                  </span>
                </div>
                {r.resource && (
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {r.resource}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Request / Response workbench */}
      <div className="lg:col-span-8 space-y-6">
        {selectedRoute ? (
          <div className="card-figma p-6 space-y-5">
            {/* Action Bar */}
            <div className="flex items-center gap-3 bg-[#fbfbf9] p-3 rounded-xl border border-slate-200 font-mono text-xs">
              <span
                className={`rounded px-2.5 py-1 text-xs font-bold ${
                  METHOD_BADGES[selectedRoute.method]?.bg ?? "bg-slate-100"
                } ${METHOD_BADGES[selectedRoute.method]?.text ?? "text-slate-800"}`}
              >
                {selectedRoute.method}
              </span>
              <span className="flex-1 font-bold text-slate-900 truncate">{resolvedPath}</span>
              <button
                type="button"
                onClick={handleExecute}
                disabled={loading}
                className="rounded-xl bg-[#0f3d2e] px-5 py-2 font-bold text-xs text-white shadow-sm hover:bg-[#0c3125] disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {loading ? "Running..." : "Send Request ➔"}
              </button>
            </div>

            {/* Config Fields */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  User Session ID (Strict Multi-User Isolation):
                </label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="default"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-[#0f3d2e] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Authorization Header (Optional):
                </label>
                <input
                  type="text"
                  value={authHeader}
                  onChange={(e) => setAuthHeader(e.target.value)}
                  placeholder="Bearer token..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-[#0f3d2e] focus:outline-none"
                />
              </div>
            </div>

            {/* Path Params if present */}
            {currentParams.length > 0 && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Path Parameters:</span>
                <div className="grid grid-cols-2 gap-2">
                  {currentParams.map((p) => (
                    <div key={p} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-500">{p}:</span>
                      <input
                        type="text"
                        value={pathParams[p] || ""}
                        onChange={(e) => setPathParams({ ...pathParams, [p]: e.target.value })}
                        placeholder={`example-${p}`}
                        className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Request Body (for POST/PUT/PATCH) */}
            {["POST", "PUT", "PATCH"].includes(selectedRoute.method) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Request Body (JSON):</span>
                  <span className="text-[11px] font-mono text-slate-400">Content-Type: application/json</span>
                </div>
                <textarea
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 focus:border-[#0f3d2e] focus:outline-none"
                />
              </div>
            )}

            {/* Query Params */}
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-700">Query Parameters (URL Search):</span>
              <input
                type="text"
                value={queryParams}
                onChange={(e) => setQueryParams(e.target.value)}
                placeholder="limit=10&sort=createdAt:desc"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-[#0f3d2e] focus:outline-none"
              />
            </div>

            {/* Response Section */}
            {response && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-xs font-bold px-2.5 py-1 rounded-md ${
                        response.isError ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {response.status} {response.statusText}
                    </span>
                    <span className="text-xs font-mono text-slate-500">{response.durationMs} ms latency</span>
                    {response.headers["x-mockforge-source"] && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                        Origin: {response.headers["x-mockforge-source"]}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={copyCurl}
                      className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      {copied === "curl" ? "Copied! ✓" : "Copy cURL"}
                    </button>
                    <button
                      type="button"
                      onClick={copyResponse}
                      className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      {copied === "response" ? "Copied! ✓" : "Copy JSON"}
                    </button>
                  </div>
                </div>

                <pre className="h-64 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400 leading-relaxed">
                  {response.body}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="card-figma p-12 text-center text-slate-400 text-sm">
            Select a route from the sidebar to inspect and run requests.
          </div>
        )}
      </div>
    </div>
  );
}
