import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerName: text("worker_name").primaryKey().notNull(),
  status: text("status").notNull(),
  hostname: text("hostname"),
  pid: integer("pid"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
