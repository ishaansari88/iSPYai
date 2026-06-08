import { useEffect } from "react";
import dayjs from "dayjs";
import type { AnalysisLogRef, SessionAnalysis } from "@ispyai/shared";
import { useDashboardStore } from "../store/dashboardStore";
import { fetchSessionAnalysis } from "../lib/api";
import { copyToClipboard, pathOf } from "../lib/format";

// AI Analysis tab: structured per-session report with the cards listed in the
// product spec (Issue Summary, Root Cause, Failed/Slow/Auth APIs, Jira
// helpers, Severity badge). Hydrated on mount + refreshed live via the
// `analysis:updated` WS event handled in App.tsx.
export function AIAnalysisPanel(): JSX.Element {
  const activeSessionId = useDashboardStore((s) => s.activeSessionId);
  const analysis = useDashboardStore((s) =>
    activeSessionId ? s.analysisBySession[activeSessionId] : undefined
  );
  const setAnalysis = useDashboardStore((s) => s.setAnalysis);

  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    fetchSessionAnalysis(activeSessionId)
      .then((report) => {
        if (!cancelled) setAnalysis(activeSessionId, report);
      })
      .catch(() => {
        // Backend may not have produced a report yet; the live event will
        // fill in shortly.
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, setAnalysis]);

  if (!activeSessionId) {
    return (
      <Empty>Select a session to view its AI analysis.</Empty>
    );
  }
  if (!analysis) {
    return <Empty>Waiting for the first analysis report...</Empty>;
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-slate-950 px-4 py-3">
      <Header analysis={analysis} />

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card title="Issue Summary">
          <p className="text-sm text-slate-200">{analysis.issueSummary}</p>
        </Card>
        <Card title="Possible Root Cause">
          <p className="text-sm text-slate-200">{analysis.possibleRootCause}</p>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <RefsCard
          title="Failed APIs"
          empty="No failed requests captured."
          refs={analysis.failedAPIs}
        />
        <RefsCard
          title="Slow APIs"
          empty="No slow requests captured."
          refs={analysis.slowAPIs}
        />
        <RefsCard
          title="Auth Issues"
          empty="No auth-related failures."
          refs={analysis.authIssues}
        />
      </div>

      <JiraCard analysis={analysis} />
    </section>
  );
}

function Header({ analysis }: { analysis: SessionAnalysis }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          AI Analysis
        </h2>
        <p className="text-[11px] text-slate-500">
          Generated {dayjs(analysis.generatedAt).format("HH:mm:ss")} · source {analysis.source}
        </p>
      </div>
      <SeverityBadge severity={analysis.severity} />
    </div>
  );
}

function SeverityBadge({
  severity,
}: {
  severity: SessionAnalysis["severity"];
}): JSX.Element {
  const cls =
    severity === "high"
      ? "border-status-error/50 bg-status-error/15 text-status-error"
      : severity === "medium"
      ? "border-status-warn/50 bg-status-warn/15 text-status-warn"
      : "border-status-ok/50 bg-status-ok/15 text-status-ok";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${cls}`}
    >
      Severity: {severity}
    </span>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function RefsCard({
  title,
  empty,
  refs,
}: {
  title: string;
  empty: string;
  refs: AnalysisLogRef[];
}): JSX.Element {
  return (
    <Card title={`${title} (${refs.length})`}>
      {refs.length === 0 ? (
        <p className="text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-xs">
          {refs.slice(0, 10).map((r) => (
            <li key={r.id} className="flex items-center gap-2 font-mono">
              <span className="w-10 shrink-0 text-slate-400">{r.method}</span>
              <span className="min-w-0 flex-1 truncate text-slate-200">
                {pathOf(r.endpoint)}
              </span>
              <span className="w-12 shrink-0 text-right text-slate-400">
                {r.statusCode || "ERR"}
              </span>
              <span className="w-16 shrink-0 text-right text-slate-500">
                {Math.round(r.responseTime)}ms
              </span>
            </li>
          ))}
          {refs.length > 10 && (
            <li className="text-[11px] text-slate-500">
              +{refs.length - 10} more
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function JiraCard({ analysis }: { analysis: SessionAnalysis }): JSX.Element {
  const onCopyTitle = () => copyToClipboard(analysis.suggestedJiraTitle);
  const onCopyDescription = () => copyToClipboard(analysis.suggestedJiraDescription);
  const onCopyAll = () =>
    copyToClipboard(
      `${analysis.suggestedJiraTitle}\n\n${analysis.suggestedJiraDescription}`
    );
  return (
    <div className="mt-3 rounded border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Suggested Jira ticket
        </h3>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={onCopyTitle}
            className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800"
          >
            Copy title
          </button>
          <button
            type="button"
            onClick={onCopyDescription}
            className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800"
          >
            Copy description
          </button>
          <button
            type="button"
            onClick={onCopyAll}
            className="rounded border border-status-info/50 bg-status-info/10 px-2 py-1 text-status-info hover:bg-status-info/20"
          >
            Copy both
          </button>
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-950 p-3 text-sm text-slate-200">
        <p className="font-semibold">{analysis.suggestedJiraTitle}</p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-slate-300">
          {analysis.suggestedJiraDescription}
        </pre>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <section className="flex min-w-0 flex-1 items-center justify-center bg-slate-950 text-sm text-slate-500">
      {children}
    </section>
  );
}
