import type { JobBoardSource } from "@/lib/api/boards";
import type { ConfidenceLevel, StratumResultState } from "@/lib/services/StratumInvestigator";
import type { WatchlistEntryDiff } from "@/lib/watchlists/history";
import {
  formatAttemptResultStateLabel,
  formatMonitoringAttemptOriginLabel,
  type StratumMonitoringAttemptOrigin,
  type StratumMonitoringStateBasis,
  type WatchlistMonitoringAttemptHistoryItem,
} from "@/lib/watchlists/monitoringEvents";

export type StratumNotificationCandidateKind = "meaningful_monitoring_change";
export type StratumNotificationCandidateStatus = "unread" | "read" | "dismissed";
export type StratumNotificationInboxFilter = "all" | "unread" | "read" | "dismissed";
export type StratumNotificationDeliveryMode = "in_app_inbox_only";
export type StratumNotificationChangeType =
  | "refresh_failed"
  | "result_state_changed"
  | "watchlist_read_changed"
  | "ats_source_changed"
  | "saved_brief_material_change";

export interface WatchlistNotificationCandidate {
  id: string;
  watchlistEntryId: string;
  monitoringEventId: string;
  relatedBriefId: string | null;
  attemptOrigin: StratumMonitoringAttemptOrigin;
  candidateKind: StratumNotificationCandidateKind;
  status: StratumNotificationCandidateStatus;
  changeTypes: StratumNotificationChangeType[];
  summary: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  externalDeliveryAt: string | null;
  deliveryMode: StratumNotificationDeliveryMode;
}

export interface WatchlistNotificationInboxItem extends WatchlistNotificationCandidate {
  watchlistId: string;
  watchlistName: string;
  requestedQuery: string;
  latestMatchedCompanyName: string | null;
  latestBriefId: string | null;
}

export interface NotificationInboxCounts {
  totalCount: number;
  unreadCount: number;
  readCount: number;
  dismissedCount: number;
}

export interface MonitoringStateComparisonSnapshot {
  basis: StratumMonitoringStateBasis;
  resultState: StratumResultState | null;
  watchlistReadLabel: string | null;
  watchlistReadConfidence: ConfidenceLevel | null;
  atsSourceUsed: JobBoardSource | null;
}

export interface NotificationCandidateDraft {
  relatedBriefId: string | null;
  candidateKind: StratumNotificationCandidateKind;
  changeTypes: StratumNotificationChangeType[];
  summary: string;
}

export function formatNotificationCandidateKindLabel(
  value: StratumNotificationCandidateKind
): string {
  switch (value) {
    case "meaningful_monitoring_change":
      return "Monitoring change";
  }
}

export function formatNotificationStatusLabel(
  value: StratumNotificationCandidateStatus
): string {
  switch (value) {
    case "unread":
      return "Unread";
    case "read":
      return "Read";
    case "dismissed":
      return "Dismissed";
  }
}

export function formatNotificationDeliveryModeLabel(
  value: StratumNotificationDeliveryMode
): string {
  switch (value) {
    case "in_app_inbox_only":
      return "In-app inbox only";
  }
}

export function formatNotificationChangeTypeLabel(
  value: StratumNotificationChangeType
): string {
  switch (value) {
    case "refresh_failed":
      return "Refresh failed";
    case "result_state_changed":
      return "Result state changed";
    case "watchlist_read_changed":
      return "Watchlist read changed";
    case "ats_source_changed":
      return "ATS source changed";
    case "saved_brief_material_change":
      return "Saved brief material change";
  }
}

export function resolveNotificationInboxFilter(
  value: string | null | undefined
): StratumNotificationInboxFilter {
  switch (value) {
    case "unread":
    case "read":
    case "dismissed":
    case "all":
      return value;
    default:
      return "unread";
  }
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function formatResultState(value: StratumResultState | null): string {
  return value ? formatAttemptResultStateLabel(value) : "No result state";
}

function formatSource(value: JobBoardSource | null): string {
  switch (value) {
    case "GREENHOUSE":
      return "Greenhouse";
    case "LEVER":
      return "Lever";
    case "ASHBY":
      return "Ashby";
    case "WORKABLE":
      return "Workable";
    default:
      return "No supported ATS source";
  }
}

export function buildNotificationCandidateDraft(args: {
  currentAttempt: WatchlistMonitoringAttemptHistoryItem;
  previousAttempt: WatchlistMonitoringAttemptHistoryItem | null;
  previousState: MonitoringStateComparisonSnapshot;
  currentState: MonitoringStateComparisonSnapshot;
  diff: WatchlistEntryDiff;
}): NotificationCandidateDraft | null {
  const { currentAttempt, previousAttempt, previousState, currentState, diff } = args;

  if (currentAttempt.outcomeStatus === "reused_cached_result") {
    return null;
  }

  if (currentAttempt.outcomeStatus === "failed") {
    const repeatedSameFailure =
      previousAttempt?.outcomeStatus === "failed" &&
      normalizeText(previousAttempt.errorSummary) === normalizeText(currentAttempt.errorSummary);

    if (repeatedSameFailure) {
      return null;
    }

    const originLabel = formatMonitoringAttemptOriginLabel(currentAttempt.attemptOrigin);
    return {
      relatedBriefId: currentAttempt.relatedBriefId ?? null,
      candidateKind: "meaningful_monitoring_change",
      changeTypes: ["refresh_failed"],
      summary: currentAttempt.errorSummary
        ? `${originLabel} failed and did not replace the current monitoring state: ${currentAttempt.errorSummary}`
        : `${originLabel} failed and did not replace the current monitoring state.`,
    };
  }

  if (previousState.basis === "none") {
    return null;
  }

  const changeTypes: StratumNotificationChangeType[] = [];
  const summaryParts: string[] = [];

  if (previousState.resultState !== currentState.resultState && currentState.resultState) {
    changeTypes.push("result_state_changed");
    summaryParts.push(
      `Result state changed from ${formatResultState(previousState.resultState)} to ${formatResultState(currentState.resultState)}.`
    );
  }

  if (
    normalizeText(previousState.watchlistReadLabel) !==
      normalizeText(currentState.watchlistReadLabel) &&
    currentState.watchlistReadLabel
  ) {
    changeTypes.push("watchlist_read_changed");
    summaryParts.push(
      `Watchlist read changed from "${previousState.watchlistReadLabel ?? "No prior read"}" to "${currentState.watchlistReadLabel}".`
    );
  }

  if (previousState.atsSourceUsed !== currentState.atsSourceUsed && currentState.atsSourceUsed) {
    changeTypes.push("ats_source_changed");
    summaryParts.push(
      `ATS source changed from ${formatSource(previousState.atsSourceUsed)} to ${formatSource(currentState.atsSourceUsed)}.`
    );
  }

  if (currentAttempt.outcomeStatus === "saved_brief_created" && diff.comparisonAvailable && diff.hasMaterialChange) {
    changeTypes.push("saved_brief_material_change");
    summaryParts.push(diff.summary);
  }

  if (changeTypes.length === 0) {
    return null;
  }

  return {
    relatedBriefId: currentAttempt.relatedBriefId ?? null,
    candidateKind: "meaningful_monitoring_change",
    changeTypes,
    summary: summaryParts.join(" "),
  };
}
