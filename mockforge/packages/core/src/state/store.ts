import type { SessionData, SessionRecord } from "../types.js";
import { generateSeedRecords } from "../generator/generate.js";

export interface StoreOptions {
  sessionTtlMin: number;
  maxSessions: number;
  maxRecords: number;
}

export const DEFAULT_STORE_OPTIONS: StoreOptions = {
  sessionTtlMin: 60,
  maxSessions: 500,
  maxRecords: 10_000
};

/** How often abandoned sessions are reaped even without traffic. */
const SWEEP_INTERVAL_MS = 30_000;

/**
 * The sweeper never runs tighter than this. A zero TTL therefore still expires
 * sessions within a fraction of a second (a07 asks for 300 ms) instead of
 * busy-looping, and - just as important - a session is never dropped between
 * two requests of the same client, which is why the lazy check below is
 * disabled for TTLs this short.
 */
const MIN_SWEEP_INTERVAL_MS = 250;

/** Session ids are used as map keys and echoed in admin output, so they are
 *  restricted to a safe alphabet and length (B2). */
export function sanitizeSessionId(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "default";
}

export function newSessionId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `mf_${Date.now().toString(36)}_${random}`;
}

/**
 * In-memory, per-session state. Nothing here ever touches disk.
 *
 * Lifecycle (contract decision 9): TTL and the session cap are enforced lazily
 * on access - a request that touches an expired or evicted session simply gets a
 * fresh one - plus a 30 s sweep so abandoned sessions cannot grow the heap
 * without bound.
 */
export class Store {
  readonly sessions = new Map<string, SessionData>();

  /** Fixed-interval sweep handle; cleared by close(). */
  private timer: NodeJS.Timeout | null = null;

  constructor(readonly options: StoreOptions = DEFAULT_STORE_OPTIONS) {}

  /** Starts the background sweep. Safe to call more than once. */
  startSweeper(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), this.sweepIntervalMs());
    this.timer.unref?.();
  }

  /** Stops the background sweep. */
  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Sweep cadence: the TTL itself, clamped so it is never a busy loop. */
  private sweepIntervalMs(): number {
    const ttl = this.options.sessionTtlMin * 60_000;
    return Math.min(Math.max(ttl, MIN_SWEEP_INTERVAL_MS), SWEEP_INTERVAL_MS);
  }

  /**
   * Lazy expiry is only useful when the TTL is longer than one sweep tick. For
   * very short TTLs the sweeper is already fast enough, and a lazy check would
   * delete a session between two back-to-back requests of the same client.
   */
  private expiryIsLazy(): boolean {
    return this.options.sessionTtlMin * 60_000 > MIN_SWEEP_INTERVAL_MS;
  }

  private isExpired(session: SessionData, now: number): boolean {
    return now - session.lastAccessAt > this.options.sessionTtlMin * 60_000;
  }

  /** Drops every expired session. Runs on access and on the interval. */
  sweep(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session, now)) this.sessions.delete(id);
    }
  }

  /** Evicts least-recently-used sessions until a new one fits under the cap. */
  private evictForRoom(): void {
    while (this.sessions.size >= this.options.maxSessions) {
      let oldestId: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [id, session] of this.sessions) {
        if (session.lastAccessAt < oldestAt) {
          oldestAt = session.lastAccessAt;
          oldestId = id;
        }
      }
      if (oldestId === null) return;
      this.sessions.delete(oldestId);
    }
  }

  /** Returns the session, creating it on first use and refreshing its access time. */
  session(id: string): SessionData {
    if (this.expiryIsLazy()) this.sweep();
    const existing = this.sessions.get(id);
    if (existing) {
      existing.lastAccessAt = Date.now();
      return existing;
    }
    this.evictForRoom();
    const now = Date.now();
    const created: SessionData = {
      id,
      createdAt: now,
      lastAccessAt: now,
      resources: new Map(),
      created: new Set(),
      clientFields: new Set()
    };
    this.sessions.set(id, created);
    return created;
  }

  records(session: SessionData, resource: string): Map<string, SessionRecord> {
    let map = session.resources.get(resource);
    if (!map) {
      map = new Map<string, SessionRecord>();
      session.resources.set(resource, map);
    }
    return map;
  }

  /** Seeds a resource the first time a session touches it (deterministic). */
  ensureSeeded(
    session: SessionData,
    resource: string,
    schema: Record<string, unknown> | null,
    idField: string,
    root: Record<string, unknown>,
    seed: number
  ): Map<string, SessionRecord> {
    const map = this.records(session, resource);
    if (map.size === 0 && schema) {
      for (const record of generateSeedRecords(schema as never, idField, {
        root,
        seed,
        sessionId: session.id,
        resource
      })) {
        map.set(String(record[idField]), record);
      }
    }
    return map;
  }

  /** Number of records the client itself created in this session. */
  createdCount(session: SessionData): number {
    return session.created.size;
  }

  /** Records which property names the client has supplied in this session. */
  noteClientFields(session: SessionData, fields: Iterable<string>): void {
    for (const field of fields) session.clientFields.add(field);
  }

  /** Forgets one record id from the created set (used on delete). */
  forget(session: SessionData, recordId: string): void {
    session.created.delete(recordId);
  }

  resetSession(id: string): void {
    this.sessions.delete(id);
  }

  resetAll(): void {
    this.sessions.clear();
  }

  sessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  /** Per-session record totals, for the admin endpoints. */
  stats(session: SessionData): { resources: number; records: number } {
    let records = 0;
    for (const map of session.resources.values()) records += map.size;
    return { resources: session.resources.size, records };
  }
}
