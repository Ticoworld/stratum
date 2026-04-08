import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { stratumBriefs } from "@/db/schema/stratumBriefs";
import { stratumMonitoringEvents } from "@/db/schema/stratumMonitoringEvents";
import { stratumWatchlistEntries } from "@/db/schema/stratumWatchlists";
import type {
  StratumNotificationCandidateKind,
  StratumNotificationCandidateStatus,
  StratumNotificationChangeType,
} from "@/lib/watchlists/notifications";
import type { StratumMonitoringAttemptOrigin } from "@/lib/watchlists/monitoringEvents";

export interface StratumNotificationCandidateRecord {
  id: string;
  watchlistEntryId: string;
  monitoringEventId: string;
  relatedBriefId: string | null;
  attemptOrigin: StratumMonitoringAttemptOrigin;
  candidateKind: StratumNotificationCandidateKind;
  status: StratumNotificationCandidateStatus;
  changeTypes: StratumNotificationChangeType[];
  summary: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  sentAt: string | null;
}

export const stratumNotificationCandidates = pgTable(
  "stratum_notification_candidates",
  {
    id: uuid("id").primaryKey().notNull(),
    watchlistEntryId: uuid("watchlist_entry_id")
      .notNull()
      .references(() => stratumWatchlistEntries.id, { onDelete: "cascade" }),
    monitoringEventId: uuid("monitoring_event_id")
      .notNull()
      .references(() => stratumMonitoringEvents.id, { onDelete: "cascade" }),
    relatedBriefId: uuid("related_brief_id").references(() => stratumBriefs.id, {
      onDelete: "set null",
    }),
    attemptOrigin: text("attempt_origin").notNull(),
    candidateKind: text("candidate_kind").notNull(),
    status: text("status").notNull().default("unread"),
    changeTypes: jsonb("change_types").$type<StratumNotificationChangeType[]>().notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => ({
    eventUnique: uniqueIndex("stratum_notification_candidates_event_unique").on(
      table.monitoringEventId
    ),
    entryCreatedIdx: index("stratum_notification_candidates_entry_created_idx").on(
      table.watchlistEntryId,
      table.createdAt
    ),
  })
);
