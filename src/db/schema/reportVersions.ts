import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { analysisRuns } from "@/db/schema/analysisRuns";
import { reportRuns } from "@/db/schema/reportRuns";

export const reportVersions = pgTable(
  "report_versions",
  {
    id: uuid("id").primaryKey().notNull(),
    reportRunId: uuid("report_run_id")
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    analysisRunId: uuid("analysis_run_id").references(() => analysisRuns.id, {
      onDelete: "set null",
    }),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull(),
    templateVersion: text("template_version").notNull(),
    reportObjectKey: text("report_object_key").notNull(),
    reportSha256: text("report_sha256").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("report_versions_run_version_unique").on(table.reportRunId, table.versionNumber),
    index("report_versions_report_run_idx").on(table.reportRunId),
    index("report_versions_status_idx").on(table.status),
    index("report_versions_published_at_idx").on(table.publishedAt),
  ]
);
