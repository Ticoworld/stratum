import type { JobBoardSource } from "@/lib/api/boards";
import type { ConfidenceLevel, StratumResultState } from "@/lib/services/StratumInvestigator";
import type { WatchlistEntryBriefHistoryItem } from "@/lib/watchlists/history";
import {
  didMonitoringAttemptCreateSavedBrief,
  didMonitoringAttemptFail,
  didMonitoringAttemptReuseCache,
  formatAttemptResultStateLabel,
  type StratumMonitoringStateBasis,
  type WatchlistMonitoringAttemptHistoryItem,
} from "@/lib/watchlists/monitoringEvents";

export interface DerivedMonitoringState {
  latestStateBasis: StratumMonitoringStateBasis;
  latestStateSummary: string;
  latestStateResultState: StratumResultState | null;
  latestStateWatchlistReadLabel: string | null;
  latestStateWatchlistReadConfidence: ConfidenceLevel | null;
  latestStateAtsSourceUsed: JobBoardSource | null;
}

export function deriveMonitoringState(args: {
  latestBrief: WatchlistEntryBriefHistoryItem | null;
  latestAttempt: WatchlistMonitoringAttemptHistoryItem | null;
}): DerivedMonitoringState {
  const { latestBrief, latestAttempt } = args;

  if (latestBrief) {
    if (!latestAttempt || didMonitoringAttemptCreateSavedBrief(latestAttempt)) {
      return {
        latestStateBasis: "saved_brief",
        latestStateSummary:
          "Current monitoring state comes from the latest saved brief for this tracked entry.",
        latestStateResultState: latestBrief.resultState,
        latestStateWatchlistReadLabel: latestBrief.watchlistReadLabel,
        latestStateWatchlistReadConfidence: latestBrief.watchlistReadConfidence,
        latestStateAtsSourceUsed: latestBrief.atsSourceUsed,
      };
    }

    if (didMonitoringAttemptFail(latestAttempt)) {
      return {
        latestStateBasis: "saved_brief",
        latestStateSummary: latestAttempt.errorSummary
          ? `Current monitoring state still comes from the latest saved brief. The most recent monitoring attempt failed and did not create a replacement brief: ${latestAttempt.errorSummary}`
          : "Current monitoring state still comes from the latest saved brief. The most recent monitoring attempt failed and did not create a replacement brief.",
        latestStateResultState: latestBrief.resultState,
        latestStateWatchlistReadLabel: latestBrief.watchlistReadLabel,
        latestStateWatchlistReadConfidence: latestBrief.watchlistReadConfidence,
        latestStateAtsSourceUsed: latestBrief.atsSourceUsed,
      };
    }

    if (didMonitoringAttemptReuseCache(latestAttempt)) {
      return {
        latestStateBasis: "saved_brief",
        latestStateSummary:
          "Current monitoring state still comes from the latest saved brief. The most recent monitoring attempt reused cached work and did not create a new saved brief.",
        latestStateResultState: latestBrief.resultState,
        latestStateWatchlistReadLabel: latestBrief.watchlistReadLabel,
        latestStateWatchlistReadConfidence: latestBrief.watchlistReadConfidence,
        latestStateAtsSourceUsed: latestBrief.atsSourceUsed,
      };
    }

    return {
      latestStateBasis: "saved_brief",
      latestStateSummary: latestAttempt.resultState
        ? `Current monitoring state still comes from the latest saved brief. The most recent monitoring attempt completed with ${formatAttemptResultStateLabel(latestAttempt.resultState)} and did not create a new saved brief.`
        : "Current monitoring state still comes from the latest saved brief. The most recent monitoring attempt completed without creating a new saved brief.",
      latestStateResultState: latestBrief.resultState,
      latestStateWatchlistReadLabel: latestBrief.watchlistReadLabel,
      latestStateWatchlistReadConfidence: latestBrief.watchlistReadConfidence,
      latestStateAtsSourceUsed: latestBrief.atsSourceUsed,
    };
  }

  if (!latestAttempt) {
    return {
      latestStateBasis: "none",
      latestStateSummary: "No monitoring attempts have been recorded for this tracked entry yet.",
      latestStateResultState: null,
      latestStateWatchlistReadLabel: null,
      latestStateWatchlistReadConfidence: null,
      latestStateAtsSourceUsed: null,
    };
  }

  if (didMonitoringAttemptFail(latestAttempt)) {
    return {
      latestStateBasis: "latest_attempt_only",
      latestStateSummary: latestAttempt.errorSummary
        ? `No saved brief exists yet. The latest monitoring state comes only from a failed attempt: ${latestAttempt.errorSummary}`
        : "No saved brief exists yet. The latest monitoring state comes only from a failed attempt.",
      latestStateResultState: latestAttempt.resultState,
      latestStateWatchlistReadLabel: latestAttempt.watchlistReadLabel,
      latestStateWatchlistReadConfidence: latestAttempt.watchlistReadConfidence,
      latestStateAtsSourceUsed: latestAttempt.atsSourceUsed,
    };
  }

  if (didMonitoringAttemptReuseCache(latestAttempt)) {
    return {
      latestStateBasis: "latest_attempt_only",
      latestStateSummary:
        "No saved brief exists yet. The latest monitoring state comes only from a cached attempt record, and no saved brief was created.",
      latestStateResultState: latestAttempt.resultState,
      latestStateWatchlistReadLabel: latestAttempt.watchlistReadLabel,
      latestStateWatchlistReadConfidence: latestAttempt.watchlistReadConfidence,
      latestStateAtsSourceUsed: latestAttempt.atsSourceUsed,
    };
  }

  if (didMonitoringAttemptCreateSavedBrief(latestAttempt)) {
    return {
      latestStateBasis: "saved_brief",
      latestStateSummary:
        "Current monitoring state comes from the latest saved brief for this tracked entry.",
      latestStateResultState: latestAttempt.resultState,
      latestStateWatchlistReadLabel: latestAttempt.watchlistReadLabel,
      latestStateWatchlistReadConfidence: latestAttempt.watchlistReadConfidence,
      latestStateAtsSourceUsed: latestAttempt.atsSourceUsed,
    };
  }

  return {
    latestStateBasis: "latest_attempt_only",
    latestStateSummary: latestAttempt.resultState
      ? `No saved brief exists yet. The latest monitoring state comes only from an unsaved attempt with ${formatAttemptResultStateLabel(latestAttempt.resultState)}.`
      : "No saved brief exists yet. The latest monitoring state comes only from an unsaved attempt.",
    latestStateResultState: latestAttempt.resultState,
    latestStateWatchlistReadLabel: latestAttempt.watchlistReadLabel,
    latestStateWatchlistReadConfidence: latestAttempt.watchlistReadConfidence,
    latestStateAtsSourceUsed: latestAttempt.atsSourceUsed,
  };
}
