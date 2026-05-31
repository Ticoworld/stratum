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
import { type TenantScope } from "@/lib/watchlists/tenantScope";
import { deriveSignalVerdict } from "@/lib/signals/signalVerdict";
import { deriveVerdictArgs } from "@/lib/signals/verdictInputs";
import { updateStratumBriefVerdict } from "@/lib/briefs/repository";

export async function captureNotificationCandidateForMonitoringEvent(args: {
  watchlistEntryId: string;
  monitoringEventId: string;
  scope: TenantScope;
}): Promise<WatchlistNotificationCandidate | null> {
  const existing = await getNotificationCandidateByMonitoringEventId(
    args.monitoringEventId,
    args.scope
  );
  if (existing) return existing;

  const detail = await getWatchlistEntryDetailById(
    args.watchlistEntryId,
    args.scope
  );
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

  // ---------------------------------------------------------------------------
  // Phase 6E-2: Compute Signal Verdict for the current brief (when a brief was
  // just created) and retrieve the previous brief's persisted verdict.
  //
  // The current brief is detail.history[0] — the newly-saved snapshot.
  // The previous brief is detail.history[1] — the one before it.
  // The diff between them is detail.diff (built at load time from those two).
  //
  // We compute the full comparison-aware verdict here because this is the
  // earliest point where both the brief fields AND the diff are available.
  // ---------------------------------------------------------------------------
  let currentSignalVerdict = null;
  let previousSignalVerdict = null;

  if (didMonitoringAttemptCreateSavedBrief(currentAttempt)) {
    const currentBrief = detail.history[0] ?? null;
    const previousBrief = detail.history[1] ?? null;

    previousSignalVerdict = previousBrief?.signalVerdict ?? null;

    if (currentBrief && currentAttempt.relatedBriefId) {
      const verdictArgs = deriveVerdictArgs(
        {
          jobsObservedCount: currentBrief.jobsObservedCount,
          watchlistReadLabel: currentBrief.watchlistReadLabel,
          watchlistReadConfidence: currentBrief.watchlistReadConfidence,
          companyMatchConfidence: currentBrief.companyMatchConfidence,
          proofRoleGrounding: currentBrief.proofRoleGrounding,
          resultState: currentBrief.resultState,
        },
        detail.diff.comparisonAvailable
          ? {
              comparisonAvailable: detail.diff.comparisonAvailable,
              hasMaterialChange: detail.diff.hasMaterialChange,
              hasSignificantChange: detail.diff.hasSignificantChange,
              significanceDrivers: detail.diff.significanceDrivers,
              comparisonStrength: detail.diff.comparisonStrength,
              changeDirection: detail.diff.changeDirection,
            }
          : null
      );
      const verdictResult = deriveSignalVerdict(verdictArgs);
      currentSignalVerdict = verdictResult.verdict;

      // Persist the verdict onto the brief so future notification rounds can
      // read it as "previousSignalVerdict" and the brief page can use it directly.
      try {
        await updateStratumBriefVerdict(currentAttempt.relatedBriefId, verdictResult);
      } catch (err) {
        console.error(
          "[Stratum 6E-2] Failed to update brief verdict; brief page will fall back to computed verdict:",
          err
        );
      }
    }
  }

  const draft = buildNotificationCandidateDraft({
    currentAttempt,
    previousAttempt,
    previousState,
    currentState,
    diff: detail.diff,
    currentSignalVerdict,
    previousSignalVerdict,
  });

  if (!draft) return null;

  return createNotificationCandidate({
    watchlistEntryId: args.watchlistEntryId,
    scope: args.scope,
    monitoringEventId: currentAttempt.id,
    relatedBriefId: draft.relatedBriefId,
    attemptOrigin: currentAttempt.attemptOrigin,
    candidateKind: draft.candidateKind,
    changeTypes: draft.changeTypes,
    summary: draft.summary,
    alertPriority: draft.alertPriority,
    createdAt: new Date(currentAttempt.createdAt),
  });
}
