"use client";

import Link from "next/link";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { buildWatchlistActionCopy } from "@/lib/watchlists/watchlistActionCopy";
import {
  buildWatchlistDisplayIdentity,
  formatWatchlistDateTime,
  formatWatchlistMetadataLine,
} from "@/lib/watchlists/presentation";
import type { WatchlistOverview } from "@/lib/watchlists/repository";
import {
  deriveWatchlistInboxSection,
  formatWatchlistInboxSectionLabel,
  type WatchlistInboxSection,
} from "@/lib/watchlists/inboxSection";

interface WatchlistSignalInboxProps {
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

// ---------------------------------------------------------------------------
// Verdict chip — small inline label
// ---------------------------------------------------------------------------

const VERDICT_CHIP: Record<
  string,
  { label: string; textColor: string; borderColor: string }
> = {
  act: {
    label: "ACT",
    textColor: "rgb(146, 64, 14)",
    borderColor: "rgba(245, 158, 11, 0.45)",
  },
  watch: {
    label: "WATCH",
    textColor: "rgb(29, 78, 216)",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  wait: {
    label: "WAIT",
    textColor: "var(--foreground-muted)",
    borderColor: "var(--border)",
  },
  verify_source: {
    label: "VERIFY SOURCE",
    textColor: "rgb(185, 28, 28)",
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  ignore: {
    label: "IGNORE",
    textColor: "var(--foreground-muted)",
    borderColor: "var(--border)",
  },
};

function VerdictChip({ verdict }: { verdict: string | null | undefined }) {
  if (!verdict) return null;
  const style = VERDICT_CHIP[verdict];
  if (!style) return null;
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]"
      style={{ borderColor: style.borderColor, color: style.textColor }}
    >
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

const SECTION_HEADING_STYLE: Record<
  WatchlistInboxSection,
  { dotColor: string }
> = {
  needs_attention: { dotColor: "rgba(245, 158, 11, 0.85)" },
  source_issues:   { dotColor: "rgba(239, 68, 68, 0.65)" },
  watching:        { dotColor: "var(--foreground)" },
  quiet:           { dotColor: "var(--foreground-muted)" },
  not_started:     { dotColor: "var(--foreground-muted)" },
};

function SectionHeading({
  section,
  count,
}: {
  section: WatchlistInboxSection;
  count: number;
}) {
  const style = SECTION_HEADING_STYLE[section];
  return (
    <div
      className="flex items-center gap-2.5 border-b px-5 py-3"
      style={{ borderColor: "var(--border)" }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: style.dotColor }}
      />
      <span
        className="text-[11px] font-semibold tracking-[0.03em]"
        style={{ color: "var(--foreground)" }}
      >
        {formatWatchlistInboxSectionLabel(section)}
      </span>
      <span
        className="text-[11px]"
        style={{ color: "var(--foreground-muted)" }}
      >
        {count} {count === 1 ? "company" : "companies"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  watchlistId,
  pendingRefresh,
  pendingRemoval,
  onRefreshEntry,
  onRemoveEntry,
  onSelectEntry,
}: {
  entry: WatchlistEntry;
  watchlistId: string;
  pendingRefresh: boolean;
  pendingRemoval: boolean;
  onRefreshEntry: (id: string) => void;
  onRemoveEntry: (id: string) => void;
  onSelectEntry: (id: string) => void;
}) {
  const displayIdentity = buildWatchlistDisplayIdentity({
    requestedQuery: entry.requestedQuery,
    matchedCompanyName: entry.latestMatchedCompanyName,
    atsSourceUsed: entry.latestAtsSourceUsed,
  });

  const actionCopy = buildWatchlistActionCopy({
    verdict: entry.latestSignalVerdict,
    resultState: entry.latestResultState,
    latestUnreadAlertPriority: entry.latestUnreadAlertPriority,
    latestWatchlistReadLabel: entry.latestWatchlistReadLabel,
    latestBriefId: entry.latestBriefId,
    latestObservedJobsCount: entry.latestObservedJobsCount,
  });

  const freshnessLabel = formatWatchlistDateTime(
    entry.latestBriefId || entry.latestResultState ? entry.updatedAt : null,
    "Not checked yet"
  );

  const sourceMeta = formatWatchlistMetadataLine([
    displayIdentity.sourceGrounding.secondary,
    displayIdentity.sourceGrounding.tertiary,
  ]);

  return (
    <div
      data-testid={`watchlist-row-${entry.id}`}
      onClick={() => onSelectEntry(entry.id)}
      className="group flex cursor-pointer items-start gap-4 border-b px-5 py-3.5 last:border-b-0 transition-colors hover:bg-[rgba(16,24,40,0.02)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link
            href={`/watchlists/${watchlistId}/entries/${entry.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block max-w-full truncate text-[14px] font-semibold leading-5 tracking-[-0.02em] transition-colors hover:text-[color:var(--accent)]"
            style={{ color: "var(--foreground)" }}
            title={displayIdentity.primary}
          >
            {displayIdentity.primary}
          </Link>
          {displayIdentity.meta ? (
            <span
              className="truncate text-[11px] leading-5"
              style={{ color: "var(--foreground-muted)" }}
              title={displayIdentity.meta}
            >
              {displayIdentity.meta}
            </span>
          ) : sourceMeta ? (
            <span
              className="truncate text-[11px] leading-5"
              style={{ color: "var(--foreground-muted)" }}
              title={sourceMeta}
            >
              {sourceMeta}
            </span>
          ) : null}
          <VerdictChip verdict={entry.latestSignalVerdict} />
        </div>
        <div className="mt-1.5 min-w-0">
          <p
            data-testid="watchlist-row-main-line"
            className="truncate text-[13px] font-medium leading-5"
            style={{ color: "var(--foreground)" }}
            title={actionCopy.mainLine}
          >
            {actionCopy.mainLine}
          </p>
          <p
            data-testid="watchlist-row-next-step"
            className="truncate text-[11px] leading-5"
            style={{ color: "var(--foreground-secondary)" }}
            title={actionCopy.nextStep}
          >
            {actionCopy.nextStep}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-[12px] tabular-nums" style={{ color: "var(--foreground-muted)" }}>
          {freshnessLabel}
        </span>

        <div
          className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]"
          onClick={(e) => e.stopPropagation()}
        >
          {entry.latestBriefId ? (
            <Link
              href={`/briefs/${entry.latestBriefId}`}
              className="rounded-lg border px-2.5 py-1.5 font-medium transition-colors hover:bg-[rgba(16,24,40,0.04)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              Brief
            </Link>
          ) : null}
          <button
            onClick={() => onRefreshEntry(entry.id)}
            disabled={pendingRefresh}
            aria-busy={pendingRefresh || undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium transition-colors disabled:opacity-40 hover:bg-[rgba(16,24,40,0.04)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            {pendingRefresh ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={() => onRemoveEntry(entry.id)}
            disabled={pendingRemoval}
            aria-busy={pendingRemoval || undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium transition-colors disabled:opacity-40 hover:bg-[rgba(16,24,40,0.04)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            {pendingRemoval ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WatchlistSignalInbox({
  watchlist,
  pendingRemovalId,
  pendingRefreshId,
  onRemoveEntry,
  onRefreshEntry,
  onSelectEntry,
  currentTime: _currentTime,
}: WatchlistSignalInboxProps) {
  void _currentTime;

  if (!watchlist) {
    return (
      <div
        className="rounded-[24px] border bg-[var(--surface)] p-4 text-[13px] leading-6"
        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
      >
        No watchlist is available yet.
      </div>
    );
  }

  if (watchlist.entries.length === 0) {
    return (
      <div
        className="rounded-[24px] border bg-[var(--surface)] p-4 text-[13px] leading-6"
        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
      >
        This watchlist is empty. Add a company to start tracking.
      </div>
    );
  }

  // Group entries by section, sorted by section rank then by company name
  const grouped = new Map<WatchlistInboxSection, WatchlistEntry[]>();
  for (const entry of watchlist.entries) {
    const section = deriveWatchlistInboxSection({
      signalVerdict: entry.latestSignalVerdict,
      latestUnreadAlertPriority: entry.latestUnreadAlertPriority,
      latestResultState: entry.latestResultState,
      latestBriefId: entry.latestBriefId,
      scheduleConsecutiveFailures: entry.scheduleConsecutiveFailures,
    });
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section)!.push(entry);
  }

  const sectionOrder: WatchlistInboxSection[] = [
    "needs_attention",
    "source_issues",
    "watching",
    "quiet",
    "not_started",
  ];

  const activeSections = sectionOrder.filter((s) => grouped.has(s));

  return (
    <section
      data-testid="watchlist-signal-inbox"
      className="overflow-hidden rounded-[24px] border bg-[var(--surface)]"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Table header */}
      <div
        className="flex items-end justify-between border-b px-5 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <p
            className="text-[11px] font-medium tracking-[0.02em]"
            style={{ color: "var(--foreground-muted)" }}
          >
            Signal inbox
          </p>
        </div>
        <div
          className="flex flex-wrap gap-4 text-[13px]"
          style={{ color: "var(--foreground-secondary)" }}
        >
          <span>
            <strong style={{ color: "var(--foreground)" }}>
              {watchlist.entryCount}
            </strong>{" "}
            tracked
          </span>
          {grouped.get("needs_attention")?.length ? (
            <span>
              <strong style={{ color: "rgb(146, 64, 14)" }}>
                {grouped.get("needs_attention")!.length}
              </strong>{" "}
              need attention
            </span>
          ) : null}
        </div>
      </div>

      {/* Grouped sections */}
      {activeSections.map((section) => {
        const entries = grouped.get(section)!;
        return (
          <div key={section}>
            <SectionHeading section={section} count={entries.length} />
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                watchlistId={watchlist.id}
                pendingRefresh={pendingRefreshId === entry.id}
                pendingRemoval={pendingRemovalId === entry.id}
                onRefreshEntry={onRefreshEntry}
                onRemoveEntry={onRemoveEntry}
                onSelectEntry={onSelectEntry}
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}
