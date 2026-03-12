import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { reportVersions } from "@/db/schema/reportVersions";

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().notNull(),
    reportVersionId: uuid("report_version_id")
      .notNull()
      .references(() => reportVersions.id, { onDelete: "cascade" }),
    artifactType: text("artifact_type").notNull(),
    status: text("status").notNull(),
    objectKey: text("object_key"),
    mimeType: text("mime_type"),
    byteSize: bigint("byte_size", { mode: "number" }),
    sha256: text("sha256"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("artifacts_report_version_type_unique").on(table.reportVersionId, table.artifactType),
    index("artifacts_report_version_idx").on(table.reportVersionId),
    index("artifacts_status_idx").on(table.status),
  ]
);
