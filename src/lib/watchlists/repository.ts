import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { stratumBriefs } from "@/db/schema/stratumBriefs";
import { listStratumBriefsByWatchlistEntryId } from "@/lib/briefs/repository";
import {
  buildWatchlistEntryDiff,
  toWatchlistEntryBriefHistoryItem,
  type WatchlistEntryBriefHistoryItem,
  type WatchlistEntryDiff,
} from "@/lib/watchlists/history";
import { listMonitoringAttemptEventsByWatchlistEntryId } from "@/lib/watchlists/monitoringEventRepository";
import { listNotificationCandidatesByWatchlistEntryId } from "@/lib/watchlists/notificationCandidateRepository";
import { deriveMonitoringState } from "@/lib/watchlists/monitoringState";
import {
  buildMonitoringAttemptSummary,
  didMonitoringAttemptCreateSavedBrief,
  didMonitoringAttemptFail,
  didMonitoringAttemptReuseCache,
  type StratumMonitoringAttemptOrigin,
  type StratumMonitoringAttemptOutcome,
  type StratumMonitoringStateBasis,
  type WatchlistMonitoringAttemptHistoryItem,
} from "@/lib/watchlists/monitoringEvents";
import {
  stratumWatchlistEntries,
  stratumWatchlists,
} from "@/db/schema/stratumWatchlists";
import {
  buildWatchlistEntryScheduleSnapshot,
  computeScheduledFailureRetryAt,
  computeScheduledLeaseExpiresAt,
  computeNextWatchlistScheduleRunAt,
  isWatchlistScheduleEnabled,
  type StratumWatchlistScheduleCadence,
  type WatchlistEntryScheduleSnapshot,
} from "@/lib/watchlists/schedules";
import type { WatchlistNotificationCandidate } from "@/lib/watchlists/notifications";

const DEFAULT_WATCHLIST_NAME = "Default Watchlist";
const DEFAULT_WATCHLIST_SLUG = "default";

export interface WatchlistEntryOverview {
  id: string;
  watchlistId: string;
  requestedQuery: string;
  normalizedQuery: string;
  scheduleCadence: StratumWatchlistScheduleCadence;
  scheduleNextRunAt: string | null;
  scheduleConsecutiveFailures: number;
  scheduleLeaseExpiresAt: string | null;
  latestBriefId: string | null;
  latestMatchedCompanyName: string | null;
  latestResultState: string | null;
  latestWatchlistReadLabel: string | null;
  latestWatchlistReadConfidence: string | null;
  latestAtsSourceUsed: string | null;
  latestBriefCreatedAt: string | null;
  latestBriefUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistOverview {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  entryCount: number;
  entries: WatchlistEntryOverview[];
}

export interface WatchlistEntryDetail {
  entry: WatchlistEntryOverview;
  latestBrief: WatchlistEntryBriefHistoryItem | null;
  previousBrief: WatchlistEntryBriefHistoryItem | null;
  olderBriefs: WatchlistEntryBriefHistoryItem[];
  history: WatchlistEntryBriefHistoryItem[];
  latestAttempt: WatchlistMonitoringAttemptHistoryItem | null;
  olderAttempts: WatchlistMonitoringAttemptHistoryItem[];
  attemptHistory: WatchlistMonitoringAttemptHistoryItem[];
  notificationCandidates: WatchlistNotificationCandidate[];
  diff: WatchlistEntryDiff;
  monitoring: WatchlistMonitoringSnapshot;
}

export type WatchlistBriefPosition = "latest" | "previous" | "older";

export interface WatchlistMonitoringSnapshot {
  entryId: string;
  watchlistId: string;
  watchlistName: string;
  requestedQuery: string;
  latestMatchedCompanyName: string | null;
  latestResultState: string | null;
  latestWatchlistReadLabel: string | null;
  latestWatchlistReadConfidence: string | null;
  latestAtsSourceUsed: string | null;
  latestBriefId: string | null;
  previousBriefId: string | null;
  latestBriefCreatedAt: string | null;
  previousBriefCreatedAt: string | null;
  latestStateResultState: string | null;
  latestStateWatchlistReadLabel: string | null;
  latestStateWatchlistReadConfidence: string | null;
  latestStateAtsSourceUsed: string | null;
  lastRefreshedAt: string | null;
  lastMonitoringAttemptAt: string | null;
  lastMonitoringAttemptOrigin: StratumMonitoringAttemptOrigin | null;
  lastMonitoringAttemptOutcome: StratumMonitoringAttemptOutcome | null;
  lastMonitoringAttemptCreatedSavedBrief: boolean;
  lastMonitoringAttemptUsedCache: boolean;
  lastMonitoringAttemptBriefId: string | null;
  lastMonitoringAttemptResultState: string | null;
  lastMonitoringAttemptMatchedCompanyName: string | null;
  lastMonitoringAttemptAtsSourceUsed: string | null;
  lastMonitoringAttemptErrorSummary: string | null;
  lastMonitoringAttemptSummary: string | null;
  latestStateBasis: StratumMonitoringStateBasis;
  latestStateSummary: string;
  schedule: WatchlistEntryScheduleSnapshot;
  notificationCandidateCount: number;
  unreadNotificationCount: number;
  readNotificationCount: number;
  dismissedNotificationCount: number;
  latestNotificationCandidateAt: string | null;
  latestNotificationCandidateSummary: string | null;
  historyCount: number;
  attemptHistoryCount: number;
  recentFailuresObserved: boolean;
  recentFailureCount: number;
  comparisonAvailable: boolean;
  comparisonStrength: WatchlistEntryDiff["comparisonStrength"];
  comparisonSummary: string;
  comparisonWeak: boolean;
}

export interface WatchlistBriefReplayContext {
  monitoring: WatchlistMonitoringSnapshot & {
    briefPosition: WatchlistBriefPosition;
  };
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeWatchlistQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sanitizeWatchlistName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

function toSlug(value: string): string {
  return sanitizeWatchlistName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function mapWatchlistRow(row: typeof stratumWatchlists.$inferSelect, entries: WatchlistEntryOverview[]): WatchlistOverview {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
    entryCount: entries.length,
    entries,
  };
}

function mapEntryRow(row: typeof stratumWatchlistEntries.$inferSelect): WatchlistEntryOverview {
  return {
    id: row.id,
    watchlistId: row.watchlistId,
    requestedQuery: row.requestedQuery,
    normalizedQuery: row.normalizedQuery,
    scheduleCadence: (row.scheduleCadence as StratumWatchlistScheduleCadence) ?? "off",
    scheduleNextRunAt: toIsoString(row.scheduleNextRunAt),
    scheduleConsecutiveFailures: row.scheduleConsecutiveFailures ?? 0,
    scheduleLeaseExpiresAt: toIsoString(row.scheduleLeaseExpiresAt),
    latestBriefId: row.latestBriefId ?? null,
    latestMatchedCompanyName: row.latestMatchedCompanyName ?? null,
    latestResultState: row.latestResultState ?? null,
    latestWatchlistReadLabel: row.latestWatchlistReadLabel ?? null,
    latestWatchlistReadConfidence: row.latestWatchlistReadConfidence ?? null,
    latestAtsSourceUsed: row.latestAtsSourceUsed ?? null,
    latestBriefCreatedAt: toIsoString(row.latestBriefCreatedAt),
    latestBriefUpdatedAt: toIsoString(row.latestBriefUpdatedAt),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

export async function getWatchlistEntryOverviewById(
  entryId: string
): Promise<WatchlistEntryOverview | null> {
  const [entry] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(eq(stratumWatchlistEntries.id, entryId))
    .limit(1);

  return entry ? mapEntryRow(entry) : null;
}

async function touchWatchlist(watchlistId: string): Promise<void> {
  await db
    .update(stratumWatchlists)
    .set({
      updatedAt: new Date(),
    })
    .where(eq(stratumWatchlists.id, watchlistId));
}

async function getBriefRow(briefId: string) {
  const [brief] = await db
    .select()
    .from(stratumBriefs)
    .where(eq(stratumBriefs.id, briefId))
    .limit(1);

  return brief ?? null;
}

function buildEntryBriefFields(brief: NonNullable<Awaited<ReturnType<typeof getBriefRow>>>) {
  return {
    latestBriefId: brief.id,
    latestMatchedCompanyName: brief.matchedCompanyName,
    latestResultState: brief.resultState,
    latestWatchlistReadLabel: brief.watchlistReadLabel,
    latestWatchlistReadConfidence: brief.watchlistReadConfidence,
    latestAtsSourceUsed: brief.atsSourceUsed,
    latestBriefCreatedAt: brief.createdAt,
    latestBriefUpdatedAt: brief.updatedAt,
  };
}

function toTimestamp(value: Date | string | null | undefined): number | null {
  const isoString = toIsoString(value);
  if (!isoString) return null;

  const timestamp = new Date(isoString).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function shouldUpdateLatestBrief(
  entry: typeof stratumWatchlistEntries.$inferSelect,
  brief: NonNullable<Awaited<ReturnType<typeof getBriefRow>>>
): boolean {
  if (!entry.latestBriefId) return true;
  if (entry.latestBriefId === brief.id) return true;

  const latestCreatedAt = toTimestamp(entry.latestBriefCreatedAt);
  const briefCreatedAt = toTimestamp(brief.createdAt);
  if (latestCreatedAt === null || briefCreatedAt === null) return true;

  if (briefCreatedAt > latestCreatedAt) return true;
  if (briefCreatedAt < latestCreatedAt) return false;

  const latestUpdatedAt = toTimestamp(entry.latestBriefUpdatedAt) ?? latestCreatedAt;
  const briefUpdatedAt = toTimestamp(brief.updatedAt) ?? briefCreatedAt;
  return briefUpdatedAt >= latestUpdatedAt;
}

function entryAlreadyReflectsBrief(
  entry: typeof stratumWatchlistEntries.$inferSelect,
  brief: NonNullable<Awaited<ReturnType<typeof getBriefRow>>>
): boolean {
  return (
    entry.latestBriefId === brief.id &&
    (entry.latestMatchedCompanyName ?? null) === brief.matchedCompanyName &&
    (entry.latestResultState ?? null) === brief.resultState &&
    (entry.latestWatchlistReadLabel ?? null) === brief.watchlistReadLabel &&
    (entry.latestWatchlistReadConfidence ?? null) === brief.watchlistReadConfidence &&
    (entry.latestAtsSourceUsed ?? null) === (brief.atsSourceUsed ?? null) &&
    toIsoString(entry.latestBriefCreatedAt) === toIsoString(brief.createdAt) &&
    toIsoString(entry.latestBriefUpdatedAt) === toIsoString(brief.updatedAt)
  );
}

async function getWatchlistRowById(watchlistId: string) {
  const [watchlist] = await db
    .select()
    .from(stratumWatchlists)
    .where(eq(stratumWatchlists.id, watchlistId))
    .limit(1);

  return watchlist ?? null;
}

export async function ensureDefaultWatchlist(): Promise<WatchlistOverview> {
  const [existing] = await db
    .select()
    .from(stratumWatchlists)
    .where(eq(stratumWatchlists.slug, DEFAULT_WATCHLIST_SLUG))
    .limit(1);

  const watchlist =
    existing ??
    (
      await db
        .insert(stratumWatchlists)
        .values({
          id: randomUUID(),
          name: DEFAULT_WATCHLIST_NAME,
          slug: DEFAULT_WATCHLIST_SLUG,
        })
        .returning()
    )[0];

  return mapWatchlistRow(watchlist, []);
}

export async function resolveWatchlistByIdOrDefault(
  watchlistId?: string | null
): Promise<WatchlistOverview | null> {
  if (!watchlistId || watchlistId === DEFAULT_WATCHLIST_SLUG) {
    return ensureDefaultWatchlist();
  }

  const watchlist = await getWatchlistRowById(watchlistId);
  if (!watchlist) return null;

  return mapWatchlistRow(watchlist, []);
}

export async function createWatchlist(name: string): Promise<WatchlistOverview> {
  const sanitizedName = sanitizeWatchlistName(name);
  if (!sanitizedName) {
    throw new Error("Watchlist name is required.");
  }

  const slugBase = toSlug(sanitizedName) || "watchlist";
  const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;
  const [watchlist] = await db
    .insert(stratumWatchlists)
    .values({
      id: randomUUID(),
      name: sanitizedName,
      slug,
    })
    .returning();

  return mapWatchlistRow(watchlist, []);
}

export async function listWatchlistsWithEntries(): Promise<WatchlistOverview[]> {
  await ensureDefaultWatchlist();

  const watchlists = await db.select().from(stratumWatchlists);
  const entries = await db
    .select()
    .from(stratumWatchlistEntries)
    .orderBy(desc(stratumWatchlistEntries.updatedAt));

  const entriesByWatchlist = new Map<string, WatchlistEntryOverview[]>();
  for (const entry of entries) {
    const mapped = mapEntryRow(entry);
    if (!entriesByWatchlist.has(entry.watchlistId)) entriesByWatchlist.set(entry.watchlistId, []);
    entriesByWatchlist.get(entry.watchlistId)!.push(mapped);
  }

  return [...watchlists]
    .sort((a, b) => {
      if (a.slug === DEFAULT_WATCHLIST_SLUG) return -1;
      if (b.slug === DEFAULT_WATCHLIST_SLUG) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .map((watchlist) => mapWatchlistRow(watchlist, entriesByWatchlist.get(watchlist.id) ?? []));
}

function buildWatchlistMonitoringSnapshot(args: {
  entry: WatchlistEntryOverview;
  watchlist: WatchlistOverview;
  history: WatchlistEntryBriefHistoryItem[];
  attemptHistory: WatchlistMonitoringAttemptHistoryItem[];
  notificationCandidates: WatchlistNotificationCandidate[];
  diff: WatchlistEntryDiff;
}): WatchlistMonitoringSnapshot {
  const latestBrief = args.history[0] ?? null;
  const previousBrief = args.history[1] ?? null;
  const latestAttempt = args.attemptHistory[0] ?? null;
  const recentAttempts = args.attemptHistory.slice(0, 5);
  const recentFailureCount = recentAttempts.filter((attempt) =>
    didMonitoringAttemptFail(attempt)
  ).length;
  const monitoringState = deriveMonitoringState({
    latestBrief,
    latestAttempt,
  });
  const schedule = buildWatchlistEntryScheduleSnapshot({
    cadence: args.entry.scheduleCadence,
    nextRunAt: args.entry.scheduleNextRunAt,
    consecutiveFailures: args.entry.scheduleConsecutiveFailures,
    leaseExpiresAt: args.entry.scheduleLeaseExpiresAt,
    attemptHistory: args.attemptHistory,
  });

  return {
    entryId: args.entry.id,
    watchlistId: args.watchlist.id,
    watchlistName: args.watchlist.name,
    requestedQuery: args.entry.requestedQuery,
    latestMatchedCompanyName: args.entry.latestMatchedCompanyName,
    latestResultState: args.entry.latestResultState,
    latestWatchlistReadLabel: args.entry.latestWatchlistReadLabel,
    latestWatchlistReadConfidence: args.entry.latestWatchlistReadConfidence,
    latestAtsSourceUsed: args.entry.latestAtsSourceUsed,
    latestBriefId: latestBrief?.id ?? null,
    previousBriefId: previousBrief?.id ?? null,
    latestBriefCreatedAt: latestBrief?.createdAt ?? null,
    previousBriefCreatedAt: previousBrief?.createdAt ?? null,
    latestStateResultState: monitoringState.latestStateResultState,
    latestStateWatchlistReadLabel: monitoringState.latestStateWatchlistReadLabel,
    latestStateWatchlistReadConfidence: monitoringState.latestStateWatchlistReadConfidence,
    latestStateAtsSourceUsed: monitoringState.latestStateAtsSourceUsed,
    lastRefreshedAt: latestBrief?.createdAt ?? null,
    lastMonitoringAttemptAt: latestAttempt?.createdAt ?? null,
    lastMonitoringAttemptOrigin: latestAttempt?.attemptOrigin ?? null,
    lastMonitoringAttemptOutcome: latestAttempt?.outcomeStatus ?? null,
    lastMonitoringAttemptCreatedSavedBrief: didMonitoringAttemptCreateSavedBrief(latestAttempt),
    lastMonitoringAttemptUsedCache: didMonitoringAttemptReuseCache(latestAttempt),
    lastMonitoringAttemptBriefId: latestAttempt?.relatedBriefId ?? null,
    lastMonitoringAttemptResultState: latestAttempt?.resultState ?? null,
    lastMonitoringAttemptMatchedCompanyName: latestAttempt?.matchedCompanyName ?? null,
    lastMonitoringAttemptAtsSourceUsed: latestAttempt?.atsSourceUsed ?? null,
    lastMonitoringAttemptErrorSummary: latestAttempt?.errorSummary ?? null,
    lastMonitoringAttemptSummary: latestAttempt
      ? buildMonitoringAttemptSummary(latestAttempt)
      : null,
    latestStateBasis: monitoringState.latestStateBasis,
    latestStateSummary: monitoringState.latestStateSummary,
    schedule,
    notificationCandidateCount: args.notificationCandidates.length,
    unreadNotificationCount: args.notificationCandidates.filter(
      (candidate) => candidate.status === "unread"
    ).length,
    readNotificationCount: args.notificationCandidates.filter(
      (candidate) => candidate.status === "read"
    ).length,
    dismissedNotificationCount: args.notificationCandidates.filter(
      (candidate) => candidate.status === "dismissed"
    ).length,
    latestNotificationCandidateAt: args.notificationCandidates[0]?.createdAt ?? null,
    latestNotificationCandidateSummary: args.notificationCandidates[0]?.summary ?? null,
    historyCount: args.history.length,
    attemptHistoryCount: args.attemptHistory.length,
    recentFailuresObserved: recentFailureCount > 0,
    recentFailureCount,
    comparisonAvailable: args.diff.comparisonAvailable,
    comparisonStrength: args.diff.comparisonStrength,
    comparisonSummary: args.diff.summary,
    comparisonWeak: args.diff.comparisonStrength === "weak",
  };
}

async function buildWatchlistEntryDetailFromRow(
  entry: typeof stratumWatchlistEntries.$inferSelect
): Promise<WatchlistEntryDetail | null> {
  const watchlistRow = await getWatchlistRowById(entry.watchlistId);
  if (!watchlistRow) return null;

  const mappedEntry = mapEntryRow(entry);
  const watchlist = mapWatchlistRow(watchlistRow, []);
  const history = (await listStratumBriefsByWatchlistEntryId(entry.id)).map((brief) =>
    toWatchlistEntryBriefHistoryItem(brief)
  );
  const attemptHistory = await listMonitoringAttemptEventsByWatchlistEntryId(entry.id);
  const notificationCandidates = await listNotificationCandidatesByWatchlistEntryId(entry.id);
  const latestBrief = history[0] ?? null;
  const previousBrief = history[1] ?? null;
  const latestAttempt = attemptHistory[0] ?? null;
  const diff = buildWatchlistEntryDiff(latestBrief, previousBrief);

  return {
    entry: mappedEntry,
    latestBrief,
    previousBrief,
    olderBriefs: history.slice(2),
    history,
    latestAttempt,
    olderAttempts: attemptHistory.slice(1),
    attemptHistory,
    notificationCandidates,
    diff,
    monitoring: buildWatchlistMonitoringSnapshot({
      entry: mappedEntry,
      watchlist,
      history,
      attemptHistory,
      notificationCandidates,
      diff,
    }),
  };
}

export async function addWatchlistEntry(args: {
  requestedQuery: string;
  watchlistId?: string | null;
  briefId?: string | null;
}): Promise<{ watchlist: WatchlistOverview; entry: WatchlistEntryOverview }> {
  const requestedQuery = args.requestedQuery.trim().slice(0, 200);
  if (!requestedQuery) {
    throw new Error("Tracked company or query is required.");
  }

  const watchlist = await resolveWatchlistByIdOrDefault(args.watchlistId);
  if (!watchlist) {
    throw new Error("Watchlist not found.");
  }

  const normalizedQuery = normalizeWatchlistQuery(requestedQuery);
  const [existing] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(
      and(
        eq(stratumWatchlistEntries.watchlistId, watchlist.id),
        eq(stratumWatchlistEntries.normalizedQuery, normalizedQuery)
      )
    )
    .limit(1);

  const brief = args.briefId ? await getBriefRow(args.briefId) : null;
  const now = new Date();
  const briefFields = brief ? buildEntryBriefFields(brief) : null;

  let entryRow: typeof stratumWatchlistEntries.$inferSelect;

  if (existing) {
    const [updated] = await db
      .update(stratumWatchlistEntries)
      .set({
        requestedQuery,
        ...(brief && briefFields && shouldUpdateLatestBrief(existing, brief) ? briefFields : {}),
        updatedAt: now,
      })
      .where(eq(stratumWatchlistEntries.id, existing.id))
      .returning();

    entryRow = updated;
  } else {
    const [created] = await db
      .insert(stratumWatchlistEntries)
      .values({
        id: randomUUID(),
        watchlistId: watchlist.id,
        requestedQuery,
        normalizedQuery,
        ...(briefFields ?? {}),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    entryRow = created;
  }

  if (brief) {
    await db
      .update(stratumBriefs)
      .set({
        watchlistEntryId: entryRow.id,
      })
      .where(eq(stratumBriefs.id, brief.id));
  }

  await touchWatchlist(watchlist.id);
  const watchlistRow = await getWatchlistRowById(watchlist.id);

  return {
    watchlist: mapWatchlistRow(watchlistRow ?? {
      id: watchlist.id,
      name: watchlist.name,
      slug: watchlist.slug,
      createdAt: new Date(watchlist.createdAt),
      updatedAt: now,
    }, []),
    entry: mapEntryRow(entryRow),
  };
}

export async function updateWatchlistEntrySchedule(args: {
  watchlistId: string;
  entryId: string;
  cadence: StratumWatchlistScheduleCadence;
}): Promise<WatchlistEntryDetail | null> {
  const [existing] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.watchlistId, args.watchlistId)
      )
    )
    .limit(1);

  if (!existing) return null;

  const now = new Date();
  const nextRunAt = isWatchlistScheduleEnabled(args.cadence)
    ? existing.scheduleCadence === args.cadence && existing.scheduleNextRunAt
      ? existing.scheduleNextRunAt
      : now
    : null;

  await db
    .update(stratumWatchlistEntries)
    .set({
      scheduleCadence: args.cadence,
      scheduleNextRunAt: nextRunAt,
      scheduleConsecutiveFailures: 0,
      scheduleLeaseToken: null,
      scheduleLeaseExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(stratumWatchlistEntries.id, existing.id));

  await touchWatchlist(existing.watchlistId);

  return getWatchlistEntryDetail({
    watchlistId: existing.watchlistId,
    entryId: existing.id,
  });
}

export async function listDueScheduledWatchlistEntries(args?: {
  watchlistId?: string | null;
  now?: Date;
  limit?: number;
}): Promise<WatchlistEntryOverview[]> {
  const now = args?.now ?? new Date();
  const limit = Math.max(1, Math.min(args?.limit ?? 10, 50));

  const whereClause = args?.watchlistId
    ? and(
        eq(stratumWatchlistEntries.watchlistId, args.watchlistId),
        lte(stratumWatchlistEntries.scheduleNextRunAt, now),
        or(
          isNull(stratumWatchlistEntries.scheduleLeaseExpiresAt),
          lte(stratumWatchlistEntries.scheduleLeaseExpiresAt, now)
        )
      )
    : and(
        lte(stratumWatchlistEntries.scheduleNextRunAt, now),
        or(
          isNull(stratumWatchlistEntries.scheduleLeaseExpiresAt),
          lte(stratumWatchlistEntries.scheduleLeaseExpiresAt, now)
        )
      );

  const rows = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(
      and(
        whereClause,
        or(
          eq(stratumWatchlistEntries.scheduleCadence, "daily"),
          eq(stratumWatchlistEntries.scheduleCadence, "weekly")
        )
      )
    )
    .orderBy(
      asc(stratumWatchlistEntries.scheduleNextRunAt),
      asc(stratumWatchlistEntries.updatedAt),
      asc(stratumWatchlistEntries.id)
    )
    .limit(limit);

  return rows.map((row) => mapEntryRow(row));
}

export async function claimDueScheduledWatchlistEntry(args: {
  entryId: string;
  cadence: Exclude<StratumWatchlistScheduleCadence, "off">;
  leaseToken: string;
  now?: Date;
}): Promise<WatchlistEntryOverview | null> {
  const now = args.now ?? new Date();
  const leaseExpiresAt = computeScheduledLeaseExpiresAt(now);

  const [claimed] = await db
    .update(stratumWatchlistEntries)
    .set({
      scheduleLeaseToken: args.leaseToken,
      scheduleLeaseExpiresAt: leaseExpiresAt,
    })
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.scheduleCadence, args.cadence),
        lte(stratumWatchlistEntries.scheduleNextRunAt, now),
        or(
          isNull(stratumWatchlistEntries.scheduleLeaseExpiresAt),
          lte(stratumWatchlistEntries.scheduleLeaseExpiresAt, now)
        )
      )
    )
    .returning();

  if (!claimed) return null;
  return mapEntryRow(claimed);
}

export async function finalizeScheduledWatchlistEntryRun(args: {
  entryId: string;
  leaseToken: string;
  cadence: Exclude<StratumWatchlistScheduleCadence, "off">;
  outcomeStatus: StratumMonitoringAttemptOutcome;
  now?: Date;
}): Promise<WatchlistEntryOverview | null> {
  const now = args.now ?? new Date();
  const [existing] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.scheduleLeaseToken, args.leaseToken)
      )
    )
    .limit(1);

  if (!existing) return null;

  const nextFailureCount =
    args.outcomeStatus === "failed" ? (existing.scheduleConsecutiveFailures ?? 0) + 1 : 0;
  const nextRunAt =
    args.outcomeStatus === "failed"
      ? computeScheduledFailureRetryAt(args.cadence, nextFailureCount, now)
      : computeNextWatchlistScheduleRunAt(args.cadence, now);

  const [finalized] = await db
    .update(stratumWatchlistEntries)
    .set({
      scheduleNextRunAt: nextRunAt,
      scheduleConsecutiveFailures: nextFailureCount,
      scheduleLeaseToken: null,
      scheduleLeaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.scheduleLeaseToken, args.leaseToken)
      )
    )
    .returning();

  return finalized ? mapEntryRow(finalized) : null;
}

export async function attachBriefToWatchlistEntry(args: {
  watchlistEntryId: string;
  briefId: string;
}): Promise<{ watchlist: WatchlistOverview; entry: WatchlistEntryOverview } | null> {
  const [entry] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(eq(stratumWatchlistEntries.id, args.watchlistEntryId))
    .limit(1);

  if (!entry) return null;

  const brief = await getBriefRow(args.briefId);
  if (!brief) return null;

  const latestShouldUpdate = shouldUpdateLatestBrief(entry, brief);
  const shouldUpdateEntry =
    latestShouldUpdate ? !entryAlreadyReflectsBrief(entry, brief) : false;
  const shouldRelinkBrief = brief.watchlistEntryId !== entry.id;

  const updatedEntry = shouldUpdateEntry
    ? (
        await db
          .update(stratumWatchlistEntries)
          .set({
            ...buildEntryBriefFields(brief),
            updatedAt: new Date(),
          })
          .where(eq(stratumWatchlistEntries.id, entry.id))
          .returning()
      )[0]
    : entry;

  if (shouldRelinkBrief) {
    await db
      .update(stratumBriefs)
      .set({
        watchlistEntryId: entry.id,
      })
      .where(eq(stratumBriefs.id, brief.id));
  }

  if (shouldUpdateEntry || shouldRelinkBrief) {
    await touchWatchlist(entry.watchlistId);
  }

  const watchlistRow = await getWatchlistRowById(entry.watchlistId);
  if (!watchlistRow) return null;

  return {
    watchlist: mapWatchlistRow(watchlistRow, []),
    entry: mapEntryRow(updatedEntry),
  };
}

export async function getWatchlistEntryDetail(args: {
  watchlistId: string;
  entryId: string;
}): Promise<WatchlistEntryDetail | null> {
  const [entry] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.watchlistId, args.watchlistId)
      )
    )
    .limit(1);

  if (!entry) return null;

  return buildWatchlistEntryDetailFromRow(entry);
}

export async function getWatchlistEntryDetailById(
  entryId: string
): Promise<WatchlistEntryDetail | null> {
  const [entry] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(eq(stratumWatchlistEntries.id, entryId))
    .limit(1);

  if (!entry) return null;

  return buildWatchlistEntryDetailFromRow(entry);
}

export async function getWatchlistBriefReplayContext(args: {
  watchlistEntryId: string;
  briefId: string;
}): Promise<WatchlistBriefReplayContext | null> {
  const detail = await getWatchlistEntryDetailById(args.watchlistEntryId);
  if (!detail) return null;

  const historyIndex = detail.history.findIndex((brief) => brief.id === args.briefId);
  if (historyIndex === -1) return null;

  const briefPosition: WatchlistBriefPosition =
    historyIndex === 0 ? "latest" : historyIndex === 1 ? "previous" : "older";

  return {
    monitoring: {
      ...detail.monitoring,
      briefPosition,
    },
  };
}

export async function removeWatchlistEntry(args: {
  watchlistId: string;
  entryId: string;
}): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(stratumWatchlistEntries)
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.watchlistId, args.watchlistId)
      )
    )
    .limit(1);

  if (!existing) return false;

  await db.delete(stratumWatchlistEntries).where(eq(stratumWatchlistEntries.id, existing.id));
  await touchWatchlist(existing.watchlistId);
  return true;
}
