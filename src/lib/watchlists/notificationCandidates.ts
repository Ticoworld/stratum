import { getWatchlistEntryDetailById } from "@/lib/watchlists/repository";
import {
  createNotificationCandidate,
  getNotificationCandidateByMonitoringEventId,
} from "@/lib/watchlists/notificationCandidateRepository";
import { deriveMonitoringState } from "@/lib/watchlists/monitoringState";
import type { JobBoardSource } from "@/lib/api/boards";
import type { ConfidenceLevel, StratumResultState } from "@/lib/services/StratumInvestigator";
import {
  buildNotificationCandidateDraft,
  type MonitoringStateComparisonSnapshot,
  type WatchlistNotificationCandidate,
} from "@/lib/watchlists/notifications";
import { didMonitoringAttemptCreateSavedBrief } from "@/lib/watchlists/monitoringEvents";

export async function captureNotificationCandidateForMonitoringEvent(args: {
  watchlistEntryId: string;
  monitoringEventId: string;
}): Promise<WatchlistNotificationCandidate | null> {
  const existing = await getNotificationCandidateByMonitoringEventId(args.monitoringEventId);
  if (existing) return existing;

  const detail = await getWatchlistEntryDetailById(args.watchlistEntryId);
  if (!detail) return null;

  const currentIndex = detail.attemptHistory.findIndex(
    (attempt) => attempt.id === args.monitoringEventId
  );
  if (currentIndex !== 0) {
    return null;
  }

  const currentAttempt = detail.attemptHistory[currentIndex] ?? null;
  if (!currentAttempt) return null;

  const previousAttempt = detail.attemptHistory[currentIndex + 1] ?? null;
  const previousLatestBrief = didMonitoringAttemptCreateSavedBrief(currentAttempt)
    ? detail.history[1] ?? null
    : detail.history[0] ?? null;
  const previousStateDerived = deriveMonitoringState({
    latestBrief: previousLatestBrief,
    latestAttempt: previousAttempt,
  });
  const previousState: MonitoringStateComparisonSnapshot = {
    basis: previousStateDerived.latestStateBasis,
    resultState: previousStateDerived.latestStateResultState,
    watchlistReadLabel: previousStateDerived.latestStateWatchlistReadLabel,
    watchlistReadConfidence: previousStateDerived.latestStateWatchlistReadConfidence,
    atsSourceUsed: previousStateDerived.latestStateAtsSourceUsed,
  };
  const currentState: MonitoringStateComparisonSnapshot = {
    basis: detail.monitoring.latestStateBasis,
    resultState: (detail.monitoring.latestStateResultState as StratumResultState | null) ?? null,
    watchlistReadLabel: detail.monitoring.latestStateWatchlistReadLabel,
    watchlistReadConfidence:
      (detail.monitoring.latestStateWatchlistReadConfidence as ConfidenceLevel | null) ?? null,
    atsSourceUsed: (detail.monitoring.latestStateAtsSourceUsed as JobBoardSource | null) ?? null,
  };
  const draft = buildNotificationCandidateDraft({
    currentAttempt,
    previousAttempt,
    previousState,
    currentState,
    diff: detail.diff,
  });

  if (!draft) return null;

  return createNotificationCandidate({
    watchlistEntryId: args.watchlistEntryId,
    monitoringEventId: currentAttempt.id,
    relatedBriefId: draft.relatedBriefId,
    attemptOrigin: currentAttempt.attemptOrigin,
    candidateKind: draft.candidateKind,
    changeTypes: draft.changeTypes,
    summary: draft.summary,
    createdAt: new Date(currentAttempt.createdAt),
  });
}
