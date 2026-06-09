import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
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
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";
import {
  assertTenantlessCompatibilityAllowed,
  resolveTenantId,
  type TenantScope,
} from "@/lib/watchlists/tenantScope";

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
  /** Phase 6E-4: persisted Signal Verdict from the latest saved brief. Absent
   *  when no brief exists or the brief pre-dates Phase 6E-2. */
  latestSignalVerdict?: string | null;
  /** Latest saved brief's observed job count, fetched alongside brief summary
   *  fields for watchlist rows. */
  latestObservedJobsCount?: number | null;
  /** Previous saved brief's observed job count, fetched in the same batch as
   *  the latest saved brief summary fields for row comparisons. */
  previousObservedJobsCount?: number | null;
  /** Latest saved brief's top hiring bucket, derived from the chart-friendly
   *  functional mix when available, falling back to the raw hiring mix. */
  latestTopHiringBucket?: string | null;
  latestTopHiringBucketCount?: number | null;
  previousTopHiringBucket?: string | null;
  previousTopHiringBucketCount?: number | null;
  /** Phase 6E-4: highest-priority (lowest rank) unread alert_priority across
   *  all unread notification candidates for this entry. Absent when no unread
   *  notifications exist. */
  latestUnreadAlertPriority?: string | null;
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

interface ResolveWatchlistArgs {
  tenantId: string;
  watchlistId?: string | null;
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
  latestStateJobsObservedCount: number | null;
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
  comparisonAvailable: boolean;
  diff: WatchlistEntryDiff;
  comparisonStrength: "standard" | "weak" | "unavailable";
  comparisonSummary: string;
  comparisonWeak: boolean;
  comparisonSignificant: boolean;
  significanceDrivers: Array<"count" | "roles" | "mix" | "geography">;
  historyCount: number;
  attemptHistoryCount: number;
  recentFailuresObserved: boolean;
  recentFailureCount: number;
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
  const latestMatchedCompanyName =
    getNormalizedTrackedTargetName(row.requestedQuery, row.latestMatchedCompanyName) ?? null;

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
    latestMatchedCompanyName,
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

interface BriefComparisonSummary {
  signalVerdict: string | null;
  observedJobsCount: number | null;
  topHiringBucket: string | null;
  topHiringBucketCount: number | null;
}

interface BriefComparisonSummaryRow {
  watchlistEntryId: string;
  signalVerdict: string | null;
  jobsObservedCount: number | null;
  topHiringBucket: string | null;
  topHiringBucketCount: number | null;
}

interface UnreadAlertPriorityRow {
  watchlistEntryId: string;
  alertPriority: string | null;
}

function buildUuidListSql(values: string[]) {
  return sql.join(values.map((value) => sql`${value}::uuid`), sql`, `);
}

async function listBriefComparisonSummaries(
  entryIds: string[]
): Promise<Map<string, BriefComparisonSummary[]>> {
  const comparisonMap = new Map<string, BriefComparisonSummary[]>();
  if (entryIds.length === 0) return comparisonMap;

  // Keep the top-bucket derivation inside Postgres so watchlist rows only
  // fetch the small comparison fields they render, not full brief snapshots.
  const briefRows = (await db.execute(sql`
    with ranked_briefs as (
      select
        id as brief_id,
        watchlist_entry_id,
        signal_verdict,
        jobs_observed_count,
        row_number() over (
          partition by watchlist_entry_id
          order by created_at desc, updated_at desc, id desc
        ) as brief_rank
      from stratum_briefs
      where watchlist_entry_id in (${buildUuidListSql(entryIds)})
    ),
    latest_briefs as (
      select
        ranked_briefs.watchlist_entry_id,
        ranked_briefs.signal_verdict,
        ranked_briefs.jobs_observed_count,
        ranked_briefs.brief_rank,
        stratum_briefs.result_snapshot,
        case
          when jsonb_typeof(stratum_briefs.result_snapshot -> 'functionalMix') = 'array'
          then jsonb_array_length(stratum_briefs.result_snapshot -> 'functionalMix')
          else 0
        end as functional_mix_length
      from ranked_briefs
      inner join stratum_briefs
        on stratum_briefs.id = ranked_briefs.brief_id
      where ranked_briefs.brief_rank <= 2
    )
    select
      latest_briefs.watchlist_entry_id as "watchlistEntryId",
      latest_briefs.signal_verdict as "signalVerdict",
      latest_briefs.jobs_observed_count as "jobsObservedCount",
      case
        when latest_briefs.functional_mix_length > 0
        then nullif(latest_briefs.result_snapshot #>> '{functionalMix,0,0}', '')
        else top_hiring_mix.department
      end as "topHiringBucket",
      case
        when latest_briefs.functional_mix_length > 0 then (
          case
            when jsonb_typeof(latest_briefs.result_snapshot #> '{functionalMix,0,1}') = 'number'
            then (latest_briefs.result_snapshot #>> '{functionalMix,0,1}')::integer
            else null
          end
        )
        else top_hiring_mix.count
      end as "topHiringBucketCount"
    from latest_briefs
    left join lateral (
      select
        mix.elem ->> 'department' as department,
        case
          when jsonb_typeof(mix.elem -> 'count') = 'number'
          then (mix.elem ->> 'count')::integer
          else null
        end as count
      from jsonb_array_elements(
        case
          when jsonb_typeof(latest_briefs.result_snapshot -> 'hiringMix') = 'array'
          then latest_briefs.result_snapshot -> 'hiringMix'
          else '[]'::jsonb
        end
      ) with ordinality as mix(elem, ord)
      order by
        case
          when jsonb_typeof(mix.elem -> 'count') = 'number'
          then (mix.elem ->> 'count')::integer
          else null
        end desc nulls last,
        mix.ord asc
      limit 1
    ) as top_hiring_mix on true
    order by latest_briefs.watchlist_entry_id asc, latest_briefs.brief_rank asc
  `)) as unknown as BriefComparisonSummaryRow[];

  for (const row of briefRows) {
    const current = comparisonMap.get(row.watchlistEntryId) ?? [];
    current.push({
      signalVerdict: row.signalVerdict ?? null,
      observedJobsCount:
        typeof row.jobsObservedCount === "number" ? row.jobsObservedCount : null,
      topHiringBucket: row.topHiringBucket ?? null,
      topHiringBucketCount:
        typeof row.topHiringBucketCount === "number" ? row.topHiringBucketCount : null,
    });
    comparisonMap.set(row.watchlistEntryId, current);
  }

  return comparisonMap;
}

async function listUnreadAlertPriorities(entryIds: string[]): Promise<Map<string, string>> {
  const priorityMap = new Map<string, string>();
  if (entryIds.length === 0) return priorityMap;

  const unreadPriorityRows = (await db.execute(sql`
    select distinct on (watchlist_entry_id)
      watchlist_entry_id as "watchlistEntryId",
      alert_priority as "alertPriority"
    from stratum_notification_candidates
    where watchlist_entry_id in (${buildUuidListSql(entryIds)})
      and status = 'unread'
    order by
      watchlist_entry_id asc,
      case alert_priority
        when 'immediate' then 0
        when 'source_issue' then 1
        when 'digest' then 2
        else 3
      end asc,
      created_at desc,
      id desc
  `)) as unknown as UnreadAlertPriorityRow[];

  for (const row of unreadPriorityRows) {
    if (row.alertPriority) {
      priorityMap.set(row.watchlistEntryId, row.alertPriority);
    }
  }

  return priorityMap;
}

export async function getWatchlistEntryOverviewById(
  entryId: string,
  scope: TenantScope
): Promise<WatchlistEntryOverview | null> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);

  const query = db
    .select({
      entry: stratumWatchlistEntries,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumWatchlistEntries.id, entryId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  const [row] = await query;

  return row?.entry ? mapEntryRow(row.entry) : null;
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

async function getScopedBriefRow(briefId: string, tenantId: string) {
  const [row] = await db
    .select({
      brief: stratumBriefs,
    })
    .from(stratumBriefs)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumBriefs.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(and(eq(stratumBriefs.id, briefId), eq(stratumWatchlists.tenantId, tenantId)))
    .limit(1);

  return row?.brief ?? null;
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

async function getWatchlistRowById(watchlistId: string, scope: TenantScope) {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);
  const [watchlist] = await db
    .select()
    .from(stratumWatchlists)
    .where(
      and(
        eq(stratumWatchlists.id, watchlistId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  return watchlist ?? null;
}

export async function ensureDefaultWatchlist(tenantId: string): Promise<WatchlistOverview> {
  const [existing] = await db
    .select()
    .from(stratumWatchlists)
    .where(
      and(
        eq(stratumWatchlists.slug, DEFAULT_WATCHLIST_SLUG),
        eq(stratumWatchlists.tenantId, tenantId)
      )
    )
    .limit(1);

  const watchlist =
    existing ??
    (
      await db
        .insert(stratumWatchlists)
        .values({
          id: randomUUID(),
          tenantId,
          name: DEFAULT_WATCHLIST_NAME,
          slug: DEFAULT_WATCHLIST_SLUG,
        })
        .returning()
    )[0];

  return mapWatchlistRow(watchlist, []);
}

async function listTenantWatchlistsEnsuringDefault(
  tenantId: string
): Promise<Array<typeof stratumWatchlists.$inferSelect>> {
  return (await db.execute(sql`
    with ensured_default as (
      insert into stratum_watchlists (id, tenant_id, name, slug)
      values (
        ${randomUUID()}::uuid,
        ${tenantId}::uuid,
        ${DEFAULT_WATCHLIST_NAME},
        ${DEFAULT_WATCHLIST_SLUG}
      )
      on conflict (tenant_id, slug) do nothing
    )
    select
      id,
      tenant_id as "tenantId",
      name,
      slug,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from stratum_watchlists
    where tenant_id = ${tenantId}::uuid
  `)) as unknown as Array<typeof stratumWatchlists.$inferSelect>;
}

export async function resolveWatchlistByIdOrDefault(
  args: ResolveWatchlistArgs
): Promise<WatchlistOverview | null> {
  if (!args.watchlistId || args.watchlistId === DEFAULT_WATCHLIST_SLUG) {
    return ensureDefaultWatchlist(args.tenantId);
  }

  const watchlist = await getWatchlistRowById(args.watchlistId, { tenantId: args.tenantId });
  if (!watchlist) return null;

  return mapWatchlistRow(watchlist, []);
}

export async function createWatchlist(args: {
  tenantId: string;
  name: string;
}): Promise<WatchlistOverview> {
  const sanitizedName = sanitizeWatchlistName(args.name);
  if (!sanitizedName) {
    throw new Error("Watchlist name is required.");
  }

  const slugBase = toSlug(sanitizedName) || "watchlist";
  const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;
  const [watchlist] = await db
    .insert(stratumWatchlists)
    .values({
      id: randomUUID(),
      tenantId: args.tenantId,
      name: sanitizedName,
      slug,
    })
    .returning();

  return mapWatchlistRow(watchlist, []);
}

/** Inline priority ranker — avoids importing notifications.ts in repository. */
export async function listWatchlistsWithEntries(tenantId: string): Promise<WatchlistOverview[]> {
  const entriesPromise = db
    .select({
      entry: stratumWatchlistEntries,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(eq(stratumWatchlists.tenantId, tenantId))
    .orderBy(desc(stratumWatchlistEntries.updatedAt))
    .execute();
  const watchlistsPromise = listTenantWatchlistsEnsuringDefault(tenantId);

  const [watchlists, entries] = await Promise.all([watchlistsPromise, entriesPromise]);

  const entryIds = entries.map((r) => r.entry.id);
  const [briefComparisonMap, unreadAlertPriorityMap] = await Promise.all([
    listBriefComparisonSummaries(entryIds),
    listUnreadAlertPriorities(entryIds),
  ]);

  const entriesByWatchlist = new Map<string, WatchlistEntryOverview[]>();
  for (const row of entries) {
    const mapped = mapEntryRow(row.entry);
    const briefSummaries = briefComparisonMap.get(row.entry.id) ?? [];
    const latestBriefSummary = briefSummaries[0] ?? null;
    const previousBriefSummary = briefSummaries[1] ?? null;
    mapped.latestSignalVerdict = latestBriefSummary?.signalVerdict ?? null;
    mapped.latestObservedJobsCount = latestBriefSummary?.observedJobsCount ?? null;
    mapped.previousObservedJobsCount = previousBriefSummary?.observedJobsCount ?? null;
    mapped.latestTopHiringBucket = latestBriefSummary?.topHiringBucket ?? null;
    mapped.latestTopHiringBucketCount = latestBriefSummary?.topHiringBucketCount ?? null;
    mapped.previousTopHiringBucket = previousBriefSummary?.topHiringBucket ?? null;
    mapped.previousTopHiringBucketCount = previousBriefSummary?.topHiringBucketCount ?? null;
    mapped.latestUnreadAlertPriority = unreadAlertPriorityMap.get(row.entry.id) ?? null;
    if (!entriesByWatchlist.has(row.entry.watchlistId)) entriesByWatchlist.set(row.entry.watchlistId, []);
    entriesByWatchlist.get(row.entry.watchlistId)!.push(mapped);
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
  const lastMonitoringAttemptMatchedCompanyName =
    latestAttempt
      ? getNormalizedTrackedTargetName(
          latestAttempt.requestedQuery,
          latestAttempt.matchedCompanyName
        ) ?? null
      : null;

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
    latestStateJobsObservedCount: monitoringState.latestStateJobsObservedCount,
    lastRefreshedAt: latestBrief?.createdAt ?? null,
    lastMonitoringAttemptAt: latestAttempt?.createdAt ?? null,
    lastMonitoringAttemptOrigin: latestAttempt?.attemptOrigin ?? null,
    lastMonitoringAttemptOutcome: latestAttempt?.outcomeStatus ?? null,
    lastMonitoringAttemptCreatedSavedBrief: didMonitoringAttemptCreateSavedBrief(latestAttempt),
    lastMonitoringAttemptUsedCache: didMonitoringAttemptReuseCache(latestAttempt),
    lastMonitoringAttemptBriefId: latestAttempt?.relatedBriefId ?? null,
    lastMonitoringAttemptResultState: latestAttempt?.resultState ?? null,
    lastMonitoringAttemptMatchedCompanyName,
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
    diff: args.diff,
    comparisonStrength: args.diff.comparisonStrength,
    comparisonSummary: args.diff.summary,
    comparisonWeak: args.diff.comparisonStrength === "weak",
    comparisonSignificant: args.diff.hasSignificantChange,
    significanceDrivers: args.diff.significanceDrivers,
  };
}

async function buildWatchlistEntryDetailFromRow(
  entry: typeof stratumWatchlistEntries.$inferSelect,
  scope: TenantScope
): Promise<WatchlistEntryDetail | null> {
  const [watchlistRow, historyRaw, attemptHistory, notificationCandidates] = await Promise.all([
    getWatchlistRowById(entry.watchlistId, scope).catch(() => null),
    listStratumBriefsByWatchlistEntryId(entry.id, scope).catch(() => []),
    listMonitoringAttemptEventsByWatchlistEntryId(entry.id, scope).catch(() => []),
    listNotificationCandidatesByWatchlistEntryId(entry.id, scope).catch(() => []),
  ]);

  if (!watchlistRow) return null;

  const history = historyRaw.map((brief) => toWatchlistEntryBriefHistoryItem(brief));
  const mappedEntry = mapEntryRow(entry);
  const watchlist = mapWatchlistRow(watchlistRow, []);
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
  tenantId: string;
  watchlistId?: string | null;
  briefId?: string | null;
  latestMatchedCompanyName?: string | null;
  latestAtsSourceUsed?: string | null;
}): Promise<{ watchlist: WatchlistOverview; entry: WatchlistEntryOverview }> {
  const requestedQuery = args.requestedQuery.trim().slice(0, 200);
  if (!requestedQuery) {
    throw new Error("Tracked company or query is required.");
  }

  const watchlist = await resolveWatchlistByIdOrDefault({
    tenantId: args.tenantId,
    watchlistId: args.watchlistId,
  });
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

  const brief = args.briefId ? await getScopedBriefRow(args.briefId, args.tenantId) : null;
  if (args.briefId && !brief) {
    throw new Error("Brief not found.");
  }
  const now = new Date();
  const briefFields = brief ? buildEntryBriefFields(brief) : null;
  const initialEntryFields =
    !brief && (args.latestMatchedCompanyName || args.latestAtsSourceUsed)
      ? {
          latestMatchedCompanyName: args.latestMatchedCompanyName ?? null,
          latestAtsSourceUsed: args.latestAtsSourceUsed ?? null,
        }
      : null;

  let entryRow: typeof stratumWatchlistEntries.$inferSelect;

  if (existing) {
    const [updated] = await db
      .update(stratumWatchlistEntries)
      .set({
        requestedQuery,
        ...(initialEntryFields ?? {}),
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
        ...(initialEntryFields ?? {}),
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
  const watchlistRow = await getWatchlistRowById(watchlist.id, { tenantId: args.tenantId });

  return {
    watchlist: mapWatchlistRow(watchlistRow ?? {
      id: watchlist.id,
      tenantId: args.tenantId,
      name: watchlist.name,
      slug: watchlist.slug,
      createdAt: new Date(watchlist.createdAt),
      updatedAt: now,
    }, []),
    entry: mapEntryRow(entryRow),
  };
}

export async function updateWatchlistEntrySchedule(args: {
  tenantId: string;
  watchlistId: string;
  entryId: string;
  cadence: StratumWatchlistScheduleCadence;
}): Promise<WatchlistEntryDetail | null> {
  const [existing] = await db
    .select({
      entry: stratumWatchlistEntries,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.watchlistId, args.watchlistId),
        eq(stratumWatchlists.tenantId, args.tenantId)
      )
    )
    .limit(1);

  if (!existing?.entry) return null;
  const existingEntry = existing.entry;

  const now = new Date();
  const nextRunAt = isWatchlistScheduleEnabled(args.cadence)
    ? existingEntry.scheduleCadence === args.cadence && existingEntry.scheduleNextRunAt
      ? existingEntry.scheduleNextRunAt
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
    .where(eq(stratumWatchlistEntries.id, existingEntry.id));

  await touchWatchlist(existingEntry.watchlistId);

  return getWatchlistEntryDetail({
    scope: { tenantId: args.tenantId },
    watchlistId: existingEntry.watchlistId,
    entryId: existingEntry.id,
  });
}

export async function listDueScheduledWatchlistEntries(args: {
  scope: { tenantId: string } | { globalScheduler: true };
  watchlistId?: string | null;
  now?: Date;
  limit?: number;
}): Promise<(WatchlistEntryOverview & { watchlistTenantId: string | null })[]> {
  const tenantId = "tenantId" in args.scope ? args.scope.tenantId : null;
  const now = args.now ?? new Date();
  const limit = Math.max(1, Math.min(args.limit ?? 10, 50));

  const whereClause = args.watchlistId
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
    .select({
      entry: stratumWatchlistEntries,
      watchlistTenantId: stratumWatchlists.tenantId,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        whereClause,
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined,
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

  return rows.map((row) => ({
    ...mapEntryRow(row.entry),
    watchlistTenantId: row.watchlistTenantId,
  }));
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
  scope: TenantScope;
}): Promise<{ watchlist: WatchlistOverview; entry: WatchlistEntryOverview } | null> {
  assertTenantlessCompatibilityAllowed(args.scope);

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

  const watchlistRow = await getWatchlistRowById(entry.watchlistId, args.scope);
  if (!watchlistRow) return null;

  return {
    watchlist: mapWatchlistRow(watchlistRow, []),
    entry: mapEntryRow(updatedEntry),
  };
}

export async function getWatchlistEntryDetail(args: {
  scope: TenantScope;
  watchlistId: string;
  entryId: string;
}): Promise<WatchlistEntryDetail | null> {
  assertTenantlessCompatibilityAllowed(args.scope);
  const tenantId = resolveTenantId(args.scope);

  const [row] = await db
    .select({
      entry: stratumWatchlistEntries,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.watchlistId, args.watchlistId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  if (!row?.entry) return null;

  return buildWatchlistEntryDetailFromRow(row.entry, args.scope);
}

export async function getWatchlistEntryDetailById(
  entryId: string,
  scope: TenantScope
): Promise<WatchlistEntryDetail | null> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);

  const [row] = await db
    .select({
      entry: stratumWatchlistEntries,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumWatchlistEntries.id, entryId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  if (!row?.entry) return null;

  return buildWatchlistEntryDetailFromRow(row.entry, scope);
}

export async function getWatchlistBriefReplayContext(args: {
  scope: TenantScope;
  watchlistEntryId: string;
  briefId: string;
}): Promise<WatchlistBriefReplayContext | null> {
  const detail = await getWatchlistEntryDetailById(args.watchlistEntryId, args.scope);
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
  tenantId: string;
  watchlistId: string;
  entryId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({
      entry: stratumWatchlistEntries,
    })
    .from(stratumWatchlistEntries)
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumWatchlistEntries.id, args.entryId),
        eq(stratumWatchlistEntries.watchlistId, args.watchlistId),
        eq(stratumWatchlists.tenantId, args.tenantId)
      )
    )
    .limit(1);

  if (!row?.entry) return false;
  const existing = row.entry;

  await db.delete(stratumWatchlistEntries).where(eq(stratumWatchlistEntries.id, existing.id));
  await touchWatchlist(existing.watchlistId);
  return true;
}
