import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { reportRuns } from "@/db/schema/reportRuns";

export const analysisRuns = pgTable(
  "analysis_runs",
  {
    id: uuid("id").primaryKey().notNull(),
    reportRunId: uuid("report_run_id")
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    analysisSequence: integer("analysis_sequence").notNull(),
    status: text("status").notNull(),
    promptVersion: text("prompt_version").notNull(),
    modelProvider: text("model_provider").notNull(),
    modelName: text("model_name").notNull(),
    modelVersion: text("model_version").notNull(),
    inputObjectKey: text("input_object_key").notNull(),
    inputSha256: text("input_sha256").notNull(),
    outputObjectKey: text("output_object_key"),
    outputSha256: text("output_sha256"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("analysis_runs_report_sequence_unique").on(
      table.reportRunId,
      table.analysisSequence
    ),
    index("analysis_runs_report_run_idx").on(table.reportRunId),
    index("analysis_runs_status_idx").on(table.status),
  ]
);
