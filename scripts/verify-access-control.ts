import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { encode } from "@auth/core/jwt";
import { config } from "dotenv";

config();
config({ path: ".env.local" });

type Persona = {
  userId: string;
  tenantId: string;
  role: "owner" | "analyst" | "viewer";
  email: string;
  name: string;
};

type BootstrapPayload = {
  success: boolean;
  data?: {
    personas: {
      ownerA: Persona;
      analystA: Persona;
      viewerA: Persona;
      ownerB: Persona;
    };
  };
  error?: string;
};

type RouteResult<T> = {
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
  json: T | null;
};

async function main() {
  const projectRoot = process.cwd();
  const dataDir = path.resolve(
    projectRoot,
    ".tmp",
    `access-control-verify-${Date.now()}-${process.pid}`
  );
  const port = 3017;
  const baseUrl = `http://127.0.0.1:${port}`;

  process.env.STRATUM_DB_DRIVER = "pglite";
  process.env.STRATUM_PGLITE_DATA_DIR = dataDir;
  process.env.STRATUM_E2E_MODE = "1";
  process.env.STRATUM_ENABLE_TEST_ROUTES = "1";
  process.env.AUTH_TRUST_HOST = "1";

  const prepare = spawnSync(process.execPath, ["scripts/prepare-e2e-db.mjs"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (prepare.status !== 0) {
    throw new Error("Failed to prepare the verification database.");
  }

  const nextBin = path.resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  const shutdown = () => {
    if (!server.killed) {
      server.kill("SIGTERM");
    }
  };

  try {
    await waitForServer(baseUrl);

    const runKey = `access-control-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const bootstrap = await requestJson<BootstrapPayload>(`${baseUrl}/api/test/e2e/access-control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runKey }),
    });

    if (!bootstrap.ok || !bootstrap.json?.success || !bootstrap.json.data) {
      throw new Error(`Fixture bootstrap failed: ${bootstrap.text}`);
    }

    const { ownerA, analystA, viewerA, ownerB } = bootstrap.json.data.personas;
    const ownerCookie = await cookieFor(ownerA);
    const analystCookie = await cookieFor(analystA);
    const viewerCookie = await cookieFor(viewerA);
    const ownerBCookie = await cookieFor(ownerB);

    const unauthPage = await requestRaw(`${baseUrl}/watchlists`, { redirect: "manual" });
    assertRedirect(unauthPage, "/api/auth/signin");
    await assertUnauthorized(`${baseUrl}/api/watchlists`);
    await assertUnauthorized(`${baseUrl}/api/notifications`);
    await assertUnauthorized(`${baseUrl}/api/analyze-unified`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName: "Probe Corp" }),
    });
    await assertUnauthorized(`${baseUrl}/api/scheduled-refreshes/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const unauthBrief = await requestRaw(`${baseUrl}/briefs/${randomUUID()}`, {
      redirect: "manual",
    });
    assertRedirect(unauthBrief, "/api/auth/signin");

    const ownerWatchlistCreate = await requestJson<{
      success: boolean;
      data?: { watchlist: { id: string; name: string } };
    }>(`${baseUrl}/api/watchlists`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ownerCookie,
      },
      body: JSON.stringify({ name: `Access Control ${runKey}` }),
    });
    if (!ownerWatchlistCreate.ok || !ownerWatchlistCreate.json?.success || !ownerWatchlistCreate.json.data) {
      throw new Error(`Owner watchlist creation failed: ${ownerWatchlistCreate.text}`);
    }

    const ownerWatchlistId = ownerWatchlistCreate.json.data.watchlist.id;
    const ownerEntryCreate = await requestJson<{
      success: boolean;
      data?: { entry: { id: string } };
    }>(`${baseUrl}/api/watchlists/${ownerWatchlistId}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ownerCookie,
      },
      body: JSON.stringify({
        requestedQuery: "https://phase10-home.myworkdayjobs.com/en-US/careers",
      }),
    });
    if (!ownerEntryCreate.ok || !ownerEntryCreate.json?.success || !ownerEntryCreate.json.data) {
      throw new Error(`Owner watchlist entry creation failed: ${ownerEntryCreate.text}`);
    }

    const ownerEntryId = ownerEntryCreate.json.data.entry.id;

    const analystWatchlistCreate = await requestJson<{ success: boolean }>(`${baseUrl}/api/watchlists`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: analystCookie,
      },
      body: JSON.stringify({ name: `Analyst Access ${runKey}` }),
    });
    if (!analystWatchlistCreate.ok || !analystWatchlistCreate.json?.success) {
      throw new Error(`Analyst watchlist creation should succeed: ${analystWatchlistCreate.text}`);
    }

    const viewerWatchlistCreate = await requestJson<{ success: boolean; error?: string }>(
      `${baseUrl}/api/watchlists`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: viewerCookie,
        },
        body: JSON.stringify({ name: `Viewer Access ${runKey}` }),
      }
    );
    if (viewerWatchlistCreate.status !== 403) {
      throw new Error(`Viewer watchlist creation should be forbidden, got ${viewerWatchlistCreate.status}.`);
    }

    const viewerEntryCreate = await requestJson<{ success: boolean }>(
      `${baseUrl}/api/watchlists/${ownerWatchlistId}/entries`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: viewerCookie,
        },
        body: JSON.stringify({ requestedQuery: "https://example.com/viewer-probe" }),
      }
    );
    if (viewerEntryCreate.status !== 403) {
      throw new Error(`Viewer watchlist entry creation should be forbidden, got ${viewerEntryCreate.status}.`);
    }

    const ownerWatchlists = await requestJson<{
      success: boolean;
      data?: { watchlists: Array<{ id: string; name: string }> };
    }>(`${baseUrl}/api/watchlists`, {
      headers: { cookie: ownerCookie },
    });
    const ownerWatchlistNames = ownerWatchlists.json?.data?.watchlists.map((watchlist) => watchlist.name) ?? [];
    if (ownerWatchlistNames.some((name) => name.startsWith("Phase 9 Watchlist"))) {
      throw new Error("Legacy tenantless watchlists leaked into the scoped watchlist list.");
    }

    const ownerBWatchlists = await requestJson<{
      success: boolean;
      data?: { watchlists: Array<{ id: string; name: string }> };
    }>(`${baseUrl}/api/watchlists`, {
      headers: { cookie: ownerBCookie },
    });
    const ownerBWatchlistNames = ownerBWatchlists.json?.data?.watchlists.map((watchlist) => watchlist.name) ?? [];
    if (ownerBWatchlistNames.some((name) => name === `Access Control ${runKey}`)) {
      throw new Error("Cross-tenant watchlist leakage was detected.");
    }

    const crossTenantEntry = await requestJson<{ success: boolean; error?: string }>(
      `${baseUrl}/api/analyze-unified`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ownerBCookie,
        },
        body: JSON.stringify({
          companyName: "Cross-tenant probe",
          watchlistEntryId: ownerEntryId,
          forceRefresh: true,
        }),
      }
    );
    if (crossTenantEntry.status !== 404) {
      throw new Error(`Cross-tenant tracked entry access should be denied with 404, got ${crossTenantEntry.status}.`);
    }

    const firstTrackedRefresh = await requestJson<{
      success: boolean;
      data?: { briefId?: string };
    }>(`${baseUrl}/api/analyze-unified`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ownerCookie,
      },
      body: JSON.stringify({
        companyName: "https://boards.greenhouse.io/example/jobs/123",
        watchlistEntryId: ownerEntryId,
        forceRefresh: true,
      }),
    });
    if (!firstTrackedRefresh.ok || !firstTrackedRefresh.json?.success) {
      throw new Error(`First tracked refresh failed: ${firstTrackedRefresh.text}`);
    }

    const trackedRefresh = await requestJson<{
      success: boolean;
      data?: { briefId?: string };
    }>(`${baseUrl}/api/analyze-unified`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ownerCookie,
      },
      body: JSON.stringify({
        companyName: "https://phase10-home.myworkdayjobs.com/en-US/careers",
        watchlistEntryId: ownerEntryId,
        forceRefresh: true,
      }),
    });
    if (!trackedRefresh.ok || !trackedRefresh.json?.success || !trackedRefresh.json.data?.briefId) {
      throw new Error(`Tracked refresh failed: ${trackedRefresh.text}`);
    }

    const briefId = trackedRefresh.json.data.briefId ?? firstTrackedRefresh.json?.data?.briefId ?? null;
    if (!briefId) {
      throw new Error("Expected at least one brief to be created by the tracked refresh sequence.");
    }
    const ownerBrief = await requestJson<{
      success: boolean;
      data?: { id: string };
    }>(`${baseUrl}/api/briefs/${briefId}`, {
      headers: { cookie: ownerCookie },
    });
    const foreignBrief = await requestJson<{
      success: boolean;
      error?: string;
    }>(`${baseUrl}/api/briefs/${briefId}`, {
      headers: { cookie: ownerBCookie },
    });
    if (!ownerBrief.ok || !ownerBrief.json?.success || foreignBrief.status !== 404) {
      throw new Error("Brief scoping failed across tenants.");
    }

    const ownerNotifications = await requestJson<{
      success: boolean;
      data?: { counts: { totalCount: number }; notifications: Array<{ id: string }> };
    }>(`${baseUrl}/api/notifications`, {
      headers: { cookie: ownerCookie },
    });
    const notificationItems = ownerNotifications.json?.data?.notifications ?? [];
    if (!ownerNotifications.ok || !ownerNotifications.json?.success || notificationItems.length === 0) {
      throw new Error(`Expected notifications for the tracked refresh: ${ownerNotifications.text}`);
    }

    const notificationId = notificationItems[0]!.id;
    const ownerNotificationPatch = await requestJson<{ success: boolean }>(
      `${baseUrl}/api/notifications/${notificationId}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({ action: "mark_read" }),
      }
    );
    if (!ownerNotificationPatch.ok || !ownerNotificationPatch.json?.success) {
      throw new Error(`Owner notification mutation failed: ${ownerNotificationPatch.text}`);
    }

    const foreignNotificationPatch = await requestJson<{ success: boolean; error?: string }>(
      `${baseUrl}/api/notifications/${notificationId}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: ownerBCookie,
        },
        body: JSON.stringify({ action: "dismiss" }),
      }
    );
    if (foreignNotificationPatch.status !== 404) {
      throw new Error(
        `Cross-tenant notification mutation should be blocked with 404, got ${foreignNotificationPatch.status}.`
      );
    }

    const scheduledOwner = await requestJson<{ success: boolean }>(
      `${baseUrl}/api/scheduled-refreshes/run`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({ watchlistId: ownerWatchlistId, limit: 1 }),
      }
    );
    if (!scheduledOwner.ok || !scheduledOwner.json?.success) {
      throw new Error(`Owner scheduled refresh should succeed: ${scheduledOwner.text}`);
    }

    const scheduledViewer = await requestJson<{ success: boolean; error?: string }>(
      `${baseUrl}/api/scheduled-refreshes/run`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: viewerCookie,
        },
        body: JSON.stringify({ watchlistId: ownerWatchlistId, limit: 1 }),
      }
    );
    if (scheduledViewer.status !== 403) {
      throw new Error(`Viewer scheduled refresh should be forbidden, got ${scheduledViewer.status}.`);
    }

    const summary = {
      unauthenticated: "blocked",
      ownerWatchlists: ownerWatchlistNames.length,
      ownerNotifications: notificationItems.length,
      briefId,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    shutdown();
  }
}

async function cookieFor(persona: Persona): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required.");
  }

  const sessionCookieName = "authjs.session-token";
  const token = await encode({
    secret,
    salt: sessionCookieName,
    token: {
      userId: persona.userId,
      tenantId: persona.tenantId,
      role: persona.role,
      email: persona.email,
      name: persona.name,
      sub: persona.userId,
    },
  });

  return `${sessionCookieName}=${token}`;
}

async function waitForServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // Keep waiting.
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

async function requestRaw(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  return response;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<RouteResult<T>> {
  const response = await fetch(url, init);
  const text = await response.text();
  let json: T | null = null;

  if (text) {
    try {
      json = JSON.parse(text) as T;
    } catch {
      json = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    text,
    json,
  };
}

async function assertUnauthorized(url: string, init?: RequestInit): Promise<void> {
  const response = await requestJson<{ success?: boolean; error?: string }>(url, init);
  if (response.status !== 401) {
    throw new Error(`Expected 401 from ${url}, received ${response.status}.`);
  }
}

function assertRedirect(response: Response, expectedPath: string): void {
  if (![302, 303, 307, 308].includes(response.status)) {
    throw new Error(`Expected redirect, received ${response.status}.`);
  }

  const location = response.headers.get("location") ?? "";
  if (!location.includes(expectedPath)) {
    throw new Error(`Expected redirect to include ${expectedPath}, received ${location}.`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[Access Control Verification] Failed:", error);
  process.exit(1);
});
