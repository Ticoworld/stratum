import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { claims } from "@/db/schema/claims";
import { normalizedJobs } from "@/db/schema/normalizedJobs";
import { sourceSnapshots } from "@/db/schema/sourceSnapshots";

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().notNull(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "cascade" }),
    normalizedJobId: uuid("normalized_job_id")
      .notNull()
      .references(() => normalizedJobs.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerJobId: text("provider_job_id"),
    jobUrl: text("job_url"),
    jobTitle: text("job_title").notNull(),
    department: text("department"),
    location: text("location"),
    sourcePostedAt: timestamp("source_posted_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    snapshotFetchedAt: timestamp("snapshot_fetched_at", { withTimezone: true }).notNull(),
    rawRecordPath: text("raw_record_path").notNull(),
    rawFieldPaths: jsonb("raw_field_paths").$type<string[]>().notNull(),
    evidenceSha256: text("evidence_sha256").notNull(),
    citationOrder: integer("citation_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("citations_claim_order_unique").on(table.claimId, table.citationOrder),
    index("citations_claim_idx").on(table.claimId),
    index("citations_normalized_job_idx").on(table.normalizedJobId),
    index("citations_source_snapshot_idx").on(table.sourceSnapshotId),
  ]
);
