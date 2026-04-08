import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
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

  return {
    ...candidate,
    watchlistId: row.watchlist.id,
    watchlistName: row.watchlist.name,
    requestedQuery: row.entry.requestedQuery,
    latestMatchedCompanyName: row.entry.latestMatchedCompanyName ?? null,
    latestBriefId: row.entry.latestBriefId ?? null,
  };
}

export async function getNotificationCandidateByMonitoringEventId(
  monitoringEventId: string
): Promise<WatchlistNotificationCandidate | null> {
  const [row] = await db
    .select()
    .from(stratumNotificationCandidates)
    .where(eq(stratumNotificationCandidates.monitoringEventId, monitoringEventId))
    .limit(1);

  return row ? mapNotificationCandidateRow(row) : null;
}

export async function createNotificationCandidate(args: {
  watchlistEntryId: string;
  monitoringEventId: string;
  relatedBriefId?: string | null;
  attemptOrigin: StratumMonitoringAttemptOrigin;
  candidateKind: StratumNotificationCandidateKind;
  status?: StratumNotificationCandidateStatus;
  changeTypes: StratumNotificationChangeType[];
  summary: string;
  createdAt?: Date;
}): Promise<WatchlistNotificationCandidate> {
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
  watchlistEntryId: string
): Promise<WatchlistNotificationCandidate[]> {
  const rows = await db
    .select()
    .from(stratumNotificationCandidates)
    .where(eq(stratumNotificationCandidates.watchlistEntryId, watchlistEntryId))
    .orderBy(
      desc(stratumNotificationCandidates.createdAt),
      desc(stratumNotificationCandidates.id)
    );

  return rows.map((row) => mapNotificationCandidateRow(row));
}

export async function listNotificationInboxItems(args?: {
  status?: StratumNotificationInboxFilter;
  limit?: number;
}): Promise<WatchlistNotificationInboxItem[]> {
  const status = args?.status ?? "unread";
  const limit = Math.max(1, Math.min(args?.limit ?? 50, 200));

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
      ? await baseSelection
          .orderBy(
            desc(stratumNotificationCandidates.createdAt),
            desc(stratumNotificationCandidates.id)
          )
          .limit(limit)
      : await baseSelection
          .where(eq(stratumNotificationCandidates.status, status))
          .orderBy(
            desc(stratumNotificationCandidates.createdAt),
            desc(stratumNotificationCandidates.id)
          )
          .limit(limit);

  return rows.map((row) => mapNotificationInboxRow(row));
}

export async function getNotificationInboxItemById(
  notificationId: string
): Promise<WatchlistNotificationInboxItem | null> {
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
    .where(eq(stratumNotificationCandidates.id, notificationId))
    .limit(1);

  return row ? mapNotificationInboxRow(row) : null;
}

export async function getNotificationInboxCounts(): Promise<NotificationInboxCounts> {
  const rows = await db
    .select({
      status: stratumNotificationCandidates.status,
    })
    .from(stratumNotificationCandidates);

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
  action: "mark_read" | "mark_unread" | "dismiss";
}): Promise<WatchlistNotificationInboxItem | null> {
  const [existing] = await db
    .select()
    .from(stratumNotificationCandidates)
    .where(eq(stratumNotificationCandidates.id, args.notificationId))
    .limit(1);

  if (!existing) return null;

  const now = new Date();
  const nextState =
    args.action === "mark_read"
      ? {
          status: "read" as const,
          readAt: existing.readAt ?? now,
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
            readAt: existing.readAt ?? now,
            dismissedAt: now,
          };

  await db
    .update(stratumNotificationCandidates)
    .set(nextState)
    .where(eq(stratumNotificationCandidates.id, existing.id));

  return getNotificationInboxItemById(existing.id);
}
