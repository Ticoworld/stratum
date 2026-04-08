import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { phase1Env } from "@/lib/env";

const createPostgresDb = (client: ReturnType<typeof postgres>) =>
  drizzlePostgres(client, {
    schema,
  });

const createPgliteDb = (client: PGlite) =>
  drizzlePglite(client, {
    schema,
  });

type SqlClient = ReturnType<typeof postgres>;
type EmbeddedClient = PGlite;
type DatabaseClient = ReturnType<typeof createPostgresDb>;
type DriverClient = SqlClient | EmbeddedClient;

const dbDriverKind = process.env.STRATUM_DB_DRIVER === "pglite" ? "pglite" : "postgres";
const pgliteDataDir = path.resolve(
  process.env.STRATUM_PGLITE_DATA_DIR ?? path.join(process.cwd(), ".tmp", "stratum-pglite")
);

declare global {
  var __stratumSql: DriverClient | undefined;
  var __stratumDb: DatabaseClient | undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __stratumSql?: DriverClient;
  __stratumDb?: DatabaseClient;
};

function createDriverClient(): DriverClient {
  return dbDriverKind === "pglite"
    ? new PGlite(pgliteDataDir)
    : postgres(phase1Env.DATABASE_URL, {
        max: 1,
        prepare: false,
      });
}

function createDatabaseClient(client: DriverClient): DatabaseClient {
  return dbDriverKind === "pglite"
    ? (createPgliteDb(client as EmbeddedClient) as unknown as DatabaseClient)
    : createPostgresDb(client as SqlClient);
}

const shouldCacheDbClient = dbDriverKind === "pglite" || process.env.NODE_ENV !== "production";

const sql: DriverClient = shouldCacheDbClient
  ? globalForDb.__stratumSql ?? createDriverClient()
  : createDriverClient();

export const db = shouldCacheDbClient
  ? globalForDb.__stratumDb ?? createDatabaseClient(sql)
  : createDatabaseClient(sql);

if (shouldCacheDbClient) {
  globalForDb.__stratumSql = sql;
  globalForDb.__stratumDb = db;
}

export { sql };
export { dbDriverKind, pgliteDataDir };
