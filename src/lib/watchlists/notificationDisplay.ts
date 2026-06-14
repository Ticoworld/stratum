// ---------------------------------------------------------------------------
// Notification display copy
//
// Pure helper — no DB calls, no React.
//
// New notifications store a point-in-time displayTag/displayMainLine/
// displayNextStep snapshot (built by buildNotificationDisplaySnapshot) at
// creation time, computed from the brief comparison that triggered them.
// Rendering always prefers that stored snapshot so an unread notification
// keeps reading the way it did when it was created, even after the
// watchlist entry moves on to a newer brief.
//
// For legacy rows created before the snapshot existed (stored fields null),
// buildNotificationDisplayCopy falls back to copy derived from the entry's
// current comparison data — but only when the notification's related brief
// is still the entry's latest. Otherwise it returns a generic "older update"
// line rather than a confident current-state mainLine.
// ---------------------------------------------------------------------------

import { buildWatchlistActionCopy, type WatchlistActionCopy } from "@/lib/watchlists/watchlistActionCopy";
import type {
  StratumNotificationAlertPriority,
  StratumNotificationChangeType,
  WatchlistNotificationInboxItem,
} from "@/lib/watchlists/notifications";

export interface NotificationDisplayCopy extends WatchlistActionCopy {
  tag: string;
}

const HIRING_CHANGED_TYPES = new Set([
  "result_state_changed",
  "watchlist_read_changed",
  "ats_source_changed",
]);

interface NotificationTagInput {
  alertPriority: StratumNotificationAlertPriority;
  changeTypes: StratumNotificationChangeType[];
}

/**
 * Short, user-facing label for a notification — replaces the per-changeType
 * chip list with a single tag. Always returns a value so the UI never falls
 * back to internal copy like "Meaningful change detected".
 */
export function deriveNotificationTag(notification: NotificationTagInput): string {
  if (notification.changeTypes.includes("refresh_failed")) {
    return "Refresh failed";
  }

  if (notification.alertPriority === "source_issue") {
    return "Source needs checking";
  }

  if (notification.changeTypes.includes("saved_brief_material_change")) {
    return "Brief updated";
  }

  if (notification.changeTypes.some((changeType) => HIRING_CHANGED_TYPES.has(changeType))) {
    return "Hiring changed";
  }

  return "Company update";
}

export interface NotificationDisplaySnapshotInput extends NotificationTagInput {
  verdict?: string | null;
  resultState?: string | null;
  latestWatchlistReadLabel?: string | null;
  latestBriefId?: string | null;
  latestObservedJobsCount?: number | null;
  previousObservedJobsCount?: number | null;
  latestTopHiringBucket?: string | null;
  latestTopHiringBucketCount?: number | null;
  previousTopHiringBucket?: string | null;
  previousTopHiringBucketCount?: number | null;
}

/**
 * Builds the tag/mainLine/nextStep for a comparison snapshot, reusing
 * buildWatchlistActionCopy so the wording matches the watchlist row.
 *
 * Called at notification-creation time (to persist a point-in-time
 * snapshot) and as the fallback for legacy rows whose related brief is
 * still the entry's latest.
 */
export function buildNotificationDisplaySnapshot(
  input: NotificationDisplaySnapshotInput
): NotificationDisplayCopy {
  const tag = deriveNotificationTag(input);

  if (input.changeTypes.includes("refresh_failed")) {
    return {
      mainLine: "Refresh failed.",
      nextStep: "Check the source before using this signal.",
      tag,
    };
  }

  const actionCopy = buildWatchlistActionCopy({
    verdict: input.verdict,
    resultState: input.resultState,
    latestUnreadAlertPriority: input.alertPriority,
    latestWatchlistReadLabel: input.latestWatchlistReadLabel,
    latestBriefId: input.latestBriefId,
    latestObservedJobsCount: input.latestObservedJobsCount,
    previousObservedJobsCount: input.previousObservedJobsCount,
    latestTopHiringBucket: input.latestTopHiringBucket,
    latestTopHiringBucketCount: input.latestTopHiringBucketCount,
    previousTopHiringBucket: input.previousTopHiringBucket,
    previousTopHiringBucketCount: input.previousTopHiringBucketCount,
  });

  return { ...actionCopy, tag };
}

/**
 * Builds the primary line + next step for a notification inbox item.
 *
 * Prefers the displayTag/displayMainLine/displayNextStep snapshot stored at
 * creation time, so the card reads exactly as it did when the notification
 * was created. Only legacy rows (stored fields null) fall back to copy
 * derived from current comparison data, and only when the notification's
 * related brief is still the entry's latest — otherwise a generic
 * "older update" line is returned instead of a confident current-state
 * mainLine.
 */
export function buildNotificationDisplayCopy(
  notification: WatchlistNotificationInboxItem
): NotificationDisplayCopy {
  if (notification.displayTag && notification.displayMainLine && notification.displayNextStep) {
    return {
      tag: notification.displayTag,
      mainLine: notification.displayMainLine,
      nextStep: notification.displayNextStep,
    };
  }

  const tag = deriveNotificationTag(notification);

  if (notification.changeTypes.includes("refresh_failed")) {
    return {
      mainLine: "Refresh failed.",
      nextStep: "Check the source before using this signal.",
      tag,
    };
  }

  const hasMovedOn = notification.relatedBriefId !== notification.latestBriefId;

  if (hasMovedOn) {
    return {
      mainLine: "Update from an earlier scan.",
      nextStep: "See details for what changed.",
      tag,
    };
  }

  const actionCopy = buildWatchlistActionCopy({
    verdict: notification.latestSignalVerdict,
    resultState: notification.latestResultState,
    latestUnreadAlertPriority: notification.alertPriority,
    latestWatchlistReadLabel: notification.latestWatchlistReadLabel,
    latestBriefId: notification.relatedBriefId ?? notification.latestBriefId,
    latestObservedJobsCount: notification.latestObservedJobsCount,
    previousObservedJobsCount: notification.previousObservedJobsCount,
    latestTopHiringBucket: notification.latestTopHiringBucket,
    latestTopHiringBucketCount: notification.latestTopHiringBucketCount,
    previousTopHiringBucket: notification.previousTopHiringBucket,
    previousTopHiringBucketCount: notification.previousTopHiringBucketCount,
  });

  return { ...actionCopy, tag };
}
