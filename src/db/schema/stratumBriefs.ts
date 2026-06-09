import { index, jsonb, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Job, JobBoardSource, UnsupportedSourcePattern } from "@/lib/api/boards";
import type {
  ConfidenceLevel,
  ProofRoleGrounding,
  SourceCoverageCompleteness,
  StratumResult,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";
import type { SignalVerdict, SignalVerdictAlertPriority } from "@/lib/signals/signalVerdict";

export interface StratumBriefSnapshot {
  id: string;
  watchlistEntryId: string | null;
  queriedCompanyName: string;
  matchedCompanyName: string;
  atsSourceUsed: JobBoardSource | null;
  resultState: StratumResultState;
  companyMatchConfidence: ConfidenceLevel;
  companyMatchExplanation: string;
  sourceCoverageCompleteness: SourceCoverageCompleteness;
  sourceCoverageExplanation: string;
  watchlistReadLabel: string;
  watchlistReadSummary: string;
  watchlistReadConfidence: ConfidenceLevel;
  watchlistReadExplanation: string;
  proofRoleGrounding: ProofRoleGrounding;
  proofRoleGroundingExplanation: string;
  jobsObservedCount: number;
  proofRolesSnapshot: Job[];
  limitsSnapshot: string[];
  resultSnapshot: StratumResult;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  providerFailures: number;
  /** Phase 6E-2: Signal Verdict persisted at notification-creation time when diff is available.
   *  Null for briefs saved before this phase or before the notification was captured. */
  signalVerdict: SignalVerdict | null;
  signalVerdictAlertPriority: SignalVerdictAlertPriority | null;
  signalVerdictHeadline: string | null;
  signalVerdictReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export const stratumBriefs = pgTable(
  "stratum_briefs",
  {
    id: uuid("id").primaryKey().notNull(),
    watchlistEntryId: uuid("watchlist_entry_id"),
    queriedCompanyName: text("queried_company_name").notNull(),
    matchedCompanyName: text("matched_company_name").notNull(),
    atsSourceUsed: text("ats_source_used"),
    resultState: text("result_state").notNull(),
    companyMatchConfidence: text("company_match_confidence").notNull(),
    companyMatchExplanation: text("company_match_explanation").notNull(),
    sourceCoverageCompleteness: text("source_coverage_completeness").notNull(),
    sourceCoverageExplanation: text("source_coverage_explanation").notNull(),
    watchlistReadLabel: text("watchlist_read_label").notNull(),
    watchlistReadSummary: text("watchlist_read_summary").notNull(),
    watchlistReadConfidence: text("watchlist_read_confidence").notNull(),
    watchlistReadExplanation: text("watchlist_read_explanation").notNull(),
    proofRoleGrounding: text("proof_role_grounding").notNull(),
    proofRoleGroundingExplanation: text("proof_role_grounding_explanation").notNull(),
    jobsObservedCount: integer("jobs_observed_count").notNull(),
    proofRolesSnapshot: jsonb("proof_roles_snapshot").$type<Job[]>().notNull(),
    limitsSnapshot: jsonb("limits_snapshot").$type<string[]>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<StratumResult>().notNull(),
    unsupportedSourcePattern: text("unsupported_source_pattern"),
    providerFailures: integer("provider_failures").notNull().default(0),
    signalVerdict: text("signal_verdict"),
    signalVerdictAlertPriority: text("signal_verdict_alert_priority"),
    signalVerdictHeadline: text("signal_verdict_headline"),
    signalVerdictReason: text("signal_verdict_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    entryCreatedIdx: index("stratum_briefs_entry_created_idx").on(
      table.watchlistEntryId,
      table.createdAt.desc(),
      table.updatedAt.desc(),
      table.id.desc()
    ),
  })
);
