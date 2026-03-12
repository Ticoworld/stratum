import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { phase1Env } from "@/lib/env";

const createDb = (client: ReturnType<typeof postgres>) =>
  drizzle(client, {
    schema,
  });

type SqlClient = ReturnType<typeof postgres>;
type DatabaseClient = ReturnType<typeof createDb>;

declare global {
  var __stratumSql: SqlClient | undefined;
  var __stratumDb: DatabaseClient | undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __stratumSql?: SqlClient;
  __stratumDb?: DatabaseClient;
};

const sql =
  globalForDb.__stratumSql ??
  postgres(phase1Env.DATABASE_URL, {
    max: 1,
    prepare: false,
  });

export const db = globalForDb.__stratumDb ?? createDb(sql);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__stratumSql = sql;
  globalForDb.__stratumDb = db;
}

export { sql };
