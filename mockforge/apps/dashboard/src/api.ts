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
    const payload = (await res.json().catch(() => null)) as
      | (SpecUploadResult & { error?: { code: string; message: string; details: Array<{ path: string; reason: string }> } })
      | null;
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
    return payload as SpecUploadResult;
  },
  /** Asks the server to re-read the file it was started with. */
  reloadFromDisk: async () => {
    const res = await fetch("/__admin/spec", { method: "POST" });
    if (!res.ok) throw new Error(`reload -> ${res.status}`);
    return (await res.json()) as SpecUploadResult;
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
