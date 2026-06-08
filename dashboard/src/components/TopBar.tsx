import { useEffect, useState } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import { copyToClipboard, downloadSessionJson } from "../lib/format";

// Slim top bar with brand + connection status + live throughput indicator.
// Right side holds the share / export actions for the active session.
export function TopBar(): JSX.Element {
  const connected = useDashboardStore((s) => s.connected);
  const sessions = useDashboardStore((s) => s.sessions);
  const activeSessionId = useDashboardStore((s) => s.activeSessionId);
  const envelopes = useDashboardStore((s) =>
    activeSessionId ? s.logsBySession[activeSessionId] ?? [] : []
  );
  const viewerMode = useDashboardStore((s) => s.viewerMode);

  const logsPerMinute = useLogsPerMinute(envelopes);
  const [shared, setShared] = useState(false);

  const onShare = async (): Promise<void> => {
    if (!activeSessionId) return;
    const url = `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(
      activeSessionId
    )}`;
    const ok = await copyToClipboard(url);
    setShared(ok);
    setTimeout(() => setShared(false), 1_500);
  };

  const onExport = (): void => {
    if (!activeSessionId) return;
    downloadSessionJson(activeSessionId, envelopes);
  };

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
      <div className="flex items-baseline gap-3">
        <span className="text-base font-semibold tracking-tight">iSpyAI</span>
        <span className="text-xs uppercase tracking-wider text-slate-400">
          Remote Monitor
        </span>
        {viewerMode && (
          <span className="rounded border border-status-info/40 bg-status-info/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-status-info">
            Read-only
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span title="Total active sessions">
          {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </span>
        <span title="Logs per minute on the active session">
          {logsPerMinute} logs/min
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={
              "inline-block h-2 w-2 rounded-full " +
              (connected ? "bg-status-ok" : "bg-status-error")
            }
            aria-hidden
          />
          {connected ? "Live" : "Disconnected"}
        </span>
        {!viewerMode && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onShare}
              disabled={!activeSessionId}
              className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              {shared ? "Link copied" : "Share session"}
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={!activeSessionId || envelopes.length === 0}
              className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Export JSON
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// Counts how many logs arrived in the trailing 60 seconds. Recomputes on a
// 5s tick so the badge feels live without churning on every render.
function useLogsPerMinute(envelopes: { log: { timestamp: string } }[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(handle);
  }, []);
  const cutoff = now - 60_000;
  let count = 0;
  for (const env of envelopes) {
    if (Date.parse(env.log.timestamp) >= cutoff) count += 1;
  }
  return count;
}
