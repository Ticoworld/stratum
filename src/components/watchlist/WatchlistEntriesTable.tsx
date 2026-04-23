"use client";

import Link from "next/link";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  buildWatchlistDisplayIdentity,
  formatWatchlistDateTime,
  formatWatchlistMetadataLine,
  formatWatchlistTrackingState,
} from "@/lib/watchlists/presentation";
import type { WatchlistOverview } from "@/lib/watchlists/repository";

interface WatchlistEntriesTableProps {
  watchlist: WatchlistOverview | null;
  activeEntryId: string | null;
  pendingRemovalId: string | null;
  pendingRefreshId: string | null;
  currentTime: number | null;
  onRemoveEntry: (entryId: string) => void;
  onRefreshEntry: (entryId: string) => void;
  onSelectEntry: (entryId: string) => void;
}

type WatchlistEntry = WatchlistOverview["entries"][number];

function formatScheduledNextRunValue(
  cadence: string | null | undefined,
  value: string | null | undefined,
  currentTime: number | null
): string {
  if (cadence === "off" || !value) return "Not scheduled";

  const timestamp = new Date(value).getTime();
  if (currentTime !== null && !Number.isNaN(timestamp) && timestamp <= currentTime) {
    return "Due now";
  }
  return formatWatchlistDateTime(value, "Not scheduled");
}

export function WatchlistEntriesTable({
  watchlist,
  activeEntryId,
  pendingRemovalId,
  pendingRefreshId,
  currentTime,
  onRemoveEntry,
  onRefreshEntry,
  onSelectEntry,
}: WatchlistEntriesTableProps) {
  if (!watchlist) {
    return (
      <div className="rounded-[24px] border bg-[var(--surface)] p-4 text-[13px] leading-6" style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}>
        No watchlist is available yet.
      </div>
    );
  }

  if (watchlist.entries.length === 0) {
    return (
      <div className="rounded-[24px] border bg-[var(--surface)] p-4 text-[13px] leading-6" style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}>
        This watchlist is empty. Add a company to start tracking.
      </div>
    );
  }

  const scheduledCount = watchlist.entries.filter((entry) => entry.scheduleCadence !== "off").length;
  const unsavedCount = watchlist.entries.filter((entry) => !entry.latestBriefId).length;
  const unsavedLabel = unsavedCount === 1 ? "no saved brief" : "no saved briefs";

  return (
    <section className="overflow-hidden rounded-[24px] border bg-[var(--surface)]" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-col gap-2 border-b px-5 py-4 lg:flex-row lg:items-end lg:justify-between" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
            Tracked companies
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-[13px]" style={{ color: "var(--foreground-secondary)" }}>
          <span>
            <strong style={{ color: "var(--foreground)" }}>{watchlist.entryCount}</strong> tracked
          </span>
          <span>
            <strong style={{ color: "var(--foreground)" }}>{scheduledCount}</strong> scheduled
          </span>
            <span>
              <strong style={{ color: "var(--foreground)" }}>{unsavedCount}</strong> {unsavedLabel}
            </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <colgroup>
            <col style={{ width: "34%", minWidth: "200px" }} />
            <col style={{ width: "22%", minWidth: "150px" }} />
            <col style={{ width: "16%", minWidth: "120px" }} />
            <col style={{ width: "14%", minWidth: "100px" }} />
            <col style={{ width: "14%", minWidth: "130px" }} />
          </colgroup>
          <thead>
            <tr className="border-b text-left text-[10px] font-medium tracking-[0.02em]" style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}>
              <th className="px-5 py-3.5">Company</th>
              <th className="px-5 py-3.5">State</th>
              <th className="px-5 py-3.5">Last checked</th>
              <th className="px-5 py-3.5">Source</th>
              <th className="px-5 py-3.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {watchlist.entries.map((entry) => {
              const active = activeEntryId === entry.id;
              const displayIdentity = buildWatchlistDisplayIdentity({
                requestedQuery: entry.requestedQuery,
                matchedCompanyName: entry.latestMatchedCompanyName,
                atsSourceUsed: entry.latestAtsSourceUsed,
              });
              const sourceMeta = formatWatchlistMetadataLine([
                displayIdentity.sourceGrounding.secondary,
                displayIdentity.sourceGrounding.tertiary,
              ]);
              const freshnessLabel = formatWatchlistDateTime(
                entry.latestBriefId || entry.latestResultState ? entry.updatedAt : null,
                "Not checked yet"
              );
              const scheduleLabel = formatScheduledNextRunValue(
                entry.scheduleCadence,
                entry.scheduleNextRunAt,
                currentTime
              );
              const pendingRefresh = pendingRefreshId === entry.id;
              const pendingRemoval = pendingRemovalId === entry.id;
              const trackingState = formatWatchlistTrackingState({
                latestBriefId: entry.latestBriefId,
                latestResultState: entry.latestResultState,
                latestAtsSourceUsed: entry.latestAtsSourceUsed,
                isChecking: pendingRefresh,
              });

              return (
                <tr
                  key={entry.id}
                  onClick={() => onSelectEntry(entry.id)}
                  className="group cursor-pointer border-b last:border-b-0 transition-colors hover:bg-[rgba(16,24,40,0.02)]"
                  style={{
                    borderColor: "var(--border)",
                    background: active ? "rgba(16,24,40,0.05)" : "transparent",
                    boxShadow: active ? "inset 3px 0 0 var(--foreground)" : "none",
                  }}
                >
                  <td className="px-5 py-3.5 align-top">
                    <div className="space-y-0.5">
                      <Link
                        href={`/watchlists/${watchlist.id}/entries/${entry.id}`}
                        className="block max-w-full truncate text-[15px] font-semibold leading-5 tracking-[-0.02em] transition-colors hover:text-[color:var(--accent)]"
                        style={{ color: "var(--foreground)" }}
                        title={displayIdentity.primary}
                      >
                        {displayIdentity.primary}
                      </Link>
                      {displayIdentity.meta ? (
                        <p className="truncate text-[11px] leading-5" style={{ color: "var(--foreground-secondary)" }} title={displayIdentity.meta}>
                          {displayIdentity.meta}
                        </p>
                      ) : displayIdentity.uncertain ? (
                        <p className="text-[11px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                          Company not confirmed
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 align-top">
                    <div className="space-y-0.5">
                      <p className="truncate text-[14px] font-semibold tracking-tight lg:text-[15px]" style={{ color: "var(--foreground)" }} title={trackingState.headline}>
                        {trackingState.headline}
                      </p>
                      {trackingState.supportingText && (
                        <p className="truncate text-[11px] leading-5" style={{ color: "var(--foreground-secondary)" }} title={trackingState.supportingText}>
                          {trackingState.supportingText}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 align-top">
                    <div className="space-y-1">
                      <p className="truncate text-[14px] font-semibold tracking-tight tabular-nums lg:text-[15px]" style={{ color: "var(--foreground)" }} title={freshnessLabel}>
                        {freshnessLabel}
                      </p>
                      <p className="text-[11px] leading-5" style={{ color: scheduleLabel === "Due now" ? "var(--foreground)" : "var(--foreground-muted)" }}>
                        {scheduleLabel}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 align-top">
                    <div className="space-y-1">
                      <p className="truncate text-[14px] font-semibold tracking-tight lg:text-[15px]" style={{ color: "var(--foreground)" }} title={trackingState.sourceLabel}>
                        {trackingState.sourceLabel}
                      </p>
                      {sourceMeta ? (
                        <p className="truncate text-[10px] leading-4" style={{ color: "var(--foreground-secondary)" }} title={sourceMeta}>
                          {sourceMeta}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 align-top">
                    <div className="flex flex-wrap gap-2 text-[11px] lg:justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRefreshEntry(entry.id);
                        }}
                        disabled={pendingRefresh}
                        aria-busy={pendingRefresh || undefined}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors disabled:opacity-40 hover:bg-[rgba(16,24,40,0.04)]"
                        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                      >
                        {pendingRefresh ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        {pendingRefresh ? "Refreshing" : "Refresh"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveEntry(entry.id);
                        }}
                        disabled={pendingRemoval}
                        aria-busy={pendingRemoval || undefined}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors disabled:opacity-40 hover:bg-[rgba(16,24,40,0.04)]"
                        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                      >
                        {pendingRemoval ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {pendingRemoval ? "Removing" : "Remove"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
