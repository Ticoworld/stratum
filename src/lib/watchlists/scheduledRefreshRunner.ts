import {
  claimDueScheduledWatchlistEntry,
  finalizeScheduledWatchlistEntryRun,
  getWatchlistEntryDetailById,
  listDueScheduledWatchlistEntries,
} from "@/lib/watchlists/repository";
import { randomUUID } from "node:crypto";
import { runStratumRefresh } from "@/lib/watchlists/refreshRunner";
import {
  isWatchlistScheduleEnabled,
  type StratumWatchlistScheduleCadence,
} from "@/lib/watchlists/schedules";
import type { StratumMonitoringAttemptOutcome } from "@/lib/watchlists/monitoringEvents";

export interface ScheduledRefreshRunResultItem {
  watchlistId: string;
  watchlistEntryId: string;
  requestedQuery: string;
  cadence: Exclude<StratumWatchlistScheduleCadence, "off">;
  scheduledForAt: string | null;
  nextScheduledRunAt: string | null;
  processed: boolean;
  skippedReason: string | null;
  outcomeStatus: StratumMonitoringAttemptOutcome | null;
  relatedBriefId: string | null;
  resultState: string | null;
  errorSummary: string | null;
}

export interface ScheduledRefreshRunSummary {
  dueCount: number;
  processedCount: number;
  savedBriefCount: number;
  unsavedCount: number;
  failedCount: number;
  results: ScheduledRefreshRunResultItem[];
}

export async function runDueScheduledRefreshes(args?: {
  watchlistId?: string | null;
  limit?: number;
}): Promise<ScheduledRefreshRunSummary> {
  const now = new Date();
  const dueEntries = await listDueScheduledWatchlistEntries({
    watchlistId: args?.watchlistId ?? null,
    now,
    limit: args?.limit ?? 10,
  });
  const results: ScheduledRefreshRunResultItem[] = [];

  for (const dueEntry of dueEntries) {
    if (!isWatchlistScheduleEnabled(dueEntry.scheduleCadence)) continue;

    const cadence = dueEntry.scheduleCadence;
    const leaseToken = randomUUID();
    const claimed = await claimDueScheduledWatchlistEntry({
      entryId: dueEntry.id,
      cadence,
      leaseToken,
      now,
    });

    if (!claimed) {
      results.push({
        watchlistId: dueEntry.watchlistId,
        watchlistEntryId: dueEntry.id,
        requestedQuery: dueEntry.requestedQuery,
        cadence,
        scheduledForAt: dueEntry.scheduleNextRunAt,
        nextScheduledRunAt: dueEntry.scheduleNextRunAt,
        processed: false,
        skippedReason: "not_due_anymore",
        outcomeStatus: null,
        relatedBriefId: null,
        resultState: null,
        errorSummary: null,
      });
      continue;
    }

    let outcomeStatus: StratumMonitoringAttemptOutcome = "failed";
    let relatedBriefId: string | null = null;
    let resultState: string | null = null;
    let errorSummary: string | null = null;

    try {
      const refresh = await runStratumRefresh({
        companyName: claimed.requestedQuery,
        watchlistEntryId: claimed.id,
        attemptOrigin: "scheduled_refresh",
        bypassCache: true,
        manualRefreshRequested: false,
      });
      const monitoring = refresh.result.watchlistMonitoring ?? null;

      outcomeStatus =
        monitoring?.lastMonitoringAttemptOutcome ??
        (refresh.result.briefId ? "saved_brief_created" : "completed_without_saved_brief");
      relatedBriefId = monitoring?.lastMonitoringAttemptBriefId ?? refresh.result.briefId ?? null;
      resultState = monitoring?.lastMonitoringAttemptResultState ?? refresh.result.resultState ?? null;
      errorSummary = monitoring?.lastMonitoringAttemptErrorSummary ?? null;
    } catch (error) {
      outcomeStatus = "failed";
      errorSummary = error instanceof Error ? error.message : "An unexpected error occurred";
    }

    const finalized = await finalizeScheduledWatchlistEntryRun({
      entryId: claimed.id,
      leaseToken,
      cadence,
      outcomeStatus,
      now: new Date(),
    });
    const detail = await getWatchlistEntryDetailById(claimed.id);
    const schedule = detail?.monitoring.schedule;
    const latestAttempt = detail?.latestAttempt ?? null;

    results.push({
      watchlistId: claimed.watchlistId,
      watchlistEntryId: claimed.id,
      requestedQuery: claimed.requestedQuery,
      cadence,
      scheduledForAt: dueEntry.scheduleNextRunAt,
      nextScheduledRunAt: schedule?.nextRunAt ?? finalized?.scheduleNextRunAt ?? claimed.scheduleNextRunAt,
      processed: true,
      skippedReason: finalized ? null : "claim_lost_after_execution",
      outcomeStatus: latestAttempt?.outcomeStatus ?? schedule?.lastScheduledOutcome ?? outcomeStatus,
      relatedBriefId: latestAttempt?.relatedBriefId ?? schedule?.lastScheduledBriefId ?? relatedBriefId,
      resultState: latestAttempt?.resultState ?? schedule?.lastScheduledResultState ?? resultState,
      errorSummary:
        latestAttempt?.errorSummary ?? schedule?.lastScheduledErrorSummary ?? errorSummary,
    });
  }

  return {
    dueCount: dueEntries.length,
    processedCount: results.filter((result) => result.processed).length,
    savedBriefCount: results.filter((result) => result.outcomeStatus === "saved_brief_created").length,
    unsavedCount: results.filter(
      (result) => result.outcomeStatus === "completed_without_saved_brief"
    ).length,
    failedCount: results.filter((result) => result.outcomeStatus === "failed").length,
    results,
  };
}
