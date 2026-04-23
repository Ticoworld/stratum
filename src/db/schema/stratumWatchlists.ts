import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "@/db/schema/tenants";
import type { JobBoardSource } from "@/lib/api/boards";
import type {
  ConfidenceLevel,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";
import type { StratumWatchlistScheduleCadence } from "@/lib/watchlists/schedules";

export interface StratumWatchlist {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface StratumWatchlistEntry {
  id: string;
  watchlistId: string;
  requestedQuery: string;
  normalizedQuery: string;
  scheduleCadence: StratumWatchlistScheduleCadence;
  scheduleNextRunAt: string | null;
  scheduleConsecutiveFailures: number;
  scheduleLeaseToken: string | null;
  scheduleLeaseExpiresAt: string | null;
  latestBriefId: string | null;
  latestMatchedCompanyName: string | null;
  latestResultState: StratumResultState | null;
  latestWatchlistReadLabel: string | null;
  latestWatchlistReadConfidence: ConfidenceLevel | null;
  latestAtsSourceUsed: JobBoardSource | null;
  latestBriefCreatedAt: string | null;
  latestBriefUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const stratumWatchlists = pgTable(
  "stratum_watchlists",
  {
    id: uuid("id").primaryKey().notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantSlugUnique: uniqueIndex("stratum_watchlists_tenant_slug_unique").on(table.tenantId, table.slug),
    tenantUpdatedIdx: index("stratum_watchlists_tenant_updated_idx").on(table.tenantId, table.updatedAt),
  })
);

export const stratumWatchlistEntries = pgTable(
  "stratum_watchlist_entries",
  {
    id: uuid("id").primaryKey().notNull(),
    watchlistId: uuid("watchlist_id")
      .notNull()
      .references(() => stratumWatchlists.id, { onDelete: "cascade" }),
    requestedQuery: text("requested_query").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    scheduleCadence: text("schedule_cadence").notNull().default("off"),
    scheduleNextRunAt: timestamp("schedule_next_run_at", { withTimezone: true }),
    scheduleConsecutiveFailures: integer("schedule_consecutive_failures").notNull().default(0),
    scheduleLeaseToken: uuid("schedule_lease_token"),
    scheduleLeaseExpiresAt: timestamp("schedule_lease_expires_at", { withTimezone: true }),
    latestBriefId: uuid("latest_brief_id"),
    latestMatchedCompanyName: text("latest_matched_company_name"),
    latestResultState: text("latest_result_state"),
    latestWatchlistReadLabel: text("latest_watchlist_read_label"),
    latestWatchlistReadConfidence: text("latest_watchlist_read_confidence"),
    latestAtsSourceUsed: text("latest_ats_source_used"),
    latestBriefCreatedAt: timestamp("latest_brief_created_at", { withTimezone: true }),
    latestBriefUpdatedAt: timestamp("latest_brief_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    watchlistQueryUnique: uniqueIndex("stratum_watchlist_entries_watchlist_query_unique").on(
      table.watchlistId,
      table.normalizedQuery
    ),
    watchlistUpdatedIdx: index("stratum_watchlist_entries_watchlist_updated_idx").on(
      table.watchlistId,
      table.updatedAt
    ),
    scheduleNextRunIdx: index("stratum_watchlist_entries_schedule_next_run_idx").on(
      table.scheduleCadence,
      table.scheduleNextRunAt
    ),
    scheduleLeaseIdx: index("stratum_watchlist_entries_schedule_lease_idx").on(
      table.scheduleLeaseExpiresAt
    ),
  })
);
