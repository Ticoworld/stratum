import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

async function main() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
  const configuredDataDir = process.env.STRATUM_PGLITE_DATA_DIR?.trim();
  const dataDir = path.resolve(
    projectRoot,
    configuredDataDir || path.join(".tmp", "playwright-pglite")
  );

  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  const client = new PGlite(dataDir);
  await client.waitReady;

  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.join(projectRoot, "src", "db", "migrations"),
  });

  await client.close();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[E2E DB] Failed to prepare local database:", error);
    process.exit(1);
  });
