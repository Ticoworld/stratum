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
  StratumNotificationCandidateKind,
  StratumNotificationCandidateStatus,
  StratumNotificationChangeType,
  WatchlistNotificationCandidate,
  WatchlistNotificationInboxItem,
  StratumNotificationInboxFilter,
} from "@/lib/watchlists/notifications";
import type { StratumMonitoringAttemptOrigin } from "@/lib/watchlists/monitoringEvents";
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";
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
    createdAt: toIsoString(row.createdAt),
    readAt: row.readAt ? toIsoString(row.readAt) : null,
    dismissedAt: row.dismissedAt ? toIsoString(row.dismissedAt) : null,
    externalDeliveryAt: row.sentAt ? toIsoString(row.sentAt) : null,
    deliveryMode: "in_app_inbox_only",
  };
}

function mapNotificationInboxRow(row: {
  notification: typeof stratumNotificationCandidates.$inferSelect;
  entry: typeof stratumWatchlistEntries.$inferSelect;
  watchlist: typeof stratumWatchlists.$inferSelect;
}): WatchlistNotificationInboxItem {
  const candidate = mapNotificationCandidateRow(row.notification);
  const latestMatchedCompanyName =
    getNormalizedTrackedTargetName(
      row.entry.requestedQuery,
      row.entry.latestMatchedCompanyName
    ) ?? null;

  return {
    ...candidate,
    watchlistId: row.watchlist.id,
    watchlistName: row.watchlist.name,
    requestedQuery: row.entry.requestedQuery,
    latestMatchedCompanyName,
    latestBriefId: row.entry.latestBriefId ?? null,
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

  return rows.map((row) => mapNotificationInboxRow(row));
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

  return row ? mapNotificationInboxRow(row) : null;
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
