import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stratumMonitoringEvents } from "@/db/schema/stratumMonitoringEvents";
import {
  stratumWatchlistEntries,
  stratumWatchlists,
} from "@/db/schema/stratumWatchlists";
import type { JobBoardSource } from "@/lib/api/boards";
import type {
  ConfidenceLevel,
  SourceCoverageCompleteness,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";
import type {
  StratumMonitoringAttemptKind,
  StratumMonitoringAttemptOrigin,
  StratumMonitoringAttemptOutcome,
  WatchlistMonitoringAttemptHistoryItem,
} from "@/lib/watchlists/monitoringEvents";
import {
  assertTenantlessCompatibilityAllowed,
  resolveTenantId,
  type TenantScope,
} from "@/lib/watchlists/tenantScope";
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapMonitoringEventRow(
  row: typeof stratumMonitoringEvents.$inferSelect
): WatchlistMonitoringAttemptHistoryItem {
  const matchedCompanyName =
    getNormalizedTrackedTargetName(row.requestedQuery, row.matchedCompanyName) ?? null;

  return {
    id: row.id,
    watchlistEntryId: row.watchlistEntryId,
    requestedQuery: row.requestedQuery,
    attemptKind: row.attemptKind as StratumMonitoringAttemptKind,
    attemptOrigin: row.attemptOrigin as StratumMonitoringAttemptOrigin,
    outcomeStatus: row.outcomeStatus as StratumMonitoringAttemptOutcome,
    relatedBriefId: row.relatedBriefId ?? null,
    resultState: (row.resultState as StratumResultState | null) ?? null,
    matchedCompanyName,
    atsSourceUsed: (row.atsSourceUsed as JobBoardSource | null) ?? null,
    watchlistReadLabel: row.watchlistReadLabel ?? null,
    watchlistReadConfidence:
      (row.watchlistReadConfidence as ConfidenceLevel | null) ?? null,
    companyMatchConfidence:
      (row.companyMatchConfidence as ConfidenceLevel | null) ?? null,
    sourceCoverageCompleteness:
      (row.sourceCoverageCompleteness as SourceCoverageCompleteness | null) ?? null,
    errorSummary: row.errorSummary ?? null,
    createdAt: toIsoString(row.createdAt),
  };
}

export async function createMonitoringAttemptEvent(args: {
  watchlistEntryId: string;
  scope: TenantScope;
  requestedQuery: string;
  attemptKind?: StratumMonitoringAttemptKind;
  attemptOrigin: StratumMonitoringAttemptOrigin;
  outcomeStatus: StratumMonitoringAttemptOutcome;
  relatedBriefId?: string | null;
  resultState?: StratumResultState | null;
  matchedCompanyName?: string | null;
  atsSourceUsed?: JobBoardSource | null;
  watchlistReadLabel?: string | null;
  watchlistReadConfidence?: ConfidenceLevel | null;
  companyMatchConfidence?: ConfidenceLevel | null;
  sourceCoverageCompleteness?: SourceCoverageCompleteness | null;
  errorSummary?: string | null;
  createdAt?: Date;
}): Promise<WatchlistMonitoringAttemptHistoryItem> {
  const createdAt = args.createdAt ?? new Date();
  assertTenantlessCompatibilityAllowed(args.scope);
  const tenantId = resolveTenantId(args.scope);
  const entryQuery = db
    .select({
      entry: stratumWatchlistEntries,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.watchlistEntryId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  const [entryRow] = await entryQuery;
  const entry = entryRow?.entry ?? null;

  if (!entry) {
    throw new Error("Watchlist entry not found for monitoring event.");
  }

  const eventId = randomUUID();
  const [row] = await db
    .insert(stratumMonitoringEvents)
    .values({
      id: eventId,
      watchlistEntryId: args.watchlistEntryId,
      requestedQuery: args.requestedQuery.trim().slice(0, 200) || entry.requestedQuery,
      attemptKind: args.attemptKind ?? "refresh",
      attemptOrigin: args.attemptOrigin,
      outcomeStatus: args.outcomeStatus,
      relatedBriefId: args.relatedBriefId ?? null,
      resultState: args.resultState ?? null,
      matchedCompanyName: args.matchedCompanyName ?? null,
      atsSourceUsed: args.atsSourceUsed ?? null,
      watchlistReadLabel: args.watchlistReadLabel ?? null,
      watchlistReadConfidence: args.watchlistReadConfidence ?? null,
      companyMatchConfidence: args.companyMatchConfidence ?? null,
      sourceCoverageCompleteness: args.sourceCoverageCompleteness ?? null,
      errorSummary: args.errorSummary?.trim().slice(0, 500) || null,
      createdAt,
    })
    .returning();

  const latestResultState =
    args.resultState ?? (args.outcomeStatus === "failed" ? "provider_failure" : entry.latestResultState);
  const latestMatchedCompanyName =
    getNormalizedTrackedTargetName(
      entry.requestedQuery,
      args.matchedCompanyName ?? entry.latestMatchedCompanyName
    ) ?? entry.latestMatchedCompanyName;
  const latestWatchlistReadLabel = args.watchlistReadLabel ?? entry.latestWatchlistReadLabel;
  const latestWatchlistReadConfidence =
    args.watchlistReadConfidence ?? entry.latestWatchlistReadConfidence;
  const latestAtsSourceUsed = args.atsSourceUsed ?? entry.latestAtsSourceUsed;

  await db
    .update(stratumWatchlistEntries)
    .set({
      latestMatchedCompanyName,
      latestResultState,
      latestWatchlistReadLabel,
      latestWatchlistReadConfidence,
      latestAtsSourceUsed,
      updatedAt: createdAt,
    })
    .where(eq(stratumWatchlistEntries.id, entry.id));

  await db
    .update(stratumWatchlistEntries)
    .set({
      updatedAt: createdAt,
    })
    .where(eq(stratumWatchlistEntries.id, entry.id));

  await db
    .update(stratumWatchlists)
    .set({
      updatedAt: createdAt,
    })
    .where(eq(stratumWatchlists.id, entry.watchlistId));

  return mapMonitoringEventRow(row);
}

export async function listMonitoringAttemptEventsByWatchlistEntryId(
  watchlistEntryId: string,
  scope: TenantScope
): Promise<WatchlistMonitoringAttemptHistoryItem[]> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);
  const rows = await db
    .select({
      event: stratumMonitoringEvents,
    })
    .from(stratumMonitoringEvents)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumMonitoringEvents.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumMonitoringEvents.watchlistEntryId, watchlistEntryId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .orderBy(desc(stratumMonitoringEvents.createdAt), desc(stratumMonitoringEvents.id));

  return rows.map((row) => mapMonitoringEventRow(row.event));
}
