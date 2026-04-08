import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
} from "@/lib/watchlists/monitoringEvents";
import { stratumWatchlistEntries } from "@/db/schema/stratumWatchlists";

export interface StratumMonitoringEvent {
  id: string;
  watchlistEntryId: string;
  requestedQuery: string;
  attemptKind: StratumMonitoringAttemptKind;
  attemptOrigin: StratumMonitoringAttemptOrigin;
  outcomeStatus: StratumMonitoringAttemptOutcome;
  relatedBriefId: string | null;
  resultState: StratumResultState | null;
  matchedCompanyName: string | null;
  atsSourceUsed: JobBoardSource | null;
  watchlistReadLabel: string | null;
  watchlistReadConfidence: ConfidenceLevel | null;
  companyMatchConfidence: ConfidenceLevel | null;
  sourceCoverageCompleteness: SourceCoverageCompleteness | null;
  errorSummary: string | null;
  createdAt: string;
}

export const stratumMonitoringEvents = pgTable(
  "stratum_monitoring_events",
  {
    id: uuid("id").primaryKey().notNull(),
    watchlistEntryId: uuid("watchlist_entry_id")
      .notNull()
      .references(() => stratumWatchlistEntries.id, { onDelete: "cascade" }),
    requestedQuery: text("requested_query").notNull(),
    attemptKind: text("attempt_kind").notNull(),
    attemptOrigin: text("attempt_origin").notNull(),
    outcomeStatus: text("outcome_status").notNull(),
    relatedBriefId: uuid("related_brief_id"),
    resultState: text("result_state"),
    matchedCompanyName: text("matched_company_name"),
    atsSourceUsed: text("ats_source_used"),
    watchlistReadLabel: text("watchlist_read_label"),
    watchlistReadConfidence: text("watchlist_read_confidence"),
    companyMatchConfidence: text("company_match_confidence"),
    sourceCoverageCompleteness: text("source_coverage_completeness"),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    entryCreatedIdx: index("stratum_monitoring_events_entry_created_idx").on(
      table.watchlistEntryId,
      table.createdAt
    ),
  })
);
