// Zustand store holding the entire dashboard view-model. Keeping logs grouped
// by sessionId means switching active sessions is a constant-time operation
// and we never tear down the in-memory log history.

import { create } from "zustand";
import type { LogEnvelope, Session, SessionAnalysis } from "@ispyai/shared";

export type ViewTab = "live" | "failed" | "explorer" | "ai";

export interface LogFilters {
  query: string;
  method: string;
  status: "all" | "2xx" | "3xx" | "4xx" | "5xx" | "fail";
  minLatencyMs: number;
  endpointSubstring: string;
}

export const DEFAULT_FILTERS: LogFilters = {
  query: "",
  method: "ALL",
  status: "all",
  minLatencyMs: 0,
  endpointSubstring: "",
};

interface DashboardState {
  sessions: Session[];
  activeSessionId: string | null;
  logsBySession: Record<string, LogEnvelope[]>;
  analysisBySession: Record<string, SessionAnalysis>;
  selectedLogId: string | null;
  connected: boolean;
  viewTab: ViewTab;
  filters: LogFilters;
  /** When true, the dashboard is a read-only share-link view. */
  viewerMode: boolean;

  setConnected: (connected: boolean) => void;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (sessionId: string | null) => void;
  appendLog: (envelope: LogEnvelope) => void;
  replaceLogs: (sessionId: string, envelopes: LogEnvelope[]) => void;
  selectLog: (id: string | null) => void;
  clearActiveSessionLogs: () => void;
  setAnalysis: (sessionId: string, analysis: SessionAnalysis) => void;
  setViewTab: (tab: ViewTab) => void;
  setFilters: (patch: Partial<LogFilters>) => void;
  resetFilters: () => void;
  setViewerMode: (on: boolean) => void;
}

const MAX_LOGS_PER_SESSION = 1_000;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  logsBySession: {},
  analysisBySession: {},
  selectedLogId: null,
  connected: false,
  viewTab: "live",
  filters: { ...DEFAULT_FILTERS },
  viewerMode: false,

  setConnected: (connected) => set({ connected }),

  setSessions: (sessions) => {
    set({ sessions });
    // Auto-select the most recently active session on first load so the user
    // doesn't stare at an empty pane.
    const { activeSessionId } = get();
    if (!activeSessionId && sessions.length > 0) {
      set({ activeSessionId: sessions[0]!.id });
    }
  },

  setActiveSession: (sessionId) =>
    set({ activeSessionId: sessionId, selectedLogId: null }),

  appendLog: (envelope) => {
    const sessionId = envelope.log.sessionId ?? "unknown";
    set((state) => {
      const prev = state.logsBySession[sessionId] ?? [];
      const next = [...prev, envelope];
      if (next.length > MAX_LOGS_PER_SESSION) {
        next.splice(0, next.length - MAX_LOGS_PER_SESSION);
      }
      return {
        logsBySession: { ...state.logsBySession, [sessionId]: next },
      };
    });
  },

  replaceLogs: (sessionId, envelopes) =>
    set((state) => ({
      logsBySession: { ...state.logsBySession, [sessionId]: envelopes },
    })),

  selectLog: (id) => set({ selectedLogId: id }),

  clearActiveSessionLogs: () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    set((state) => ({
      logsBySession: { ...state.logsBySession, [activeSessionId]: [] },
      selectedLogId: null,
    }));
  },

  setAnalysis: (sessionId, analysis) =>
    set((state) => ({
      analysisBySession: { ...state.analysisBySession, [sessionId]: analysis },
    })),

  setViewTab: (viewTab) => set({ viewTab }),

  setFilters: (patch) =>
    set((state) => ({ filters: { ...state.filters, ...patch } })),

  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  setViewerMode: (viewerMode) => set({ viewerMode }),
}));

/** Pure helper used by views and unit tests. */
export function applyFilters(
  envelopes: LogEnvelope[],
  filters: LogFilters
): LogEnvelope[] {
  const needle = filters.query.trim().toLowerCase();
  return envelopes.filter((env) => {
    const { log } = env;
    if (filters.method !== "ALL" && log.method.toUpperCase() !== filters.method) {
      return false;
    }
    if (filters.minLatencyMs > 0 && log.responseTime < filters.minLatencyMs) {
      return false;
    }
    if (
      filters.endpointSubstring &&
      !log.endpoint
        .toLowerCase()
        .includes(filters.endpointSubstring.toLowerCase())
    ) {
      return false;
    }
    if (!matchesStatus(log.statusCode, filters.status)) return false;

    if (needle) {
      if (!matchesNeedle(env, needle)) return false;
    }
    return true;
  });
}

function matchesStatus(code: number, status: LogFilters["status"]): boolean {
  switch (status) {
    case "all":
      return true;
    case "2xx":
      return code >= 200 && code < 300;
    case "3xx":
      return code >= 300 && code < 400;
    case "4xx":
      return code >= 400 && code < 500;
    case "5xx":
      return code >= 500 && code < 600;
    case "fail":
      return code === 0 || code >= 400;
  }
}

function matchesNeedle(env: LogEnvelope, needle: string): boolean {
  const { log } = env;
  if (log.endpoint.toLowerCase().includes(needle)) return true;
  if (log.method.toLowerCase().includes(needle)) return true;
  if (String(log.statusCode).includes(needle)) return true;
  if (log.responseBody && log.responseBody.toLowerCase().includes(needle)) {
    return true;
  }
  if (log.requestBody && log.requestBody.toLowerCase().includes(needle)) {
    return true;
  }
  for (const map of [log.requestHeaders, log.responseHeaders]) {
    for (const [k, v] of Object.entries(map)) {
      if (k.toLowerCase().includes(needle)) return true;
      if (v.toLowerCase().includes(needle)) return true;
    }
  }
  return false;
}
