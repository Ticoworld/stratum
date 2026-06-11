import { buildWatchlistDailySummary } from "@/lib/watchlists/dailySummary";
import type { WatchlistOverview } from "@/lib/watchlists/repository";

interface WatchlistDailySummaryPanelProps {
  watchlist: WatchlistOverview | null;
  currentTime: number;
}

export function WatchlistDailySummaryPanel({
  watchlist,
  currentTime,
}: WatchlistDailySummaryPanelProps) {
  if (!watchlist || watchlist.entries.length === 0) return null;

  const summary = buildWatchlistDailySummary(watchlist.entries, currentTime);
  if (!summary) return null;

  return (
    <section
      data-testid="watchlist-daily-summary"
      className="rounded-[20px] border bg-[var(--surface)] px-5 py-3.5 lg:px-6"
      style={{ borderColor: "var(--border)" }}
    >
      <p
        className="text-[11px] font-medium tracking-[0.02em]"
        style={{ color: "var(--foreground-muted)" }}
      >
        Today&apos;s watchlist
      </p>
      <p
        className="mt-1 text-[14px] font-semibold leading-5"
        style={{ color: "var(--foreground)" }}
      >
        {summary.primaryLine}
      </p>
      <p
        className="mt-0.5 text-[13px] leading-5"
        style={{ color: "var(--foreground-secondary)" }}
      >
        {summary.detailLine}
      </p>
    </section>
  );
}
