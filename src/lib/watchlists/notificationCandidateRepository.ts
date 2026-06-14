import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stratumNotificationCandidates } from "@/db/schema/stratumNotificationCandidates";

import {
  stratumWatchlistEntries,
  stratumWatchlists,
} from "@/db/schema/stratumWatchlists";
import type {
  NotificationInboxCounts,
  StratumNotificationAlertPriority,
  StratumNotificationCandidateKind,
  StratumNotificationCandidateStatus,
  StratumNotificationChangeType,
  WatchlistNotificationCandidate,
  WatchlistNotificationInboxItem,
  StratumNotificationInboxFilter,
} from "@/lib/watchlists/notifications";
import type { StratumMonitoringAttemptOrigin } from "@/lib/watchlists/monitoringEvents";
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";
import { listBriefComparisonSummaries, type BriefComparisonSummary } from "@/lib/watchlists/repository";
import {
  assertTenantlessCompatibilityAllowed,
  resolveTenantId,
  type TenantScope,
} from "@/lib/watchlists/tenantScope";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapNotificationCandidateRow(
  row: typeof stratumNotificationCandidates.$inferSelect
): WatchlistNotificationCandidate {
  return {
    id: row.id,
    watchlistEntryId: row.watchlistEntryId,
    monitoringEventId: row.monitoringEventId,
    relatedBriefId: row.relatedBriefId ?? null,
    attemptOrigin: row.attemptOrigin as StratumMonitoringAttemptOrigin,
    candidateKind: row.candidateKind as StratumNotificationCandidateKind,
    status: row.status as StratumNotificationCandidateStatus,
    changeTypes: (row.changeTypes as StratumNotificationChangeType[]) ?? [],
    summary: row.summary,
    alertPriority: (row.alertPriority as StratumNotificationAlertPriority | null) ?? "digest",
    displayTag: row.displayTag ?? null,
    displayMainLine: row.displayMainLine ?? null,
    displayNextStep: row.displayNextStep ?? null,
    createdAt: toIsoString(row.createdAt),
    readAt: row.readAt ? toIsoString(row.readAt) : null,
    dismissedAt: row.dismissedAt ? toIsoString(row.dismissedAt) : null,
    externalDeliveryAt: row.sentAt ? toIsoString(row.sentAt) : null,
    deliveryMode: "in_app_inbox_only",
  };
}

function mapNotificationInboxRow(
  row: {
    notification: typeof stratumNotificationCandidates.$inferSelect;
    entry: typeof stratumWatchlistEntries.$inferSelect;
    watchlist: typeof stratumWatchlists.$inferSelect;
  },
  comparisonMap: Map<string, BriefComparisonSummary[]>
): WatchlistNotificationInboxItem {
  const candidate = mapNotificationCandidateRow(row.notification);
  const latestMatchedCompanyName =
    getNormalizedTrackedTargetName(
      row.entry.requestedQuery,
      row.entry.latestMatchedCompanyName
    ) ?? null;
  const comparisons = comparisonMap.get(row.entry.id) ?? [];
  const [latestComparison, previousComparison] = comparisons;

  return {
    ...candidate,
    watchlistId: row.watchlist.id,
    watchlistName: row.watchlist.name,
    requestedQuery: row.entry.requestedQuery,
    latestMatchedCompanyName,
    latestBriefId: row.entry.latestBriefId ?? null,
    latestResultState: row.entry.latestResultState ?? null,
    latestWatchlistReadLabel: row.entry.latestWatchlistReadLabel ?? null,
    latestSignalVerdict: latestComparison?.signalVerdict ?? null,
    latestObservedJobsCount: latestComparison?.observedJobsCount ?? null,
    previousObservedJobsCount: previousComparison?.observedJobsCount ?? null,
    latestTopHiringBucket: latestComparison?.topHiringBucket ?? null,
    latestTopHiringBucketCount: latestComparison?.topHiringBucketCount ?? null,
    previousTopHiringBucket: previousComparison?.topHiringBucket ?? null,
    previousTopHiringBucketCount: previousComparison?.topHiringBucketCount ?? null,
  };
}

export async function getNotificationCandidateByMonitoringEventId(
  monitoringEventId: string,
  scope: TenantScope
): Promise<WatchlistNotificationCandidate | null> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);
  const [row] = await db
    .select({
      notification: stratumNotificationCandidates,
    })
    .from(stratumNotificationCandidates)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumNotificationCandidates.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumNotificationCandidates.monitoringEventId, monitoringEventId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  return row ? mapNotificationCandidateRow(row.notification) : null;
}

export async function createNotificationCandidate(args: {
  watchlistEntryId: string;
  scope: TenantScope;
  monitoringEventId: string;
  relatedBriefId?: string | null;
  attemptOrigin: StratumMonitoringAttemptOrigin;
  candidateKind: StratumNotificationCandidateKind;
  status?: StratumNotificationCandidateStatus;
  changeTypes: StratumNotificationChangeType[];
  summary: string;
  alertPriority?: StratumNotificationAlertPriority;
  /** Point-in-time display copy to persist alongside this notification. */
  displayTag: string;
  displayMainLine: string;
  displayNextStep: string;
  createdAt?: Date;
}): Promise<WatchlistNotificationCandidate> {
  assertTenantlessCompatibilityAllowed(args.scope);
  const tenantId = resolveTenantId(args.scope);

  if (tenantId) {
    const scopedEntry = await db
      .select({ id: stratumWatchlistEntries.id })
      .from(stratumWatchlistEntries)
      .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
      .where(
        and(
          eq(stratumWatchlistEntries.id, args.watchlistEntryId),
          eq(stratumWatchlists.tenantId, tenantId)
        )
      )
      .limit(1);

    if (scopedEntry.length === 0) {
      throw new Error("Watchlist entry not found for notification candidate.");
    }
  }

  const [row] = await db
    .insert(stratumNotificationCandidates)
    .values({
      id: randomUUID(),
      watchlistEntryId: args.watchlistEntryId,
      monitoringEventId: args.monitoringEventId,
      relatedBriefId: args.relatedBriefId ?? null,
      attemptOrigin: args.attemptOrigin,
      candidateKind: args.candidateKind,
      status: args.status ?? "unread",
      changeTypes: args.changeTypes,
      summary: args.summary.trim().slice(0, 1500),
      alertPriority: args.alertPriority ?? "digest",
      displayTag: args.displayTag,
      displayMainLine: args.displayMainLine,
      displayNextStep: args.displayNextStep,
      createdAt: args.createdAt ?? new Date(),
    })
    .returning();

  return mapNotificationCandidateRow(row);
}

export async function listNotificationCandidatesByWatchlistEntryId(
  watchlistEntryId: string,
  scope: TenantScope
): Promise<WatchlistNotificationCandidate[]> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);

  const rows = await db
    .select({
      notification: stratumNotificationCandidates,
    })
    .from(stratumNotificationCandidates)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumNotificationCandidates.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumNotificationCandidates.watchlistEntryId, watchlistEntryId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .orderBy(
      desc(stratumNotificationCandidates.createdAt),
      desc(stratumNotificationCandidates.id)
    );

  return rows.map((row) => mapNotificationCandidateRow(row.notification));
}

export async function listNotificationInboxItems(args: {
  scope: TenantScope;
  status?: StratumNotificationInboxFilter;
  limit?: number;
}): Promise<WatchlistNotificationInboxItem[]> {
  assertTenantlessCompatibilityAllowed(args.scope);
  const tenantId = resolveTenantId(args.scope);

  const status = args.status ?? "unread";
  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
  const tenantClause = tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined;

  const baseSelection = db
    .select({
      notification: stratumNotificationCandidates,
      entry: stratumWatchlistEntries,
      watchlist: stratumWatchlists,
    })
    .from(stratumNotificationCandidates)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumNotificationCandidates.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id));

  const rows =
    status === "all"
      ? await (tenantClause ? baseSelection.where(tenantClause) : baseSelection)
          .orderBy(
            desc(stratumNotificationCandidates.createdAt),
            desc(stratumNotificationCandidates.id)
          )
          .limit(limit)
      : await baseSelection
          .where(
            and(
              eq(stratumNotificationCandidates.status, status),
              tenantClause
            )
          )
          .orderBy(
            desc(stratumNotificationCandidates.createdAt),
            desc(stratumNotificationCandidates.id)
          )
          .limit(limit);

  const entryIds = [...new Set(rows.map((row) => row.entry.id))];
  const comparisonMap = await listBriefComparisonSummaries(entryIds);

  return rows.map((row) => mapNotificationInboxRow(row, comparisonMap));
}

export async function getNotificationInboxItemById(
  notificationId: string,
  scope: TenantScope
): Promise<WatchlistNotificationInboxItem | null> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);

  const [row] = await db
    .select({
      notification: stratumNotificationCandidates,
      entry: stratumWatchlistEntries,
      watchlist: stratumWatchlists,
    })
    .from(stratumNotificationCandidates)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumNotificationCandidates.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumNotificationCandidates.id, notificationId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  if (!row) return null;

  const comparisonMap = await listBriefComparisonSummaries([row.entry.id]);
  return mapNotificationInboxRow(row, comparisonMap);
}

export async function getNotificationInboxCounts(scope: TenantScope): Promise<NotificationInboxCounts> {
  assertTenantlessCompatibilityAllowed(scope);
  const tenantId = resolveTenantId(scope);

  const rows = await db
    .select({
      status: stratumNotificationCandidates.status,
    })
    .from(stratumNotificationCandidates)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumNotificationCandidates.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined);

  const unreadCount = rows.filter((row) => row.status === "unread").length;
  const readCount = rows.filter((row) => row.status === "read").length;
  const dismissedCount = rows.filter((row) => row.status === "dismissed").length;

  return {
    totalCount: rows.length,
    unreadCount,
    readCount,
    dismissedCount,
  };
}

export async function updateNotificationInboxState(args: {
  notificationId: string;
  scope: TenantScope;
  action: "mark_read" | "mark_unread" | "dismiss";
}): Promise<WatchlistNotificationInboxItem | null> {
  assertTenantlessCompatibilityAllowed(args.scope);
  const tenantId = resolveTenantId(args.scope);

  const [existing] = await db
    .select({
      notification: stratumNotificationCandidates,
    })
    .from(stratumNotificationCandidates)
    .innerJoin(
      stratumWatchlistEntries,
      eq(stratumNotificationCandidates.watchlistEntryId, stratumWatchlistEntries.id)
    )
    .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
    .where(
      and(
        eq(stratumNotificationCandidates.id, args.notificationId),
        tenantId ? eq(stratumWatchlists.tenantId, tenantId) : undefined
      )
    )
    .limit(1);

  if (!existing?.notification) return null;
  const notification = existing.notification;

  const now = new Date();
  const nextState =
    args.action === "mark_read"
      ? {
          status: "read" as const,
          readAt: notification.readAt ?? now,
          dismissedAt: null,
        }
      : args.action === "mark_unread"
        ? {
            status: "unread" as const,
            readAt: null,
            dismissedAt: null,
          }
        : {
          status: "dismissed" as const,
          readAt: notification.readAt ?? now,
          dismissedAt: now,
        };

  await db
    .update(stratumNotificationCandidates)
    .set(nextState)
    .where(eq(stratumNotificationCandidates.id, notification.id));

  return getNotificationInboxItemById(notification.id, args.scope);
}
