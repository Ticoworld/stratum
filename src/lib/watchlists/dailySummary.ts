// ---------------------------------------------------------------------------
// "Today's watchlist" daily triage summary
//
// Pure helper — no DB calls, no React. Reuses the existing inbox section
// classifier and row action copy to surface the single most relevant thing
// about a watchlist's real rows, in priority order:
//
//   1. needs_attention — ACT verdict or immediate unread alert
//   2. source_issues   — VERIFY SOURCE / scan problems
//   3. due now         — scheduled checks that are overdue
//   4. first scans     — rows with a first scan ready (no prior comparison data)
//   5. watching        — stable WATCH rows, no urgent changes
//   6. not_started      — rows with no saved brief yet
// ---------------------------------------------------------------------------

import { buildWatchlistActionCopy, hasWatchlistComparisonData } from "@/lib/watchlists/watchlistActionCopy";
import { buildWatchlistDisplayIdentity } from "@/lib/watchlists/presentation";
import { deriveWatchlistInboxSection } from "@/lib/watchlists/inboxSection";
import { isWatchlistScheduleEnabled } from "@/lib/watchlists/schedules";
import type { WatchlistEntryOverview } from "@/lib/watchlists/repository";

export interface WatchlistDailySummary {
  primaryLine: string;
  detailLine: string;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function isEntryDueNow(entry: WatchlistEntryOverview, currentTime: number): boolean {
  return (
    isWatchlistScheduleEnabled(entry.scheduleCadence) &&
    !!entry.scheduleNextRunAt &&
    new Date(entry.scheduleNextRunAt).getTime() <= currentTime
  );
}

/**
 * A row is a "first scan" when it has a saved brief but no data from a
 * previous scan to compare against — derived from real overview fields,
 * not from parsing mainLine copy.
 */
function isFirstScanEntry(entry: WatchlistEntryOverview): boolean {
  if (!entry.latestBriefId) return false;
  if (entry.latestUnreadAlertPriority === "digest") return false;

  const verdict = entry.latestSignalVerdict;
  if (verdict !== "watch" && verdict != null) return false;

  return !hasWatchlistComparisonData({
    previousObservedJobsCount: entry.previousObservedJobsCount,
    previousTopHiringBucket: entry.previousTopHiringBucket,
    previousTopHiringBucketCount: entry.previousTopHiringBucketCount,
  });
}

/**
 * Builds a compact "Today's watchlist" summary from real watchlist entries.
 * Returns null when there are no entries to summarize.
 */
export function buildWatchlistDailySummary(
  entries: WatchlistEntryOverview[],
  currentTime: number = Date.now()
): WatchlistDailySummary | null {
  if (entries.length === 0) return null;

  const needsAttention: { entry: WatchlistEntryOverview; mainLine: string }[] = [];
  const sourceIssues: WatchlistEntryOverview[] = [];
  const dueNow: WatchlistEntryOverview[] = [];
  const firstScans: WatchlistEntryOverview[] = [];
  const watching: WatchlistEntryOverview[] = [];
  const notStarted: WatchlistEntryOverview[] = [];

  for (const entry of entries) {
    const section = deriveWatchlistInboxSection({
      signalVerdict: entry.latestSignalVerdict,
      latestUnreadAlertPriority: entry.latestUnreadAlertPriority,
      latestResultState: entry.latestResultState,
      latestBriefId: entry.latestBriefId,
      scheduleConsecutiveFailures: entry.scheduleConsecutiveFailures,
    });

    if (section === "needs_attention") {
      const actionCopy = buildWatchlistActionCopy({
        verdict: entry.latestSignalVerdict,
        resultState: entry.latestResultState,
        latestUnreadAlertPriority: entry.latestUnreadAlertPriority,
        latestWatchlistReadLabel: entry.latestWatchlistReadLabel,
        latestBriefId: entry.latestBriefId,
        latestObservedJobsCount: entry.latestObservedJobsCount,
        previousObservedJobsCount: entry.previousObservedJobsCount,
        latestTopHiringBucket: entry.latestTopHiringBucket,
        latestTopHiringBucketCount: entry.latestTopHiringBucketCount,
        previousTopHiringBucket: entry.previousTopHiringBucket,
        previousTopHiringBucketCount: entry.previousTopHiringBucketCount,
      });
      needsAttention.push({ entry, mainLine: actionCopy.mainLine });
      continue;
    }

    if (section === "source_issues") {
      sourceIssues.push(entry);
      continue;
    }

    if (isEntryDueNow(entry, currentTime)) {
      dueNow.push(entry);
      continue;
    }

    if (!entry.latestBriefId) {
      notStarted.push(entry);
      continue;
    }

    if (isFirstScanEntry(entry)) {
      firstScans.push(entry);
      continue;
    }

    watching.push(entry);
  }

  if (needsAttention.length > 0) {
    const [{ entry, mainLine }] = needsAttention;
    const identity = buildWatchlistDisplayIdentity({
      requestedQuery: entry.requestedQuery,
      matchedCompanyName: entry.latestMatchedCompanyName,
      atsSourceUsed: entry.latestAtsSourceUsed,
    });

    return {
      primaryLine: `${needsAttention.length} ${pluralize(
        needsAttention.length,
        "company needs",
        "companies need"
      )} attention.`,
      detailLine: `Start with ${identity.primary}: ${mainLine}`,
    };
  }

  if (sourceIssues.length > 0) {
    return {
      primaryLine: `${sourceIssues.length} ${pluralize(
        sourceIssues.length,
        "company needs",
        "companies need"
      )} source checks.`,
      detailLine: "Check the source before using those signals.",
    };
  }

  if (dueNow.length > 0) {
    return {
      primaryLine: `${dueNow.length} ${pluralize(dueNow.length, "check is", "checks are")} due now.`,
      detailLine: "Run them to see what changed.",
    };
  }

  if (firstScans.length > 0) {
    if (firstScans.length === 1) {
      return {
        primaryLine: "1 first scan is ready.",
        detailLine: "Use it as a baseline for future changes.",
      };
    }

    return {
      primaryLine: `${firstScans.length} first scans are ready.`,
      detailLine: "Use them as baselines for future changes.",
    };
  }

  if (watching.length > 0) {
    return {
      primaryLine: "No urgent changes today.",
      detailLine: `${watching.length} ${pluralize(
        watching.length,
        "company is",
        "companies are"
      )} still worth watching.`,
    };
  }

  if (notStarted.length > 0) {
    return {
      primaryLine: "No urgent changes today.",
      detailLine: `${notStarted.length} ${pluralize(
        notStarted.length,
        "company has",
        "companies have"
      )} no scan yet.`,
    };
  }

  return null;
}
