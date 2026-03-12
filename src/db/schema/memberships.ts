import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "@/db/schema/tenants";
import { users } from "@/db/schema/users";

export const memberships = pgTable(
  "memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.userId],
      name: "memberships_pk",
    }),
  ]
);
