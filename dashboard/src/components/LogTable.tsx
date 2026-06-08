import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import dayjs from "dayjs";
import type { LogEnvelope } from "@ispyai/shared";
import { applyFilters, useDashboardStore } from "../store/dashboardStore";
import { fetchRecentLogs } from "../lib/api";
import { pathOf } from "../lib/format";

interface LogTableProps {
  /** When true, ignore the filter store's `status` and only show failures. */
  failuresOnly?: boolean;
}

const SLOW_THRESHOLD_MS = 1_000;

// Center pane: a virtualised log feed for the active session. Virtualisation
// keeps the dashboard responsive even when devices stream thousands of calls.
export function LogTable({ failuresOnly = false }: LogTableProps): JSX.Element {
  const activeSessionId = useDashboardStore((s) => s.activeSessionId);
  const logs = useDashboardStore((s) =>
    activeSessionId ? s.logsBySession[activeSessionId] ?? [] : []
  );
  const filters = useDashboardStore((s) => s.filters);
  const selectedLogId = useDashboardStore((s) => s.selectedLogId);
  const selectLog = useDashboardStore((s) => s.selectLog);
  const replaceLogs = useDashboardStore((s) => s.replaceLogs);
  const clearActiveSessionLogs = useDashboardStore((s) => s.clearActiveSessionLogs);
  const viewerMode = useDashboardStore((s) => s.viewerMode);

  const effectiveFilters = failuresOnly
    ? { ...filters, status: "fail" as const }
    : filters;

  const ordered = useMemo(() => {
    const filtered = applyFilters(logs, effectiveFilters);
    return [...filtered].reverse();
  }, [logs, effectiveFilters]);

  // Hydrate from REST when switching sessions so we get history without
  // waiting for the next live event.
  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    fetchRecentLogs(activeSessionId)
      .then((envelopes) => {
        if (!cancelled) replaceLogs(activeSessionId, envelopes);
      })
      .catch(() => {
        // Ignore - live socket will deliver new envelopes regardless.
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, replaceLogs]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: ordered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  return (
    <section
      className="flex min-w-0 flex-1 flex-col bg-slate-950"
      data-testid="log-table"
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-wider text-slate-400">
            {failuresOnly ? "Failed Requests" : "Live Logs"}
          </span>
          <span className="text-slate-500" data-testid="log-count">
            {ordered.length} shown
          </span>
        </div>
        {!viewerMode && (
          <button
            type="button"
            onClick={clearActiveSessionLogs}
            disabled={!activeSessionId}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            Clear view
          </button>
        )}
      </header>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        {ordered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {activeSessionId
              ? failuresOnly
                ? "No failed requests so far."
                : "No logs match the current filters."
              : "Select a session to begin."}
          </div>
        ) : (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const env = ordered[virtualRow.index]!;
              const isSelected = env.log.id === selectedLogId;
              return (
                <div
                  key={env.log.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <LogRow envelope={env} isSelected={isSelected} onSelect={selectLog} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface LogRowProps {
  envelope: LogEnvelope;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
}

function LogRow({ envelope, isSelected, onSelect }: LogRowProps): JSX.Element {
  const { log, analysis } = envelope;
  const rowTint = rowTintForLog(log.statusCode, log.responseTime);
  return (
    <button
      type="button"
      onClick={() => onSelect(log.id)}
      data-testid="log-row"
      data-status={log.statusCode}
      className={
        "flex w-full items-center gap-3 border-b border-slate-800 px-4 py-2 text-left transition-colors " +
        rowTint +
        (isSelected ? " ring-1 ring-status-info" : "")
      }
    >
      <span
        className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${colorForStatus(
          log.statusCode
        )}`}
      >
        {log.statusCode || "ERR"}
      </span>
      <span className="w-12 shrink-0 font-mono text-xs text-status-info">
        {log.method}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{pathOf(log.endpoint)}</span>
      <span className="w-20 shrink-0 text-right font-mono text-xs text-slate-300">
        {Math.round(log.responseTime)}ms
      </span>
      <span className="w-24 shrink-0 text-right font-mono text-[11px] text-slate-500">
        {dayjs(log.timestamp).format("HH:mm:ss")}
      </span>
      <span
        className={
          "w-16 shrink-0 text-right text-[11px] uppercase tracking-wide " +
          severityColor(analysis.severity)
        }
        title={analysis.summary}
      >
        {analysis.severity}
      </span>
    </button>
  );
}

function rowTintForLog(statusCode: number, responseTime: number): string {
  const isFailure = statusCode === 0 || statusCode >= 400;
  if (isFailure) {
    return "bg-status-error/10 hover:bg-status-error/15";
  }
  if (responseTime > SLOW_THRESHOLD_MS) {
    return "bg-status-warn/10 hover:bg-status-warn/15";
  }
  return "hover:bg-slate-900";
}

function colorForStatus(code: number): string {
  if (code >= 500) return "bg-status-error/15 text-status-error";
  if (code >= 400) return "bg-status-warn/15 text-status-warn";
  if (code >= 300) return "bg-status-info/15 text-status-info";
  if (code >= 200) return "bg-status-ok/15 text-status-ok";
  return "bg-slate-700/30 text-slate-400";
}

function severityColor(severity: "info" | "warn" | "error"): string {
  if (severity === "error") return "text-status-error";
  if (severity === "warn") return "text-status-warn";
  return "text-slate-400";
}
