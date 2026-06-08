import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type { LogEnvelope } from "@ispyai/shared";
import { applyFilters, useDashboardStore } from "../store/dashboardStore";
import { fetchRecentLogs } from "../lib/api";
import { pathOf } from "../lib/format";

// Session Explorer: a denser table view with a per-pane search box so QA
// engineers can pivot quickly on URLs / methods / statuses for the active
// session. Reuses the global filter store for the structural filters.
export function SessionExplorer(): JSX.Element {
  const activeSessionId = useDashboardStore((s) => s.activeSessionId);
  const logs = useDashboardStore((s) =>
    activeSessionId ? s.logsBySession[activeSessionId] ?? [] : []
  );
  const filters = useDashboardStore((s) => s.filters);
  const replaceLogs = useDashboardStore((s) => s.replaceLogs);
  const selectLog = useDashboardStore((s) => s.selectLog);

  const [localQuery, setLocalQuery] = useState("");

  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    fetchRecentLogs(activeSessionId)
      .then((envelopes) => {
        if (!cancelled) replaceLogs(activeSessionId, envelopes);
      })
      .catch(() => {
        // No-op: live data will arrive via the realtime channel.
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, replaceLogs]);

  const filtered = useMemo(() => {
    const base = applyFilters(logs, filters);
    if (!localQuery.trim()) return base;
    const needle = localQuery.trim().toLowerCase();
    return base.filter((env: LogEnvelope) => {
      const { log } = env;
      return (
        log.endpoint.toLowerCase().includes(needle) ||
        log.method.toLowerCase().includes(needle) ||
        String(log.statusCode).includes(needle) ||
        (log.responseBody ?? "").toLowerCase().includes(needle)
      );
    });
  }, [logs, filters, localQuery]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-slate-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2 text-xs">
        <input
          type="search"
          placeholder="Explorer search (URL, body, method)..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          className="min-w-[16rem] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 placeholder:text-slate-500"
        />
        <span className="text-slate-500">{filtered.length} of {logs.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed text-xs">
          <thead className="sticky top-0 bg-slate-900 text-left uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-16 px-3 py-2">Status</th>
              <th className="w-16 px-3 py-2">Method</th>
              <th className="px-3 py-2">Endpoint</th>
              <th className="w-20 px-3 py-2 text-right">Latency</th>
              <th className="w-28 px-3 py-2 text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((env) => (
              <tr
                key={env.log.id}
                className="cursor-pointer border-b border-slate-800 hover:bg-slate-900"
                onClick={() => selectLog(env.log.id)}
              >
                <td className="px-3 py-2 font-mono">{env.log.statusCode || "ERR"}</td>
                <td className="px-3 py-2 font-mono text-status-info">
                  {env.log.method}
                </td>
                <td className="truncate px-3 py-2">{pathOf(env.log.endpoint)}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {Math.round(env.log.responseTime)}ms
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-500">
                  {dayjs(env.log.timestamp).format("HH:mm:ss")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-slate-500">
            No matching requests.
          </div>
        )}
      </div>
    </section>
  );
}
