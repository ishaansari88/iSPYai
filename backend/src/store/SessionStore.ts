// In-memory session store for the MVP. A future iteration would back this
// with Redis or Postgres; the surface stays the same so swapping is cheap.

import type {
  APILog,
  LogEnvelope,
  Session,
  SessionAnalysis,
} from "@ispyai/shared";

interface InternalSession extends Session {
  /** Bounded ring buffer of recent logs per session. Keeps memory predictable. */
  recentLogs: LogEnvelope[];
  /** Latest computed per-session analysis, if any. */
  analysis?: SessionAnalysis;
}

export interface SessionStoreOptions {
  /** Maximum logs retained per session before older entries roll off. */
  recentLogCap?: number;
  /** Idle TTL in ms; sessions with no activity past this window are evicted. */
  sessionTtlMs?: number;
  /** Sweep interval in ms for the TTL janitor. */
  sweepIntervalMs?: number;
  /** Clock source, injectable for tests. */
  now?: () => Date;
}

const DEFAULT_RECENT_LOG_CAP = 500;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_SWEEP_MS = 5 * 60 * 1_000;

export class SessionStore {
  private readonly sessions = new Map<string, InternalSession>();
  private readonly recentLogCap: number;
  private readonly ttlMs: number;
  private readonly sweepHandle?: NodeJS.Timeout;
  private readonly now: () => Date;

  constructor(options: SessionStoreOptions = {}) {
    this.recentLogCap = options.recentLogCap ?? DEFAULT_RECENT_LOG_CAP;
    this.ttlMs = options.sessionTtlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => new Date());

    const interval = options.sweepIntervalMs ?? DEFAULT_SWEEP_MS;
    if (interval > 0) {
      this.sweepHandle = setInterval(() => this.sweepExpired(), interval);
      // The janitor must never keep the Node process alive on its own.
      this.sweepHandle.unref?.();
    }
  }

  upsertFromHello(input: {
    sessionId: string;
    deviceName?: string;
    appVersion?: string;
    buildNumber?: string;
  }): Session {
    const now = this.now().toISOString();
    const existing = this.sessions.get(input.sessionId);

    if (existing) {
      existing.lastSeenAt = now;
      if (input.deviceName) existing.deviceName = input.deviceName;
      if (input.appVersion) existing.appVersion = input.appVersion;
      if (input.buildNumber) existing.buildNumber = input.buildNumber;
      return this.toExternal(existing);
    }

    const created: InternalSession = {
      id: input.sessionId,
      deviceName: input.deviceName,
      appVersion: input.appVersion,
      buildNumber: input.buildNumber,
      startedAt: now,
      lastSeenAt: now,
      logCount: 0,
      recentLogs: [],
    };
    this.sessions.set(input.sessionId, created);
    return this.toExternal(created);
  }

  recordLog(envelope: LogEnvelope): Session {
    const sessionId = envelope.log.sessionId ?? "unknown";

    // Auto-create the session if a log arrives before a hello (e.g. plain HTTP
    // fallback path that skipped the bootstrap call).
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.upsertInternal(sessionId, envelope.log);
    }

    session.logCount += 1;
    session.lastSeenAt = this.now().toISOString();
    session.recentLogs.push(envelope);
    if (session.recentLogs.length > this.recentLogCap) {
      session.recentLogs.splice(0, session.recentLogs.length - this.recentLogCap);
    }

    return this.toExternal(session);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .map((s) => this.toExternal(s));
  }

  getSession(sessionId: string): Session | undefined {
    const s = this.sessions.get(sessionId);
    return s ? this.toExternal(s) : undefined;
  }

  getRecentLogs(sessionId: string): LogEnvelope[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.recentLogs] : [];
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  setAnalysis(sessionId: string, analysis: SessionAnalysis): void {
    const session = this.sessions.get(sessionId);
    if (session) session.analysis = analysis;
  }

  getAnalysis(sessionId: string): SessionAnalysis | undefined {
    return this.sessions.get(sessionId)?.analysis;
  }

  /** Returns the number of sessions evicted (exposed mainly for tests). */
  sweepExpired(reference: Date = this.now()): number {
    const cutoff = reference.getTime() - this.ttlMs;
    let evicted = 0;
    for (const [id, session] of this.sessions) {
      if (Date.parse(session.lastSeenAt) < cutoff) {
        this.sessions.delete(id);
        evicted += 1;
      }
    }
    return evicted;
  }

  /** Stops the background TTL janitor. Mostly useful for test teardown. */
  shutdown(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
  }

  private upsertInternal(
    sessionId: string,
    meta: Pick<APILog, "deviceName" | "appVersion" | "buildNumber">
  ): InternalSession {
    const now = this.now().toISOString();
    const created: InternalSession = {
      id: sessionId,
      deviceName: meta.deviceName,
      appVersion: meta.appVersion,
      buildNumber: meta.buildNumber,
      startedAt: now,
      lastSeenAt: now,
      logCount: 0,
      recentLogs: [],
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  private toExternal(s: InternalSession): Session {
    const { recentLogs: _logs, analysis: _analysis, ...external } = s;
    return external;
  }
}
