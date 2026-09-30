/** Typed access to the mock server's admin surface. Everything is relative:
 *  the dashboard is served by the mock itself, so there is no other origin. */

export interface RouteInfo {
  method: string;
  path: string;
  kind: string;
  resource: string | null;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastAccessAt: string;
  resources: number;
  records: number;
}

export interface ChaosConfig {
  latencyMs: number;
  errorRate: number;
  split404: number;
  split500: number;
}

export interface HealthInfo {
  status: string;
  routes: number;
  sessions: number;
  uptimeMs: number;
  bootMs: number;
  /** False until a spec is loaded - the dashboard then shows the upload view. */
  specLoaded?: boolean;
}

/** What POST /__admin/spec answers after a successful upload. */
export interface SpecUploadResult {
  title: string;
  version: string;
  routes: number;
  resources: number;
  reloaded: boolean;
  source: "upload" | "disk";
  filename: string | null;
}

export interface LogEvent {
  time: string;
  session: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  fault: string | null;
  validation: string | null;
  source?: string;
  fallback?: boolean;
}

export interface SampleInfo {
  id: string;
  filename: string;
  title: string;
  version: string;
  description: string;
  routesCount: number;
  resourcesCount: number;
}

export interface SpecDetails {
  title: string;
  version: string;
  routes: number;
  resources: number;
  sourcePath: string | null;
}

export interface ReloadResult {
  title: string;
  version: string;
  routes: number;
  reloaded: boolean;
  source?: string;
}

export interface DockerInfo {
  serviceName: string;
  targetPort: number;
  targetUrl: string;
  dockerCompose: string;
}

export interface FrontendLinkInfo {
  linkedFrontendUrl: string;
  dummyServerUrl: string;
  corsActive: boolean;
  envSnippet: string;
  clientSnippet: string;
}

export interface HandshakeResult {
  success: boolean;
  handshakeToken: string;
  targetUrl: string;
  linkedFrontendUrl: string;
  sessionId: string;
  direction?: "push" | "pull";
  stages: {
    connectivity: {
      passed: boolean;
      latencyMs: number;
      status: number;
      url: string;
    };
    schema: {
      passed: boolean;
      totalRoutes: number;
      matchedRoutes: number;
      parityPercent: number;
      specTitle: string;
    };
    memory: {
      passed: boolean;
      sessionId: string;
      entitiesCount: number;
      strategy: string;
      transferStatus: string;
      resourcesSummary: Record<string, number>;
      direction?: "push" | "pull";
    };
    handoff: {
      passed: boolean;
      mode: "proxy_bridge" | "direct_cutover";
      proxyActive: boolean;
      dummyStopping: boolean;
      handshakeToken: string;
    };
  };
  proxyBridge: {
    enabled: boolean;
    targetUrl: string;
    authHeader?: string;
    circuitBreaker?: boolean;
  };
  message: string;
}

export interface ProxyConfig {
  enabled: boolean;
  targetUrl: string;
  authHeader: string;
  circuitBreaker: boolean;
}

export interface AuthConfig {
  enabled: boolean;
  type: "bearer" | "apikey";
  token: string;
  requiredRole: "viewer" | "editor" | "admin";
}

export interface DualMemoryState {
  sessionId: string;
  targetUrl: string;
  syncStatus: "in_sync" | "partial_sync" | "staged" | "empty";
  dummy: {
    sessionId: string;
    entitiesCount: number;
    resources: Record<string, unknown[]>;
  };
  backend: {
    reachable: boolean;
    entitiesCount: number;
    resources: Record<string, unknown[]>;
  };
  matchCount: number;
}

export interface CutoverResult {
  success: boolean;
  targetUrl: string;
  backendReady: boolean;
  backendLatencyMs: number;
  sessionsCount: number;
  sessionsData: Record<string, Record<string, unknown[]>>;
  dummyStopping: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  routes: () => getJson<RouteInfo[]>("/__admin/routes"),
  sessions: () => getJson<SessionInfo[]>("/__admin/sessions"),
  chaos: () => getJson<ChaosConfig>("/__admin/chaos"),
  health: () => getJson<HealthInfo>("/__health"),
  spec: () => getJson<SpecDetails>("/__admin/spec"),
  samples: () => getJson<SampleInfo[]>("/__admin/samples"),
  dockerInfo: () => getJson<DockerInfo>("/__admin/docker"),
  sessionData: (id: string) => getJson<Record<string, Array<Record<string, unknown>>>>(`/__admin/sessions/${encodeURIComponent(id)}/data`),
  deleteSession: async (id: string) => {
    await fetch(`/__admin/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  resetSessions: async () => {
    await fetch("/__admin/sessions", { method: "DELETE" });
  },
  updateChaos: async (config: Partial<ChaosConfig>) => {
    const res = await fetch("/__admin/chaos", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config)
    });
    if (!res.ok) throw new Error(`chaos update -> ${res.status}`);
    return (await res.json()) as ChaosConfig;
  },
  /** Uploads a spec. Accepts the raw text, so the dashboard reads the file
   *  itself with FileReader and never has to build a multipart body. */
  uploadSpec: async (spec: string, filename?: string) => {
    const res = await fetch("/__admin/spec", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec, ...(filename ? { filename } : {}) })
    });
    const payload = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const message = payload?.error?.message ?? `upload -> ${res.status}`;
      const error = new Error(message) as Error & {
        code?: string;
        details?: Array<{ path: string; reason: string }>;
      };
      error.code = payload?.error?.code;
      error.details = payload?.error?.details;
      throw error;
    }
    return payload;
  },
  /** Asks the server to re-read the file it was started with. */
  reloadFromDisk: async () => {
    const res = await fetch("/__admin/spec", { method: "POST" });
    if (!res.ok) throw new Error(`reload -> ${res.status}`);
    return await res.json();
  },
  loadSample: async (sampleFilename: string): Promise<ReloadResult> => {
    const res = await fetch("/__admin/spec", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sample: sampleFilename })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to load sample: ${res.status}`);
    }
    return data as ReloadResult;
  },
  cutoverToBackend: async (targetUrl: string, stopDummy = true): Promise<CutoverResult> => {
    const res = await fetch("/__admin/cutover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetUrl, stopDummy })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Cutover request failed: ${res.status}`);
    }
    return data as CutoverResult;
  },
  frontendLink: () => getJson<FrontendLinkInfo>("/__admin/frontend-link"),
  linkFrontend: async (frontendUrl: string): Promise<FrontendLinkInfo> => {
    const res = await fetch("/__admin/frontend-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frontendUrl })
    });
    return (await res.json()) as FrontendLinkInfo;
  },
  proxyConfig: () => getJson<ProxyConfig>("/__admin/proxy"),
  updateProxy: async (config: Partial<ProxyConfig>): Promise<ProxyConfig> => {
    const res = await fetch("/__admin/proxy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config)
    });
    return (await res.json()) as ProxyConfig;
  },
  runHandshake: async (params: {
    targetUrl: string;
    frontendUrl?: string;
    sessionId?: string;
    strategy?: "upsert" | "append" | "clean_sync";
    direction?: "push" | "pull";
    authHeader?: string;
    autoProxy?: boolean;
    autoStop?: boolean;
    transferMemory?: boolean;
  }): Promise<HandshakeResult> => {
    const res = await fetch("/__admin/handshake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params)
    });
    return (await res.json()) as HandshakeResult;
  },
  pullMemory: async (params: {
    targetUrl: string;
    sessionId?: string;
    strategy?: "upsert" | "append" | "clean_sync";
  }) => {
    const res = await fetch("/__admin/pull-memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params)
    });
    return await res.json();
  },
  dualMemory: (targetUrl?: string, sessionId?: string) => {
    const params = new URLSearchParams();
    if (targetUrl) params.set("targetUrl", targetUrl);
    if (sessionId) params.set("sessionId", sessionId);
    return getJson<DualMemoryState>(`/__admin/backend-memory?${params.toString()}`);
  },
  authConfig: () => getJson<AuthConfig>("/__admin/auth"),
  updateAuth: async (config: Partial<AuthConfig>): Promise<AuthConfig> => {
    const res = await fetch("/__admin/auth", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config)
    });
    return (await res.json()) as AuthConfig;
>>>>>>> e843bdf (feat: complete standalone test suite, dual-store memory sync, architecture docs, and setup manual)
  }
};

/** Subscribes to the SSE request log. Returns an unsubscribe function. */
export function subscribeToLogs(onEvent: (event: LogEvent) => void): () => void {
  const source = new EventSource("/__admin/logs");
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as LogEvent);
    } catch {
      /* a malformed line is not worth breaking the stream over */
    }
  };
  return () => source.close();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
