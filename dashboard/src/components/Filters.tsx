import { useDashboardStore } from "../store/dashboardStore";

const METHODS = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const STATUS_OPTIONS: Array<{
  value: "all" | "2xx" | "3xx" | "4xx" | "5xx" | "fail";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "2xx", label: "2xx" },
  { value: "3xx", label: "3xx" },
  { value: "4xx", label: "4xx" },
  { value: "5xx", label: "5xx" },
  { value: "fail", label: "Failures" },
];

// Toolbar above the log table. All inputs flow through the dashboardStore so
// filtering stays consistent across tab switches.
export function Filters(): JSX.Element {
  const filters = useDashboardStore((s) => s.filters);
  const setFilters = useDashboardStore((s) => s.setFilters);
  const resetFilters = useDashboardStore((s) => s.resetFilters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
      <input
        type="search"
        placeholder="Search URL, headers, body..."
        value={filters.query}
        onChange={(e) => setFilters({ query: e.target.value })}
        className="min-w-[14rem] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 placeholder:text-slate-500"
      />
      <select
        value={filters.method}
        onChange={(e) => setFilters({ method: e.target.value })}
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(e) =>
          setFilters({ status: e.target.value as typeof filters.status })
        }
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-slate-400">
        Min latency
        <input
          type="number"
          min={0}
          step={50}
          value={filters.minLatencyMs}
          onChange={(e) =>
            setFilters({ minLatencyMs: Number(e.target.value) || 0 })
          }
          className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
        />
        ms
      </label>
      <input
        type="text"
        placeholder="Endpoint contains..."
        value={filters.endpointSubstring}
        onChange={(e) => setFilters({ endpointSubstring: e.target.value })}
        className="w-44 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 placeholder:text-slate-500"
      />
      <button
        type="button"
        onClick={resetFilters}
        className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800"
      >
        Reset
      </button>
    </div>
  );
}
