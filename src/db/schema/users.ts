import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    authProvider: text("auth_provider").notNull(),
    externalSubject: text("external_subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_provider_subject_unique").on(
      table.authProvider,
      table.externalSubject
    ),
  ]
);
