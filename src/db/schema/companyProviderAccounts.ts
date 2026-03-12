import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "@/db/schema/companies";

export const companyProviderAccounts = pgTable(
  "company_provider_accounts",
  {
    id: uuid("id").primaryKey().notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerToken: text("provider_token").notNull(),
    status: text("status").notNull(),
    resolutionSource: text("resolution_source").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("company_provider_accounts_company_provider_token_unique").on(
      table.companyId,
      table.provider,
      table.providerToken
    ),
    index("company_provider_accounts_company_provider_idx").on(
      table.companyId,
      table.provider
    ),
    index("company_provider_accounts_provider_token_idx").on(
      table.provider,
      table.providerToken
    ),
  ]
);
