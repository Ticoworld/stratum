import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "@/db/schema/tenants";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    canonicalName: text("canonical_name").notNull(),
    websiteDomain: text("website_domain"),
    resolutionStatus: text("resolution_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("companies_tenant_canonical_name_unique").on(
      table.tenantId,
      table.canonicalName
    ),
    index("companies_tenant_display_name_idx").on(table.tenantId, table.displayName),
    index("companies_tenant_updated_at_idx").on(table.tenantId, table.updatedAt),
  ]
);
