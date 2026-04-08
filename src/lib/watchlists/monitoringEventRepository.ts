import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
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

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapMonitoringEventRow(
  row: typeof stratumMonitoringEvents.$inferSelect
): WatchlistMonitoringAttemptHistoryItem {
  return {
    id: row.id,
    watchlistEntryId: row.watchlistEntryId,
    requestedQuery: row.requestedQuery,
    attemptKind: row.attemptKind as StratumMonitoringAttemptKind,
    attemptOrigin: row.attemptOrigin as StratumMonitoringAttemptOrigin,
    outcomeStatus: row.outcomeStatus as StratumMonitoringAttemptOutcome,
    relatedBriefId: row.relatedBriefId ?? null,
    resultState: (row.resultState as StratumResultState | null) ?? null,
    matchedCompanyName: row.matchedCompanyName ?? null,
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
  const [entry] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(eq(stratumWatchlistEntries.id, args.watchlistEntryId))
    .limit(1);

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
  watchlistEntryId: string
): Promise<WatchlistMonitoringAttemptHistoryItem[]> {
  const rows = await db
    .select()
    .from(stratumMonitoringEvents)
    .where(eq(stratumMonitoringEvents.watchlistEntryId, watchlistEntryId))
    .orderBy(desc(stratumMonitoringEvents.createdAt), desc(stratumMonitoringEvents.id));

  return rows.map((row) => mapMonitoringEventRow(row));
}
