// ---------------------------------------------------------------------------
// Phase 6E-4: Watchlist Signal Inbox triage classifier
//
// Pure helper — no DB calls, no React. Maps watchlist entry state fields to
// one of five triage sections so the UI can group entries without adding AI
// or any server-side complexity.
//
// Priority order (first match wins):
//   1. needs_attention — ACT verdict or immediate unread alert
//   2. source_issues   — VERIFY_SOURCE verdict, source_issue alert, or scan failure
//   3. quiet           — WAIT or IGNORE verdict
//   4. watching        — WATCH verdict, digest alert, or has any brief
//   5. not_started     — no brief and no result state at all
// ---------------------------------------------------------------------------

export type WatchlistInboxSection =
  | "needs_attention"
  | "source_issues"
  | "watching"
  | "quiet"
  | "not_started";

/**
 * Derives the triage section for a watchlist entry using only the fields
 * that are cheaply available on WatchlistEntryOverview (no extra DB round
 * trips beyond what listWatchlistsWithEntries already fetches).
 *
 * All inputs are optional so legacy entries without persisted verdict data
 * degrade gracefully.
 */
export function deriveWatchlistInboxSection(args: {
  signalVerdict?: string | null;
  latestUnreadAlertPriority?: string | null;
  latestResultState?: string | null;
  latestBriefId?: string | null;
  scheduleConsecutiveFailures?: number;
}): WatchlistInboxSection {
  const {
    signalVerdict,
    latestUnreadAlertPriority,
    latestResultState,
    latestBriefId,
    scheduleConsecutiveFailures,
  } = args;

  // Not started: nothing has been checked yet
  if (!latestBriefId && !latestResultState) {
    return "not_started";
  }

  // 1. Needs attention: ACT-level verdict or an immediate unread alert
  if (signalVerdict === "act" || latestUnreadAlertPriority === "immediate") {
    return "needs_attention";
  }

  // 2. Source issues: bad source or persistent scan failures
  if (
    signalVerdict === "verify_source" ||
    latestUnreadAlertPriority === "source_issue" ||
    latestResultState === "provider_failure" ||
    latestResultState === "unsupported_ats_or_source_pattern" ||
    (typeof scheduleConsecutiveFailures === "number" && scheduleConsecutiveFailures >= 2)
  ) {
    return "source_issues";
  }

  // 3. Quiet: signal is present but explicitly below action threshold
  if (signalVerdict === "wait" || signalVerdict === "ignore") {
    return "quiet";
  }

  // 4. Watching: WATCH verdict, digest unread alert, or any brief present
  //    (legacy entries without a verdict default here — safer than quiet)
  if (
    signalVerdict === "watch" ||
    latestUnreadAlertPriority === "digest" ||
    latestBriefId
  ) {
    return "watching";
  }

  // 5. Default: if there's a result state but no brief, treat as watching
  return latestResultState ? "watching" : "not_started";
}

/** Lower rank = higher importance = sorted first. */
export function getWatchlistInboxSectionRank(section: WatchlistInboxSection): number {
  switch (section) {
    case "needs_attention": return 0;
    case "source_issues":   return 1;
    case "watching":        return 2;
    case "quiet":           return 3;
    case "not_started":     return 4;
  }
}

export function formatWatchlistInboxSectionLabel(section: WatchlistInboxSection): string {
  switch (section) {
    case "needs_attention": return "Needs attention";
    case "source_issues":   return "Source issues";
    case "watching":        return "Watching";
    case "quiet":           return "Quiet";
    case "not_started":     return "Not started";
  }
}
