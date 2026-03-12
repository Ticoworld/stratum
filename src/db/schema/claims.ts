import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { analysisRuns } from "@/db/schema/analysisRuns";

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().notNull(),
    analysisRunId: uuid("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    claimType: text("claim_type").notNull(),
    statement: text("statement").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    confidence: text("confidence").notNull(),
    supportStatus: text("support_status").notNull(),
    displayOrder: integer("display_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("claims_analysis_display_order_unique").on(table.analysisRunId, table.displayOrder),
    index("claims_analysis_section_display_idx").on(
      table.analysisRunId,
      table.section,
      table.displayOrder
    ),
  ]
);
