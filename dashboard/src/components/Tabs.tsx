import { useDashboardStore, type ViewTab } from "../store/dashboardStore";

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "live", label: "Live Stream" },
  { id: "failed", label: "Failed Requests" },
  { id: "explorer", label: "Session Explorer" },
  { id: "ai", label: "AI Analysis" },
];

// Pill-style tab selector that drives the center pane.
export function Tabs(): JSX.Element {
  const viewTab = useDashboardStore((s) => s.viewTab);
  const setViewTab = useDashboardStore((s) => s.setViewTab);

  return (
    <div
      role="tablist"
      aria-label="Center pane view"
      className="flex items-center gap-1 border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-xs"
    >
      {TABS.map((tab) => {
        const active = tab.id === viewTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => setViewTab(tab.id)}
            className={
              "rounded-full px-3 py-1 transition-colors " +
              (active
                ? "bg-status-info/20 text-status-info"
                : "text-slate-300 hover:bg-slate-800")
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
