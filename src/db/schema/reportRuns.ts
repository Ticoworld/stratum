import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "@/db/schema/companies";
import { tenants } from "@/db/schema/tenants";
import { users } from "@/db/schema/users";

export const reportRuns = pgTable(
  "report_runs",
  {
    id: uuid("id").primaryKey().notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    triggerType: text("trigger_type").notNull(),
    requestedCompanyName: text("requested_company_name").notNull(),
    asOfTime: timestamp("as_of_time", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").default(1).notNull(),
    lockToken: uuid("lock_token"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("report_runs_status_created_at_idx").on(table.status, table.createdAt),
    index("report_runs_company_created_at_idx").on(table.companyId, table.createdAt),
    index("report_runs_tenant_created_at_idx").on(table.tenantId, table.createdAt),
  ]
);
