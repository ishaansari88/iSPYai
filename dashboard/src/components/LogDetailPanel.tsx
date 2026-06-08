import { useMemo, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import type { LogEnvelope } from "@ispyai/shared";
import { useDashboardStore } from "../store/dashboardStore";
import { copyToClipboard, formatBody, toCurl } from "../lib/format";

// Right pane: full inspection of a single log + the analyzer's verdict.
// Collapsible via the chevron at the top-right so users can reclaim horizontal
// real-estate on smaller monitors.
export function LogDetailPanel(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const activeSessionId = useDashboardStore((s) => s.activeSessionId);
  const selectedLogId = useDashboardStore((s) => s.selectedLogId);
  const envelope = useDashboardStore<LogEnvelope | undefined>((s) => {
    if (!activeSessionId || !selectedLogId) return undefined;
    return (s.logsBySession[activeSessionId] ?? []).find(
      (e) => e.log.id === selectedLogId
    );
  });

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-l border-slate-800 bg-slate-900 py-2">
        <button
          type="button"
          aria-label="Expand detail panel"
          onClick={() => setCollapsed(false)}
          className="rounded border border-slate-700 px-1 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          {"<"}
        </button>
      </aside>
    );
  }

  if (!envelope) {
    return (
      <DetailShell onCollapse={() => setCollapsed(true)}>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
          Select a log to inspect headers, body, and the AI insight.
        </div>
      </DetailShell>
    );
  }

  const { log, analysis } = envelope;

  return (
    <DetailShell onCollapse={() => setCollapsed(true)}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        <div className="mb-4">
          <div className="font-mono text-xs text-slate-400">
            {log.method} · {log.statusCode} · {Math.round(log.responseTime)}ms
          </div>
          <div className="mt-1 break-all font-mono text-xs">{log.endpoint}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {dayjs(log.timestamp).format("YYYY-MM-DD HH:mm:ss.SSS")}
          </div>
        </div>

        <CopyToolbar log={log} />

        <DetailSection title="Insight">
          <div
            className={
              "rounded border px-3 py-2 " +
              (analysis.severity === "error"
                ? "border-status-error/40 bg-status-error/10"
                : analysis.severity === "warn"
                ? "border-status-warn/40 bg-status-warn/10"
                : "border-slate-700 bg-slate-800/40")
            }
          >
            <div className="text-xs uppercase tracking-wider text-slate-400">
              {analysis.category} · {analysis.source}
            </div>
            <div className="mt-1 text-sm">{analysis.summary}</div>
            {analysis.suggestion && (
              <div className="mt-1 text-xs text-slate-400">{analysis.suggestion}</div>
            )}
          </div>
        </DetailSection>

        <DetailSection title="Request headers">
          <HeaderTable headers={log.requestHeaders} />
        </DetailSection>

        {log.requestBody !== undefined && log.requestBody !== "" && (
          <DetailSection title="Request body">
            <BodyView body={log.requestBody} />
          </DetailSection>
        )}

        <DetailSection title="Response headers">
          <HeaderTable headers={log.responseHeaders} />
        </DetailSection>

        <DetailSection title="Response body">
          <BodyView body={log.responseBody} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}

function DetailShell({
  children,
  onCollapse,
}: {
  children: ReactNode;
  onCollapse: () => void;
}): JSX.Element {
  return (
    <aside className="flex w-[28rem] shrink-0 flex-col border-l border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span>Detail</span>
        <button
          type="button"
          aria-label="Collapse detail panel"
          onClick={onCollapse}
          className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800"
        >
          {">"}
        </button>
      </div>
      {children}
    </aside>
  );
}

function CopyToolbar({ log }: { log: LogEnvelope["log"] }): JSX.Element {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handle = async (key: string, value: string): Promise<void> => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1_200);
    }
  };

  const button = (key: string, label: string, value: string) => (
    <button
      key={key}
      type="button"
      onClick={() => handle(key, value)}
      className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
    >
      {copiedKey === key ? "Copied" : label}
    </button>
  );

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {button("curl", "Copy as cURL", toCurl(log))}
      {button("req-headers", "Copy req headers", JSON.stringify(log.requestHeaders, null, 2))}
      {button("res-headers", "Copy res headers", JSON.stringify(log.responseHeaders, null, 2))}
      {button("res-body", "Copy response body", log.responseBody)}
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function HeaderTable({ headers }: { headers: Record<string, string> }): JSX.Element {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <div className="text-xs text-slate-500">None</div>;
  }
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
      {entries.map(([k, v]) => (
        <HeaderRow key={k} k={k} v={v} />
      ))}
    </dl>
  );
}

function HeaderRow({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <>
      <dt className="truncate text-slate-400">{k}</dt>
      <dd className="break-all">{v}</dd>
    </>
  );
}

function BodyView({ body }: { body: string }): JSX.Element {
  const pretty = useMemo(() => formatBody(body), [body]);
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[11px]">
      {pretty || "<empty>"}
    </pre>
  );
}
