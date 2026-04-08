import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import fixture from "./tests/e2e/phase10-fixture.json";

dotenv.config({ path: ".env.local" });
dotenv.config();

const e2ePort = Number(process.env.STRATUM_E2E_PORT ?? 3002);
const e2eBaseUrl = process.env.STRATUM_E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const e2ePgliteDataDir = `.tmp/playwright-pglite-${Date.now()}-${process.pid}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: `node scripts/prepare-e2e-db.mjs && npm run start -- --hostname 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 600_000,
    env: {
      ...process.env,
      STRATUM_DB_DRIVER: "pglite",
      STRATUM_PGLITE_DATA_DIR: e2ePgliteDataDir,
      STRATUM_E2E_MODE: "1",
      STRATUM_E2E_NO_MATCH_QUERY: fixture.noMatchQuery,
      STRATUM_E2E_PROVIDER_FAILURE_QUERY: fixture.providerFailureQuery,
      STRATUM_E2E_THROW_QUERY: fixture.throwErrorQuery,
      STRATUM_ENABLE_TEST_ROUTES: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
