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

function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

export function buildDevelopmentNotificationInboxPreview(args: {
  status: StratumNotificationInboxFilter;
}): {
  counts: NotificationInboxCounts;
  notifications: WatchlistNotificationInboxItem[];
} {
  const previewItems: WatchlistNotificationInboxItem[] = [
    {
      id: "00000000-0000-4000-8000-000000000901",
      watchlistEntryId: "00000000-0000-4000-8000-000000000911",
      monitoringEventId: "00000000-0000-4000-8000-000000000921",
      relatedBriefId: "00000000-0000-4000-8000-000000000931",
      attemptOrigin: "manual_refresh",
      candidateKind: "meaningful_monitoring_change",
      status: "unread",
      changeTypes: ["result_state_changed", "saved_brief_material_change"],
      summary:
        "Result state changed from No result state to Supported provider matched with observed openings. Saved brief comparison shows broader product and GTM hiring.",
      createdAt: isoFromNow(18 * 60 * 1000),
      readAt: null,
      dismissedAt: null,
      externalDeliveryAt: null,
      deliveryMode: "in_app_inbox_only",
      watchlistId: "00000000-0000-4000-8000-000000000941",
      watchlistName: "Phase 10 Watchlist Fixture",
      requestedQuery: "https://phase10-home.myworkdayjobs.com/en-US/careers",
      latestMatchedCompanyName: null,
      latestBriefId: "00000000-0000-4000-8000-000000000931",
    },
    {
      id: "00000000-0000-4000-8000-000000000902",
      watchlistEntryId: "00000000-0000-4000-8000-000000000912",
      monitoringEventId: "00000000-0000-4000-8000-000000000922",
      relatedBriefId: "00000000-0000-4000-8000-000000000932",
      attemptOrigin: "manual_refresh",
      candidateKind: "meaningful_monitoring_change",
      status: "unread",
      changeTypes: ["watchlist_read_changed", "saved_brief_material_change"],
      summary:
        'Watchlist read changed from "Focused product hiring" to "Broader product and GTM buildout". Saved brief comparison now shows commercial hiring mixed into the same target.',
      createdAt: isoFromNow(2 * 60 * 60 * 1000),
      readAt: null,
      dismissedAt: null,
      externalDeliveryAt: null,
      deliveryMode: "in_app_inbox_only",
      watchlistId: "00000000-0000-4000-8000-000000000942",
      watchlistName: "Phase 9 History Review",
      requestedQuery: "Phase9 History Company",
      latestMatchedCompanyName: "Phase9 History Company",
      latestBriefId: "00000000-0000-4000-8000-000000000932",
    },
    {
      id: "00000000-0000-4000-8000-000000000903",
      watchlistEntryId: "00000000-0000-4000-8000-000000000913",
      monitoringEventId: "00000000-0000-4000-8000-000000000923",
      relatedBriefId: null,
      attemptOrigin: "watchlist_rerun",
      candidateKind: "meaningful_monitoring_change",
      status: "unread",
      changeTypes: ["ats_source_changed", "result_state_changed"],
      summary:
        "ATS source changed from No supported ATS source to Greenhouse. Result state changed to supported provider matched with observed openings.",
      createdAt: isoFromNow(9 * 60 * 60 * 1000),
      readAt: null,
      dismissedAt: null,
      externalDeliveryAt: null,
      deliveryMode: "in_app_inbox_only",
      watchlistId: "00000000-0000-4000-8000-000000000943",
      watchlistName: "Coverage Expansion",
      requestedQuery: "https://boards.greenhouse.io/harbor-robotics/jobs",
      latestMatchedCompanyName: null,
      latestBriefId: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000904",
      watchlistEntryId: "00000000-0000-4000-8000-000000000914",
      monitoringEventId: "00000000-0000-4000-8000-000000000924",
      relatedBriefId: null,
      attemptOrigin: "manual_refresh",
      candidateKind: "meaningful_monitoring_change",
      status: "read",
      changeTypes: ["refresh_failed"],
      summary:
        "Manual refresh failed and did not replace the current monitoring state: simulated provider timeout during review.",
      createdAt: isoFromNow(26 * 60 * 60 * 1000),
      readAt: isoFromNow(23 * 60 * 60 * 1000),
      dismissedAt: null,
      externalDeliveryAt: null,
      deliveryMode: "in_app_inbox_only",
      watchlistId: "00000000-0000-4000-8000-000000000944",
      watchlistName: "Manual Exceptions",
      requestedQuery: "https://apply.workable.com/north-coast-payments/",
      latestMatchedCompanyName: null,
      latestBriefId: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000905",
      watchlistEntryId: "00000000-0000-4000-8000-000000000915",
      monitoringEventId: "00000000-0000-4000-8000-000000000925",
      relatedBriefId: "00000000-0000-4000-8000-000000000935",
      attemptOrigin: "manual_refresh",
      candidateKind: "meaningful_monitoring_change",
      status: "dismissed",
      changeTypes: ["watchlist_read_changed"],
      summary:
        'Watchlist read changed from "Steady engineering hiring" to "Commercial hiring mixed in with platform roles".',
      createdAt: isoFromNow(4 * 24 * 60 * 60 * 1000),
      readAt: isoFromNow(4 * 24 * 60 * 60 * 1000 - 45 * 60 * 1000),
      dismissedAt: isoFromNow(3 * 24 * 60 * 60 * 1000),
      externalDeliveryAt: null,
      deliveryMode: "in_app_inbox_only",
      watchlistId: "00000000-0000-4000-8000-000000000945",
      watchlistName: "Commercial Buildout",
      requestedQuery: "https://jobs.ashbyhq.com/copper-bridge",
      latestMatchedCompanyName: null,
      latestBriefId: "00000000-0000-4000-8000-000000000935",
    },
  ];

  const counts: NotificationInboxCounts = {
    totalCount: previewItems.length,
    unreadCount: previewItems.filter((item) => item.status === "unread").length,
    readCount: previewItems.filter((item) => item.status === "read").length,
    dismissedCount: previewItems.filter((item) => item.status === "dismissed").length,
  };

  const notifications =
    args.status === "all"
      ? previewItems
      : previewItems.filter((item) => item.status === args.status);

  return {
    counts,
    notifications,
  };
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
