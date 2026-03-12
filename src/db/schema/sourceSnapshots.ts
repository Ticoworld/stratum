import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "@/db/schema/companies";
import { reportRuns } from "@/db/schema/reportRuns";

export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").primaryKey().notNull(),
    reportRunId: uuid("report_run_id")
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerToken: text("provider_token").notNull(),
    requestUrl: text("request_url").notNull(),
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    payloadObjectKey: text("payload_object_key"),
    payloadSha256: text("payload_sha256"),
    recordCount: integer("record_count").default(0).notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("source_snapshots_report_provider_token_unique").on(
      table.reportRunId,
      table.provider,
      table.providerToken
    ),
    index("source_snapshots_report_run_idx").on(table.reportRunId),
    index("source_snapshots_company_fetched_at_idx").on(table.companyId, table.fetchedAt),
    index("source_snapshots_status_idx").on(table.status),
  ]
);
