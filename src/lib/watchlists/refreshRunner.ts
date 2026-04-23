import { StratumInvestigator, type StratumResult } from "@/lib/services/StratumInvestigator";
import { canPersistStratumBrief, createStratumBrief } from "@/lib/briefs/repository";
import { getCached, setCached } from "@/lib/cache/stratum-cache";
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";
import { attachWatchlistMonitoringToResult } from "@/lib/watchlists/monitoring";
import { recordMonitoringAttempt } from "@/lib/watchlists/monitoringAttemptRecorder";
import {
  attachBriefToWatchlistEntry,
  getWatchlistBriefReplayContext,
  getWatchlistEntryDetailById,
  getWatchlistEntryOverviewById,
} from "@/lib/watchlists/repository";
import type { StratumMonitoringAttemptOrigin } from "@/lib/watchlists/monitoringEvents";

export interface RunStratumRefreshResult {
  result: StratumResult;
  cached: boolean;
  cachedAt?: string;
  watchlistEntryId: string | null;
}

function getMatchedCompanyName(result: StratumResult): string | null {
  const matchedCompanyName = result.matchedCompanyName?.trim() || result.matchedAs?.trim();
  const normalizedTargetName = getNormalizedTrackedTargetName(result.companyName ?? "", matchedCompanyName);

  return (
    normalizedTargetName ??
    matchedCompanyName ??
    result.companyName?.trim() ??
    null
  );
}

export async function runStratumRefresh(args: {
  companyName: string;
  watchlistEntryId?: string | null;
  tenantId: string;
  attemptOrigin?: StratumMonitoringAttemptOrigin | null;
  bypassCache?: boolean;
  manualRefreshRequested?: boolean;
}): Promise<RunStratumRefreshResult> {
  const trimmed = args.companyName.trim();
  const sanitized = trimmed.replace(/[<>"']/g, "").slice(0, 100).trim() || trimmed;
  const trackedEntry = args.watchlistEntryId
    ? await getWatchlistEntryOverviewById(args.watchlistEntryId, { tenantId: args.tenantId })
    : null;
  const watchlistEntryId = trackedEntry?.id ?? null;
  const trackingContext =
    watchlistEntryId && args.attemptOrigin
      ? {
          entryId: watchlistEntryId,
          requestedQuery: trackedEntry?.requestedQuery ?? sanitized,
          attemptOrigin: args.attemptOrigin,
        }
      : null;
  const bypassCache = args.bypassCache === true;

  try {
    const cached = bypassCache ? null : getCached(sanitized);
    if (cached) {
      let cachedResult = cached.result;
      let watchlistMonitoring = null;

      if (watchlistEntryId && cachedResult.briefId) {
        const linked = await attachBriefToWatchlistEntry({
          watchlistEntryId,
          briefId: cachedResult.briefId,
          scope: { tenantId: args.tenantId },
        });

        if (linked) {
          cachedResult = {
            ...cachedResult,
            watchlistEntryId: linked.entry.id,
            watchlistId: linked.watchlist.id,
            watchlistName: linked.watchlist.name,
          };
        }
      }

      if (trackingContext) {
        await recordMonitoringAttempt({
          watchlistEntryId: trackingContext.entryId,
          scope: { tenantId: args.tenantId },
          requestedQuery: trackingContext.requestedQuery,
          attemptOrigin: trackingContext.attemptOrigin,
          outcomeStatus: "reused_cached_result",
          relatedBriefId: cachedResult.briefId ?? null,
          resultState: cachedResult.resultState,
          matchedCompanyName: getMatchedCompanyName(cachedResult),
          atsSourceUsed: cachedResult.apiSource ?? null,
          watchlistReadLabel: cachedResult.strategicVerdict,
          watchlistReadConfidence: cachedResult.watchlistReadConfidence,
          companyMatchConfidence: cachedResult.companyMatchConfidence,
          sourceCoverageCompleteness: cachedResult.sourceCoverageCompleteness,
        });

        const detail = await getWatchlistEntryDetailById(trackingContext.entryId, {
          tenantId: args.tenantId,
        });
        watchlistMonitoring = detail?.monitoring ?? null;
      }

      const cachedAt = new Date(cached.cachedAt).toISOString();
      const result = {
        ...attachWatchlistMonitoringToResult(cachedResult, watchlistMonitoring),
        loadedFromCache: true,
        cachedAt,
        manualRefreshRequested: args.manualRefreshRequested ?? false,
        manualRefreshBypassedCache: bypassCache,
      };

      return {
        result,
        cached: true,
        cachedAt,
        watchlistEntryId,
      };
    }

    const investigator = new StratumInvestigator();
    const freshResult = await investigator.investigate(sanitized);
    let persistedResult = freshResult;
    let savedBriefId: string | null = null;
    let linkedWatchlist:
      | {
          entryId: string;
          watchlistId: string;
          watchlistName: string;
        }
      | null = null;

    if (watchlistEntryId && canPersistStratumBrief(freshResult)) {
      const brief = await createStratumBrief(freshResult);
      if (!brief) {
        throw new Error("Stratum could not persist a completed brief artifact.");
      }

      persistedResult = {
        ...brief.resultSnapshot,
        artifactOrigin: "live",
      };
      savedBriefId = brief.id;

      if (watchlistEntryId) {
        const linked = await attachBriefToWatchlistEntry({
          watchlistEntryId,
          briefId: brief.id,
          scope: { tenantId: args.tenantId },
        });

        if (linked) {
          linkedWatchlist = {
            entryId: linked.entry.id,
            watchlistId: linked.watchlist.id,
            watchlistName: linked.watchlist.name,
          };
        }
      }
    }

    if (trackingContext) {
      await recordMonitoringAttempt({
        watchlistEntryId: trackingContext.entryId,
        scope: { tenantId: args.tenantId },
        requestedQuery: trackingContext.requestedQuery,
        attemptOrigin: trackingContext.attemptOrigin,
        outcomeStatus: savedBriefId ? "saved_brief_created" : "completed_without_saved_brief",
        relatedBriefId: savedBriefId,
        resultState: persistedResult.resultState,
        matchedCompanyName: getMatchedCompanyName(persistedResult),
        atsSourceUsed: persistedResult.apiSource ?? null,
        watchlistReadLabel: persistedResult.strategicVerdict,
        watchlistReadConfidence: persistedResult.watchlistReadConfidence,
        companyMatchConfidence: persistedResult.companyMatchConfidence,
        sourceCoverageCompleteness: persistedResult.sourceCoverageCompleteness,
      });
    }

    setCached(sanitized, persistedResult);

    const watchlistMonitoring =
      linkedWatchlist && persistedResult.briefId
        ? (await getWatchlistBriefReplayContext({
            watchlistEntryId: linkedWatchlist.entryId,
            briefId: persistedResult.briefId,
            scope: { tenantId: args.tenantId },
          }))?.monitoring ?? null
        : trackingContext
          ? (await getWatchlistEntryDetailById(trackingContext.entryId, {
              tenantId: args.tenantId,
            }))?.monitoring ?? null
          : null;

    const result = attachWatchlistMonitoringToResult(
      linkedWatchlist
        ? {
            ...persistedResult,
            watchlistEntryId: linkedWatchlist.entryId,
            watchlistId: linkedWatchlist.watchlistId,
            watchlistName: linkedWatchlist.watchlistName,
          }
        : {
            ...persistedResult,
            watchlistEntryId: watchlistEntryId ?? persistedResult.watchlistEntryId,
          },
      watchlistMonitoring
    );

    return {
      result: {
        ...result,
        loadedFromCache: false,
        cachedAt: undefined,
        manualRefreshRequested: args.manualRefreshRequested ?? false,
        manualRefreshBypassedCache: bypassCache,
      },
      cached: false,
      watchlistEntryId,
    };
  } catch (error) {
    if (trackingContext) {
      try {
        await recordMonitoringAttempt({
          watchlistEntryId: trackingContext.entryId,
          scope: { tenantId: args.tenantId },
          requestedQuery: trackingContext.requestedQuery,
          attemptOrigin: trackingContext.attemptOrigin,
          outcomeStatus: "failed",
          errorSummary:
            error instanceof Error ? error.message : "An unexpected error occurred",
        });
      } catch (eventError) {
        console.error("[Stratum Refresh Runner] Failed to persist monitoring attempt event:", eventError);
      }
    }

    throw error;
  }
}
