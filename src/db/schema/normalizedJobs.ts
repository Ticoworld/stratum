import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { reportRuns } from "@/db/schema/reportRuns";
import { sourceSnapshots } from "@/db/schema/sourceSnapshots";

export const normalizedJobs = pgTable(
  "normalized_jobs",
  {
    id: uuid("id").primaryKey().notNull(),
    reportRunId: uuid("report_run_id")
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerJobId: text("provider_job_id"),
    providerRequisitionId: text("provider_requisition_id"),
    jobUrl: text("job_url"),
    title: text("title").notNull(),
    department: text("department"),
    location: text("location"),
    employmentType: text("employment_type"),
    workplaceType: text("workplace_type"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    rawRecordPath: text("raw_record_path").notNull(),
    normalizedSha256: text("normalized_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("normalized_jobs_snapshot_sha_unique").on(
      table.sourceSnapshotId,
      table.normalizedSha256
    ),
    index("normalized_jobs_report_run_idx").on(table.reportRunId),
    index("normalized_jobs_source_snapshot_idx").on(table.sourceSnapshotId),
    index("normalized_jobs_provider_job_id_idx").on(table.provider, table.providerJobId),
  ]
);
