import type { LogEnvelope, Session, SessionAnalysis } from "@ispyai/shared";

// Tiny REST client. The backend exposes the same data over WS, but the HTTP
// surface is handy for initial paint and for users hitting the dashboard via
// share links.
async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchSessions(): Promise<Session[]> {
  const { sessions } = await getJSON<{ sessions: Session[] }>("/v1/sessions");
  return sessions;
}

export async function fetchSession(sessionId: string): Promise<Session> {
  const { session } = await getJSON<{ session: Session }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}`
  );
  return session;
}

export async function fetchRecentLogs(sessionId: string): Promise<LogEnvelope[]> {
  const { logs } = await getJSON<{ logs: LogEnvelope[] }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/logs`
  );
  return logs;
}

export async function fetchSessionAnalysis(
  sessionId: string
): Promise<SessionAnalysis> {
  const { analysis } = await getJSON<{ analysis: SessionAnalysis }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/analysis`
  );
  return analysis;
}
