import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, withDbRetry } from "@/db/client";
import { stratumBriefs, type StratumBriefSnapshot } from "@/db/schema/stratumBriefs";
import { stratumWatchlistEntries, stratumWatchlists } from "@/db/schema/stratumWatchlists";

import { buildStratumLimitations, getMatchedCompanyName } from "@/lib/briefs/presentation";
import type { StratumResult } from "@/lib/services/StratumInvestigator";
import type { SignalVerdict, SignalVerdictAlertPriority, SignalVerdictResult } from "@/lib/signals/signalVerdict";
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";
import {
  assertTenantlessCompatibilityAllowed,
  resolveTenantId,
  type TenantScope,
} from "@/lib/watchlists/tenantScope";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sanitizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function canPersistStratumBrief(result: StratumResult): boolean {
  if (result.resultState === "provider_failure") return false;
  if (
    result.resultState === "supported_provider_matched_with_observed_openings" &&
    result.watchlistReadConfidence === "none"
  ) {
    return false;
  }
  if (result.resultState === "ambiguous_company_match" && result.watchlistReadConfidence === "none") {
    return false;
  }
  return true;
}

function buildStoredResultSnapshot(
  result: StratumResult,
  args: { briefId: string; createdAt: string; updatedAt: string; matchedCompanyName: string; limitsSnapshot: string[] }
): StratumResult {
  const { briefId, createdAt, updatedAt, matchedCompanyName, limitsSnapshot } = args;

  return {
    ...result,
    artifactOrigin: "saved",
    loadedFromCache: false,
    cachedAt: undefined,
    briefId,
    matchedCompanyName,
    briefCreatedAt: createdAt,
    briefUpdatedAt: updatedAt,
    limitsSnapshot,
  };
}

function buildBriefSnapshot(result: StratumResult, briefId: string): StratumBriefSnapshot {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const matchedCompanyName = getMatchedCompanyName(result);
  const limitsSnapshot = buildStratumLimitations(result);
  const resultSnapshot = buildStoredResultSnapshot(result, {
    briefId,
    createdAt,
    updatedAt,
    matchedCompanyName,
    limitsSnapshot,
  });

  return {
    id: briefId,
    watchlistEntryId: null,
    queriedCompanyName: result.companyName,
    matchedCompanyName,
    atsSourceUsed: result.apiSource ?? null,
    resultState: result.resultState,
    companyMatchConfidence: result.companyMatchConfidence,
    companyMatchExplanation: result.companyMatchExplanation,
    sourceCoverageCompleteness: result.sourceCoverageCompleteness,
    sourceCoverageExplanation: result.sourceCoverageExplanation,
    watchlistReadLabel: result.strategicVerdict,
    watchlistReadSummary: result.summary,
    watchlistReadConfidence: result.watchlistReadConfidence,
    watchlistReadExplanation: result.watchlistReadExplanation,
    proofRoleGrounding: result.proofRoleGrounding,
    proofRoleGroundingExplanation: result.proofRoleGroundingExplanation,
    jobsObservedCount: result.jobs.length,
    proofRolesSnapshot: sanitizeJson(result.proofRoles),
    limitsSnapshot: sanitizeJson(limitsSnapshot),
    resultSnapshot: sanitizeJson(resultSnapshot),
    unsupportedSourcePattern: result.unsupportedSourcePattern,
    providerFailures: result.providerFailures,
    // Verdict is null at creation time; populated by updateStratumBriefVerdict
    // after the monitoring notification capture has the diff context available.
    signalVerdict: null,
    signalVerdictAlertPriority: null,
    signalVerdictHeadline: null,
    signalVerdictReason: null,
    createdAt,
    updatedAt,
  };
}

export async function createStratumBrief(result: StratumResult): Promise<StratumBriefSnapshot | null> {
  if (!canPersistStratumBrief(result)) return null;

  const briefId = randomUUID();
  const snapshot = buildBriefSnapshot(result, briefId);

  await withDbRetry(() =>
    db.insert(stratumBriefs).values({
      id: snapshot.id,
      watchlistEntryId: snapshot.watchlistEntryId,
      queriedCompanyName: snapshot.queriedCompanyName,
      matchedCompanyName: snapshot.matchedCompanyName,
      atsSourceUsed: snapshot.atsSourceUsed,
      resultState: snapshot.resultState,
      companyMatchConfidence: snapshot.companyMatchConfidence,
      companyMatchExplanation: snapshot.companyMatchExplanation,
      sourceCoverageCompleteness: snapshot.sourceCoverageCompleteness,
      sourceCoverageExplanation: snapshot.sourceCoverageExplanation,
      watchlistReadLabel: snapshot.watchlistReadLabel,
      watchlistReadSummary: snapshot.watchlistReadSummary,
      watchlistReadConfidence: snapshot.watchlistReadConfidence,
      watchlistReadExplanation: snapshot.watchlistReadExplanation,
      proofRoleGrounding: snapshot.proofRoleGrounding,
      proofRoleGroundingExplanation: snapshot.proofRoleGroundingExplanation,
      jobsObservedCount: snapshot.jobsObservedCount,
      proofRolesSnapshot: sanitizeJson(snapshot.proofRolesSnapshot),
      limitsSnapshot: sanitizeJson(snapshot.limitsSnapshot),
      resultSnapshot: sanitizeJson(snapshot.resultSnapshot),
      unsupportedSourcePattern: snapshot.unsupportedSourcePattern,
      providerFailures: snapshot.providerFailures,
    })
  );

  return snapshot;
}

function mapBriefRowToSnapshot(row: typeof stratumBriefs.$inferSelect): StratumBriefSnapshot {
  const createdAt = toIsoString(row.createdAt);
  const updatedAt = toIsoString(row.updatedAt);
  const matchedCompanyName =
    getNormalizedTrackedTargetName(row.queriedCompanyName, row.matchedCompanyName) ??
    row.matchedCompanyName;
  const resultSnapshot = buildStoredResultSnapshot(row.resultSnapshot, {
    briefId: row.id,
    createdAt,
    updatedAt,
    matchedCompanyName,
    limitsSnapshot: row.limitsSnapshot,
  });

  return {
    id: row.id,
    watchlistEntryId: row.watchlistEntryId,
    queriedCompanyName: row.queriedCompanyName,
    matchedCompanyName,
    atsSourceUsed: (row.atsSourceUsed as StratumBriefSnapshot["atsSourceUsed"]) ?? null,
    resultState: row.resultState as StratumBriefSnapshot["resultState"],
    companyMatchConfidence: row.companyMatchConfidence as StratumBriefSnapshot["companyMatchConfidence"],
    companyMatchExplanation: row.companyMatchExplanation,
    sourceCoverageCompleteness:
      row.sourceCoverageCompleteness as StratumBriefSnapshot["sourceCoverageCompleteness"],
    sourceCoverageExplanation: row.sourceCoverageExplanation,
    watchlistReadLabel: row.watchlistReadLabel,
    watchlistReadSummary: row.watchlistReadSummary,
    watchlistReadConfidence: row.watchlistReadConfidence as StratumBriefSnapshot["watchlistReadConfidence"],
    watchlistReadExplanation: row.watchlistReadExplanation,
    proofRoleGrounding: row.proofRoleGrounding as StratumBriefSnapshot["proofRoleGrounding"],
    proofRoleGroundingExplanation: row.proofRoleGroundingExplanation,
    jobsObservedCount: row.jobsObservedCount,
    proofRolesSnapshot: row.proofRolesSnapshot,
    limitsSnapshot: row.limitsSnapshot,
    resultSnapshot,
    unsupportedSourcePattern:
      (row.unsupportedSourcePattern as StratumBriefSnapshot["unsupportedSourcePattern"]) ?? null,
    providerFailures: row.providerFailures,
    signalVerdict: (row.signalVerdict as SignalVerdict | null | undefined) ?? null,
    signalVerdictAlertPriority:
      (row.signalVerdictAlertPriority as SignalVerdictAlertPriority | null | undefined) ?? null,
    signalVerdictHeadline: row.signalVerdictHeadline ?? null,
    signalVerdictReason: row.signalVerdictReason ?? null,
    createdAt,
    updatedAt,
  };
}

/**
 * Phase 6E-2: Persists the Signal Verdict onto an existing brief.
 * Called by captureNotificationCandidateForMonitoringEvent after the diff
 * is available — the earliest point where a comparison-aware verdict can be
 * computed.
 *
 * The operation is best-effort: if this fails, the brief page falls back to
 * computing the verdict at render time via deriveSignalVerdict.
 */
export async function updateStratumBriefVerdict(
  briefId: string,
  verdict: SignalVerdictResult
): Promise<void> {
  await withDbRetry(() =>
    db
      .update(stratumBriefs)
      .set({
        signalVerdict: verdict.verdict,
        signalVerdictAlertPriority: verdict.alertPriority,
        signalVerdictHeadline: verdict.headline,
        signalVerdictReason: verdict.reason,
      })
      .where(eq(stratumBriefs.id, briefId))
  );
}

export async function getStratumBriefById(
  briefId: string,
  scope: TenantScope
): Promise<StratumBriefSnapshot | null> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);

  const query = db
    .select({
      brief: stratumBriefs,
    })
    .from(stratumBriefs)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumBriefs.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumBriefs.id, briefId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  const [row] = await withDbRetry(() => query);
  if (!row) return null;

  return mapBriefRowToSnapshot(row.brief);
}

export async function listStratumBriefsByWatchlistEntryId(
  watchlistEntryId: string,
  scope: TenantScope
): Promise<StratumBriefSnapshot[]> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);

  const rows = await withDbRetry(() =>
    db
      .select({
        brief: stratumBriefs,
      })
      .from(stratumBriefs)
      .innerJoin(
        stratumWatchlistEntries,
        eq(stratumBriefs.watchlistEntryId, stratumWatchlistEntries.id)
      )
      .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
      .where(
        and(
          eq(stratumBriefs.watchlistEntryId, watchlistEntryId),
          tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
        )
      )
      .orderBy(desc(stratumBriefs.createdAt), desc(stratumBriefs.updatedAt), desc(stratumBriefs.id))
  );

  return rows.map((row) => mapBriefRowToSnapshot(row.brief));
}
