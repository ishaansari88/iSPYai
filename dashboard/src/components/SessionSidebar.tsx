import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useDashboardStore } from "../store/dashboardStore";

dayjs.extend(relativeTime);

// Left pane: every device session the backend has seen. The selected row drives
// which logs appear in the middle pane.
export function SessionSidebar(): JSX.Element {
  const sessions = useDashboardStore((s) => s.sessions);
  const activeSessionId = useDashboardStore((s) => s.activeSessionId);
  const setActiveSession = useDashboardStore((s) => s.setActiveSession);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Sessions
      </div>
      <ul className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <li className="px-3 py-4 text-sm text-slate-500">
            Waiting for a device to connect…
          </li>
        )}
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => setActiveSession(session.id)}
                className={
                  "flex w-full flex-col gap-0.5 border-l-2 px-3 py-2 text-left transition-colors " +
                  (isActive
                    ? "border-status-info bg-slate-800"
                    : "border-transparent hover:bg-slate-800/60")
                }
              >
                <span className="truncate text-sm font-medium">
                  {session.deviceName ?? "Unknown device"}
                </span>
                <span className="truncate text-xs text-slate-400">
                  v{session.appVersion ?? "?"} · {session.logCount} log
                  {session.logCount === 1 ? "" : "s"}
                </span>
                <span className="truncate font-mono text-[10px] text-slate-500">
                  {session.id.slice(0, 12)}… · {dayjs(session.lastSeenAt).fromNow()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
