"use client";

import Link from "next/link";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { formatWatchlistTargetIdentity } from "@/lib/watchlists/identity";
import {
  buildWatchlistSourceGrounding,
  formatWatchlistDateTime,
  formatWatchlistMetadataLine,
  formatWatchlistStateHeadline,
  formatWatchlistStateSupportingText,
} from "@/lib/watchlists/presentation";
import type { WatchlistOverview } from "@/lib/watchlists/repository";
import { formatWatchlistScheduleCadenceLabel } from "@/lib/watchlists/schedules";

interface WatchlistEntriesTableProps {
  watchlist: WatchlistOverview | null;
  activeEntryId: string | null;
  pendingRemovalId: string | null;
  pendingRefreshId: string | null;
  currentTime: number | null;
  onRemoveEntry: (entryId: string) => void;
  onRefreshEntry: (entryId: string) => void;
}

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
}: WatchlistEntriesTableProps) {
  if (!watchlist) {
    return (
      <div className="rounded-[28px] border bg-[var(--surface)] p-6 text-sm leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}>
        No watchlist is available yet.
      </div>
    );
  }

  if (watchlist.entries.length === 0) {
    return (
      <div className="rounded-[28px] border bg-[var(--surface)] p-6 text-sm leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}>
        This watchlist is empty. Add a target company in the sidebar to start tracking.
      </div>
    );
  }

  const scheduledCount = watchlist.entries.filter((entry) => entry.scheduleCadence !== "off").length;
  const unsavedCount = watchlist.entries.filter((entry) => !entry.latestBriefId).length;

  return (
    <section className="overflow-hidden rounded-[28px] border bg-[var(--surface)]" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-col gap-3 border-b px-6 py-5 lg:flex-row lg:items-end lg:justify-between" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-sm font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
            Tracked companies
          </p>
        </div>

        <div className="flex flex-wrap gap-5 text-[13px]" style={{ color: "var(--foreground-secondary)" }}>
          <span>
            <strong style={{ color: "var(--foreground)" }}>{watchlist.entryCount}</strong> tracked
          </span>
          <span>
            <strong style={{ color: "var(--foreground)" }}>{scheduledCount}</strong> scheduled
          </span>
          <span>
            <strong style={{ color: "var(--foreground)" }}>{unsavedCount}</strong> without brief
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className="border-b text-left text-[12px]" style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}>
              <th className="px-6 py-4 font-medium">Target</th>
              <th className="px-6 py-4 font-medium">Current state</th>
              <th className="px-6 py-4 font-medium">Freshness</th>
              <th className="px-6 py-4 font-medium">Source grounding</th>
              <th className="px-6 py-4 font-medium">Cadence</th>
              <th className="px-6 py-4 font-medium">Next action</th>
            </tr>
          </thead>
          <tbody>
            {watchlist.entries.map((entry) => {
              const active = activeEntryId === entry.id;
              const identity = formatWatchlistTargetIdentity(entry.requestedQuery, entry.latestMatchedCompanyName);
              const identityMeta = formatWatchlistMetadataLine([identity.secondary, identity.tertiary]);
              const sourceGrounding = buildWatchlistSourceGrounding({
                requestedQuery: entry.requestedQuery,
                matchedCompanyName: entry.latestMatchedCompanyName,
                atsSourceUsed: entry.latestAtsSourceUsed,
              });
              const sourceMeta = formatWatchlistMetadataLine([
                sourceGrounding.secondary,
                sourceGrounding.tertiary,
              ]);
              const freshnessLabel = formatWatchlistDateTime(
                entry.latestBriefUpdatedAt ?? entry.latestBriefCreatedAt,
                "Not yet saved"
              );
              const scheduleLabel = formatScheduledNextRunValue(
                entry.scheduleCadence,
                entry.scheduleNextRunAt,
                currentTime
              );
              const pendingRefresh = pendingRefreshId === entry.id;
              const pendingRemoval = pendingRemovalId === entry.id;
              const stateHeadline = formatWatchlistStateHeadline({
                watchlistReadLabel: entry.latestWatchlistReadLabel,
                resultState: entry.latestResultState,
                fallback: "Awaiting first read",
              });
              const stateSupport = formatWatchlistStateSupportingText({
                resultState: entry.latestResultState,
                confidence: entry.latestWatchlistReadConfidence,
              });

              return (
                <tr
                  key={entry.id}
                  className="border-b last:border-b-0"
                  style={{
                    borderColor: "var(--border)",
                    background: active ? "rgba(16,24,40,0.05)" : "transparent",
                    boxShadow: active ? "inset 3px 0 0 var(--foreground)" : "none",
                  }}
                >
                  <td className="px-6 py-5 align-top">
                    <div className="space-y-1.5">
                      <Link
                        href={`/watchlists?watchlistId=${watchlist.id}&entryId=${entry.id}`}
                        className="block text-[17px] font-semibold tracking-[-0.02em] transition-colors"
                        style={{ color: "var(--foreground)" }}
                      >
                        {identity.primary}
                      </Link>
                      {identityMeta ? (
                        <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                          {identityMeta}
                        </p>
                      ) : identity.uncertain ? (
                        <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                          Identity unresolved
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="space-y-1.5">
                      <p className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                        {stateHeadline}
                      </p>
                      <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                        {stateSupport ?? "No saved brief yet"}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="space-y-1.5">
                      <p className="text-[15px] font-semibold tracking-tight tabular-nums" style={{ color: "var(--foreground)" }}>
                        {freshnessLabel}
                      </p>
                      <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                        {entry.latestBriefId ? "Latest brief" : "No brief"}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="space-y-1.5">
                      <p className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                        {sourceGrounding.primary}
                      </p>
                      {sourceMeta ? (
                        <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                          {sourceMeta}
                        </p>
                      ) : (
                        <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                          No detail
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="space-y-1.5">
                      <p className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                        {formatWatchlistScheduleCadenceLabel(entry.scheduleCadence)}
                      </p>
                      <p className="text-[12px] leading-5" style={{ color: scheduleLabel === "Due now" ? "var(--foreground)" : "var(--foreground-secondary)" }}>
                        {scheduleLabel}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      <Link
                        href={`/watchlists?watchlistId=${watchlist.id}&entryId=${entry.id}`}
                        className="rounded-full border px-3 py-2 transition-colors"
                        style={{
                          borderColor: active ? "var(--foreground)" : "var(--border)",
                          color: active ? "var(--foreground)" : "var(--foreground-secondary)",
                          background: active ? "rgba(16,24,40,0.06)" : "transparent",
                        }}
                      >
                        Inspect
                      </Link>
                      <button
                        onClick={() => onRefreshEntry(entry.id)}
                        disabled={pendingRefresh}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-2 transition-colors disabled:opacity-40"
                        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                      >
                        {pendingRefresh ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Refresh
                      </button>
                      {entry.latestBriefId ? (
                        <Link
                          href={`/briefs/${entry.latestBriefId}`}
                          className="rounded-full border px-3 py-2 transition-colors"
                          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                        >
                          Latest brief
                        </Link>
                      ) : null}
                      <button
                        onClick={() => onRemoveEntry(entry.id)}
                        disabled={pendingRemoval}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-2 transition-colors disabled:opacity-40"
                        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                      >
                        {pendingRemoval ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Remove
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
