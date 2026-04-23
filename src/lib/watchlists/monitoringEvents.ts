import type { JobBoardSource } from "@/lib/api/boards";
import type {
  ConfidenceLevel,
  SourceCoverageCompleteness,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";

export type StratumMonitoringAttemptKind = "refresh";
export type StratumMonitoringAttemptOrigin =
  | "manual_refresh"
  | "watchlist_rerun"
  | "scheduled_refresh";
export type StratumMonitoringAttemptOutcome =
  | "saved_brief_created"
  | "completed_without_saved_brief"
  | "reused_cached_result"
  | "failed";
export type StratumMonitoringStateBasis = "saved_brief" | "latest_attempt_only" | "none";

export interface WatchlistMonitoringAttemptHistoryItem {
  id: string;
  watchlistEntryId: string;
  requestedQuery: string;
  attemptKind: StratumMonitoringAttemptKind;
  attemptOrigin: StratumMonitoringAttemptOrigin;
  outcomeStatus: StratumMonitoringAttemptOutcome;
  relatedBriefId: string | null;
  resultState: StratumResultState | null;
  matchedCompanyName: string | null;
  atsSourceUsed: JobBoardSource | null;
  watchlistReadLabel: string | null;
  watchlistReadConfidence: ConfidenceLevel | null;
  companyMatchConfidence: ConfidenceLevel | null;
  sourceCoverageCompleteness: SourceCoverageCompleteness | null;
  errorSummary: string | null;
  createdAt: string;
}

export function formatMonitoringAttemptOriginLabel(value: StratumMonitoringAttemptOrigin): string {
  switch (value) {
    case "manual_refresh":
      return "Latest update";
    case "watchlist_rerun":
      return "Watchlist rerun";
    case "scheduled_refresh":
      return "Scheduled refresh";
  }
}

export function formatMonitoringAttemptOutcomeLabel(value: StratumMonitoringAttemptOutcome): string {
  switch (value) {
    case "saved_brief_created":
      return "Update completed";
    case "completed_without_saved_brief":
      return "Completed without saved brief";
    case "reused_cached_result":
      return "Reused cached result";
    case "failed":
      return "Refresh failed";
  }
}

export function formatAttemptResultStateLabel(value: StratumResultState): string {
  switch (value) {
    case "supported_provider_matched_with_observed_openings":
      return "Observed openings";
    case "supported_provider_matched_with_zero_observed_openings":
      return "Matched provider, zero openings";
    case "unsupported_ats_or_source_pattern":
      return "Unsupported source pattern";
    case "ambiguous_company_match":
      return "Ambiguous company match";
    case "provider_failure":
      return "Provider failure";
    case "no_matched_provider_found":
      return "No supported match";
  }
}

export function didMonitoringAttemptCreateSavedBrief(
  attempt: WatchlistMonitoringAttemptHistoryItem | null | undefined
): boolean {
  return attempt?.outcomeStatus === "saved_brief_created" && Boolean(attempt.relatedBriefId);
}

export function didMonitoringAttemptFail(
  attempt: WatchlistMonitoringAttemptHistoryItem | null | undefined
): boolean {
  return attempt?.outcomeStatus === "failed";
}

export function didMonitoringAttemptReuseCache(
  attempt: WatchlistMonitoringAttemptHistoryItem | null | undefined
): boolean {
  return attempt?.outcomeStatus === "reused_cached_result";
}

export function buildMonitoringAttemptSummary(
  attempt: WatchlistMonitoringAttemptHistoryItem
): string {
  const originLabel = formatMonitoringAttemptOriginLabel(attempt.attemptOrigin);

  switch (attempt.outcomeStatus) {
    case "saved_brief_created":
      return attempt.resultState
        ? `${originLabel} created a new saved brief with ${formatAttemptResultStateLabel(attempt.resultState)}.`
        : `${originLabel} created a new saved brief.`;
    case "completed_without_saved_brief":
      return attempt.resultState
        ? `${originLabel} completed with ${formatAttemptResultStateLabel(attempt.resultState)} and did not create a saved brief.`
        : `${originLabel} completed and did not create a saved brief.`;
    case "reused_cached_result":
      return `${originLabel} reused cached work and did not create a new saved brief.`;
    case "failed":
      return attempt.errorSummary
        ? `${originLabel} failed: ${attempt.errorSummary}`
        : `${originLabel} failed before Stratum could complete the refresh.`;
  }
}
