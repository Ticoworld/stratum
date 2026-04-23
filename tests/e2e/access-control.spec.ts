import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test, type PlaywrightTestArgs } from "@playwright/test";
import phase10Fixture from "./phase10-fixture.json";

type Persona = {
  userId: string;
  tenantId: string;
  role: "owner" | "analyst" | "viewer";
  email: string;
  name: string;
};

const sessionCookieName = "authjs.session-token";
const sessionSalt = sessionCookieName;
const baseURL =
  process.env.STRATUM_E2E_BASE_URL ?? `http://127.0.0.1:${process.env.STRATUM_E2E_PORT ?? 3002}`;
const runKey = `access-${Date.now()}-${randomUUID().slice(0, 8)}`;

function buildCookieValue(token: string): string {
  return `${sessionCookieName}=${token}`;
}

async function mintSessionCookie(persona: Persona): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for access-control verification.");
  }

  const token = await encode({
    secret,
    salt: sessionSalt,
    token: {
      userId: persona.userId,
      tenantId: persona.tenantId,
      role: persona.role,
      email: persona.email,
      name: persona.name,
      sub: persona.userId,
    },
  });

  return buildCookieValue(token);
}

async function makeAuthedRequest(
  playwright: PlaywrightTestArgs["playwright"],
  persona: Persona
) {
  const cookie = await mintSessionCookie(persona);
  return playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: {
      cookie,
      "x-forwarded-for": `access-${persona.role}-${randomUUID().slice(0, 8)}`,
    },
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const bootstrap = await request.post("/api/test/e2e/bootstrap", {
    data: { runKey: `phase10-${runKey}` },
  });
  expect(bootstrap.ok()).toBeTruthy();
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.success).toBeTruthy();

  const accessControl = await request.post("/api/test/e2e/access-control", {
    data: { runKey },
  });
  expect(accessControl.ok()).toBeTruthy();
  const accessJson = await accessControl.json();
  expect(accessJson.success).toBeTruthy();
});

test("product surfaces block unauthenticated access", async ({ page, request }) => {
  const apiResponse = await request.get("/api/watchlists");
  expect(apiResponse.status()).toBe(401);
  expect((await request.get("/api/notifications")).status()).toBe(401);
  expect((await request.get("/api/briefs/00000000-0000-0000-0000-000000000000")).status()).toBe(401);
  expect(
    (await request.post("/api/analyze-unified", { data: { companyName: "Example" } })).status()
  ).toBe(401);

  await page.goto("/watchlists");
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
});

test("tenant-scoped access and role permissions stay bounded", async ({ playwright, request }) => {
  const accessControlResponse = await request.post("/api/test/e2e/access-control", {
    data: { runKey: `${runKey}-matrix` },
  });
  expect(accessControlResponse.ok()).toBeTruthy();
  const accessControlJson = await accessControlResponse.json();
  const personas = accessControlJson.data.personas as Record<string, Persona>;

  const ownerA = personas.ownerA;
  const analystA = personas.analystA;
  const viewerA = personas.viewerA;
  const ownerB = personas.ownerB;

  const ownerARequest = await makeAuthedRequest(playwright, ownerA);
  const analystARequest = await makeAuthedRequest(playwright, analystA);
  const viewerARequest = await makeAuthedRequest(playwright, viewerA);
  const ownerBRequest = await makeAuthedRequest(playwright, ownerB);

  const ownerAWatchlistCreate = await ownerARequest.post("/api/watchlists", {
    data: { name: `Owner A Watchlist ${randomUUID().slice(0, 8)}` },
  });
  expect(ownerAWatchlistCreate.ok()).toBeTruthy();
  const ownerAWatchlistJson = await ownerAWatchlistCreate.json();
  const ownerAWatchlistId = ownerAWatchlistJson.data.watchlist.id as string;

  const ownerAEntryCreate = await ownerARequest.post(`/api/watchlists/${ownerAWatchlistId}/entries`, {
    data: { requestedQuery: phase10Fixture.homeQuery },
  });
  expect(ownerAEntryCreate.ok()).toBeTruthy();
  const ownerAEntryJson = await ownerAEntryCreate.json();
  const ownerAEntryId = ownerAEntryJson.data.entry.id as string;

  const ownerAAnalyze = await ownerARequest.post("/api/analyze-unified", {
    data: {
      companyName: phase10Fixture.throwErrorQuery,
      watchlistEntryId: ownerAEntryId,
      forceRefresh: true,
    },
  });
  expect(ownerAAnalyze.status()).toBe(500);

  const ownerAInbox = await ownerARequest.get("/api/notifications?status=all");
  expect(ownerAInbox.ok()).toBeTruthy();
  const ownerAInboxJson = await ownerAInbox.json();
  expect(ownerAInboxJson.data.notifications.length).toBeGreaterThan(0);
  const ownerANotificationId = ownerAInboxJson.data.notifications[0].id as string;

  const viewerCreateWatchlist = await viewerARequest.post("/api/watchlists", {
    data: { name: `Viewer A Watchlist ${randomUUID().slice(0, 8)}` },
  });
  expect(viewerCreateWatchlist.status()).toBe(403);

  const viewerAnalyze = await viewerARequest.post("/api/analyze-unified", {
    data: {
      companyName: phase10Fixture.homeQuery,
      watchlistEntryId: ownerAEntryId,
      forceRefresh: true,
    },
  });
  expect(viewerAnalyze.status()).toBe(403);

  const analystCreateWatchlist = await analystARequest.post("/api/watchlists", {
    data: { name: `Analyst A Watchlist ${randomUUID().slice(0, 8)}` },
  });
  expect(analystCreateWatchlist.ok()).toBeTruthy();

  const ownerBWatchlistCreate = await ownerBRequest.post("/api/watchlists", {
    data: { name: `Owner B Watchlist ${randomUUID().slice(0, 8)}` },
  });
  expect(ownerBWatchlistCreate.ok()).toBeTruthy();
  const ownerBWatchlistJson = await ownerBWatchlistCreate.json();
  const ownerBWatchlistId = ownerBWatchlistJson.data.watchlist.id as string;

  const ownerBEntryCreate = await ownerBRequest.post(`/api/watchlists/${ownerBWatchlistId}/entries`, {
    data: { requestedQuery: phase10Fixture.homeQuery },
  });
  expect(ownerBEntryCreate.ok()).toBeTruthy();
  const ownerBEntryJson = await ownerBEntryCreate.json();
  const ownerBEntryId = ownerBEntryJson.data.entry.id as string;

  const ownerBAnalyze = await ownerBRequest.post("/api/analyze-unified", {
    data: {
      companyName: phase10Fixture.homeQuery,
      watchlistEntryId: ownerBEntryId,
      forceRefresh: true,
    },
  });
  expect(ownerBAnalyze.ok()).toBeTruthy();

  const ownerBBriefResponse = await ownerBRequest.get(`/api/briefs/${randomUUID()}`);
  expect(ownerBBriefResponse.status()).toBe(404);

  const ownerAEntryDetailFromB = await ownerARequest.get(
    `/api/watchlists/${ownerBWatchlistId}/entries/${ownerBEntryId}`
  );
  expect(ownerAEntryDetailFromB.status()).toBe(404);

  const ownerANotificationPatchFromB = await ownerARequest.patch(
    `/api/notifications/${ownerANotificationId}`,
    {
      data: { action: "dismiss" },
    }
  );
  expect(ownerANotificationPatchFromB.ok()).toBeTruthy();

  const ownerBNotificationPatchFromA = await ownerBRequest.patch(
    `/api/notifications/${ownerANotificationId}`,
    {
      data: { action: "dismiss" },
    }
  );
  expect(ownerBNotificationPatchFromA.status()).toBe(404);
});

test("legacy recovery stays bounded while old tenantless fixtures remain hidden", async ({ playwright, request }) => {
  const accessControlResponse = await request.post("/api/test/e2e/access-control", {
    data: { runKey: `${runKey}-legacy` },
  });
  expect(accessControlResponse.ok()).toBeTruthy();
  const accessControlJson = await accessControlResponse.json();
  const ownerA = (accessControlJson.data.personas as Record<string, Persona>).ownerA;
  const ownerARequest = await makeAuthedRequest(playwright, ownerA);

  const watchlistsResponse = await ownerARequest.get("/api/watchlists");
  expect(watchlistsResponse.ok()).toBeTruthy();
  const watchlistsJson = await watchlistsResponse.json();
  const watchlistNames = (watchlistsJson.data.watchlists as Array<{ name: string }>).map(
    (watchlist) => watchlist.name
  );

  expect(watchlistNames).not.toContain("Phase 9 Watchlist");
});
