import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test, type Page } from "@playwright/test";
type Persona = {
  userId: string;
  tenantId: string;
  role: "owner" | "analyst" | "viewer";
  email: string;
  name: string;
};

import fixture from "./phase10-fixture.json";

const { throwErrorQuery } = fixture;

const baseURL = process.env.STRATUM_E2E_BASE_URL ?? "http://127.0.0.1:3002";
const sessionCookieName = "authjs.session-token";
const sessionSalt = sessionCookieName;
const runKey = `workflow-${Date.now()}-${randomUUID().slice(0, 8)}`;

let ownerPersona: Persona | null = null;

async function mintSessionToken(persona: Persona): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for workflow verification.");
  }

  return encode({
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
}

async function authenticate(page: Page, persona: Persona): Promise<void> {
  const token = await mintSessionToken(persona);
  await page.context().addCookies([
    {
      name: sessionCookieName,
      value: token,
      url: baseURL,
    },
  ]);
}

async function assignUniqueClientIp(page: Page): Promise<void> {
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `e2e-${randomUUID().slice(0, 8)}`,
  });
}

async function createWatchlist(page: Page, name: string): Promise<string> {
  await page.goto("/watchlists");
  await page.getByRole("button", { name: "New watchlist" }).click();
  await page.getByPlaceholder("Name this watchlist").fill(name);

  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/watchlists") &&
        !candidate.url().includes("/entries") &&
        candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Create watchlist" }).click(),
  ]);

  const json = await response.json();
  expect(json.success).toBeTruthy();
  const watchlistId = json.data.watchlist.id as string;
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${watchlistId}$`));
  return watchlistId;
}

async function ensureTargetComposerOpen(page: Page): Promise<void> {
  const targetInput = page.getByPlaceholder("Company name, website, or LinkedIn company URL");
  if (!(await targetInput.isVisible())) {
    await page.getByRole("button", { name: "Track company" }).click();
    await expect(targetInput).toBeVisible();
  }
}

async function resolveAndConfirmTarget(page: Page, query: string): Promise<string> {
  await ensureTargetComposerOpen(page);
  await page.getByPlaceholder("Company name, website, or LinkedIn company URL").fill(query);

  const [resolveResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/watchlists/resolve") &&
        candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Find source" }).click(),
  ]);
  expect((await resolveResponse.json()).success).toBeTruthy();
  await expect(page.getByText("Resolution preview")).toBeVisible();

  const [createResponse, refreshResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/entries") &&
        candidate.request().method() === "POST"
    ),
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/analyze-unified") &&
        candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Confirm and start baseline" }).click(),
  ]);

  const createJson = await createResponse.json();
  expect(createJson.success).toBeTruthy();
  expect((await refreshResponse.json()).success).toBeTruthy();
  const entryId = createJson.data.entry.id as string;
  await expect(page).toHaveURL(
    new RegExp(`/watchlists\\?watchlistId=${createJson.data.watchlist.id}&entryId=${entryId}$`)
  );
  return entryId;
}

async function resolveOnlyTarget(page: Page, query: string): Promise<void> {
  await ensureTargetComposerOpen(page);
  await page.getByPlaceholder("Company name, website, or LinkedIn company URL").fill(query);

  const [resolveResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/watchlists/resolve") &&
        candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Find source" }).click(),
  ]);

  const resolveJson = await resolveResponse.json();
  expect(resolveJson.success).toBeTruthy();
  await expect(page.getByText("Resolution preview")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const bootstrap = await request.post("/api/test/e2e/bootstrap", {
    data: { runKey },
  });
  expect(bootstrap.ok()).toBeTruthy();
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.success).toBeTruthy();

  const accessControl = await request.post("/api/test/e2e/access-control", {
    data: { runKey: `${runKey}-workflow-auth` },
  });
  expect(accessControl.ok()).toBeTruthy();
  const accessJson = await accessControl.json();
  expect(accessJson.success).toBeTruthy();

  ownerPersona = accessJson.data.personas.ownerA as Persona;
});

test.beforeEach(async ({ page }) => {
  if (!ownerPersona) {
    throw new Error("Owner persona was not initialized.");
  }

  await authenticate(page, ownerPersona);
});

test("company-first intake keeps manual ATS paste clearly secondary", async ({ page }) => {
  await assignUniqueClientIp(page);

  await page.goto("/watchlists");
  await page.getByRole("button", { name: "Track company" }).click();
  await expect(page.getByPlaceholder("Company name, website, or LinkedIn company URL")).toBeVisible();
  await expect(page.getByText("company name, website, or LinkedIn company URL")).toBeVisible();
  await expect(page.getByText("Stratum resolves the likely hiring source before tracking starts.")).toBeVisible();

  await page.getByRole("button", { name: "I already know the source" }).click();
  await expect(page.getByPlaceholder("Paste ATS or careers URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resolve manual source" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Company first" })).toBeVisible();
});

test("resolution preview keeps confidence, unsupported paths, and baseline start explicit", async ({ page }) => {
  await assignUniqueClientIp(page);

  await createWatchlist(page, `Smoke Resolution ${randomUUID().slice(0, 8)}`);

  await resolveOnlyTarget(page, "Notion");
  await expect(page.getByText("Company", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Likely source", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("ATS/provider", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Confidence", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Status", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm and start baseline" })).toBeVisible();
  await expect(page.getByText("Sources checked")).toBeVisible();
  await expect(page.getByText("What happens next")).toBeVisible();

  await page.getByRole("button", { name: "Edit input" }).click();
  await resolveOnlyTarget(page, fixture.homeQuery);
  await expect(page.getByText("Unsupported", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Workday", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Track unsupported source" })).toBeVisible();
  await expect(page.getByText("The source is visible, but Stratum only treats it as a limited unsupported target.")).toBeVisible();

  await page.getByRole("button", { name: "Edit input" }).click();
  await resolveOnlyTarget(page, fixture.noMatchQuery);
  await expect(page.getByText("Low confidence", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unresolved", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Use manual source" })).toBeVisible();
  await expect(page.getByText("Refine the company or switch to the manual ATS/careers URL fallback.")).toBeVisible();
});

test("ambiguous source resolution requires an explicit candidate choice", async ({ page }) => {
  await assignUniqueClientIp(page);

  await createWatchlist(page, `Smoke Candidate ${randomUUID().slice(0, 8)}`);

  await resolveOnlyTarget(page, fixture.multiCandidateQuery);
  await expect(page.getByText("Choose a source", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a source to continue" })).toBeDisabled();

  await page.getByRole("button", { name: "Choose ASHBY source for Notion" }).click();
  await expect(page.getByRole("button", { name: "Confirm and start baseline" })).toBeVisible();

  const [createResponse, refreshResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/entries") &&
        candidate.request().method() === "POST"
    ),
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/analyze-unified") &&
        candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Confirm and start baseline" }).click(),
  ]);

  expect((await createResponse.json()).success).toBeTruthy();
  expect((await refreshResponse.json()).success).toBeTruthy();
  await expect(page.getByText("Baseline saved", { exact: true }).first()).toBeVisible();
});

test("watchlists hand off cleanly to saved briefs and back again", async ({ page }) => {
  await assignUniqueClientIp(page);

  const watchlistId = await createWatchlist(page, `Smoke Brief ${randomUUID().slice(0, 8)}`);
  await resolveAndConfirmTarget(page, "Notion");

  const targetRow = page.locator("table tr").filter({ hasText: "Notion" }).first();
  await expect(targetRow).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Current state" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Source grounding" })).toBeVisible();

  const [refreshResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/analyze-unified") && response.request().method() === "POST"
    ),
    targetRow.getByRole("button", { name: "Refresh" }).click(),
  ]);
  const refreshJson = await refreshResponse.json();
  expect(refreshJson.success).toBeTruthy();
  expect(refreshJson.data.briefId).toBeTruthy();

  const latestBriefLink = targetRow.getByRole("link", { name: "Latest brief", exact: true });
  await expect(latestBriefLink).toBeVisible();

  await latestBriefLink.click();
  await expect(page).toHaveURL(/\/briefs\/[^/]+$/);
  await expect(page.getByRole("main").getByText("Saved brief", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Snapshot details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watchlist context" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quick links" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to watchlist" })).toBeVisible();

  await page.getByRole("link", { name: "Back to watchlist" }).click();
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${watchlistId}(?:&entryId=[^&]+)?$`));
  await expect(page.locator("table").getByText("Notion", { exact: true })).toHaveCount(1);
  await expect(page.locator("table").getByText("Latest brief", { exact: true })).toHaveCount(1);
});

test("inbox triage stays linked to the tracked target and watchlist context", async ({ page }) => {
  await assignUniqueClientIp(page);

  const watchlistId = await createWatchlist(page, `Smoke Inbox ${randomUUID().slice(0, 8)}`);
  const entryId = await resolveAndConfirmTarget(page, "Notion");

  const failureResponse = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": `e2e-${randomUUID().slice(0, 8)}`,
    },
    data: {
      companyName: throwErrorQuery,
      watchlistEntryId: entryId,
      forceRefresh: true,
    },
  });
  expect(failureResponse.status()).toBe(500);

  await page.goto("/notifications?status=all");
  await expect(page.getByRole("heading", { name: "Meaningful change queue" })).toBeVisible();

  const failureCard = page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." }).first();
  await expect(failureCard).toBeVisible();
  await expect(failureCard.getByText("Unread", { exact: true })).toBeVisible();
  await expect(failureCard.getByRole("link", { name: "Inspect target" })).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/watchlists\\?watchlistId=${watchlistId}&entryId=${entryId}$`)),
    failureCard.getByRole("link", { name: "Inspect target" }).click(),
  ]);
  await expect(page.getByRole("columnheader", { name: "Current state" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Source grounding" })).toBeVisible();
  await expect(page.getByText("Recent activity", { exact: true })).toBeVisible();
});

test("schedule edits stay readable and the heavy refresh control remains explicit", async ({ page }) => {
  await assignUniqueClientIp(page);

  const watchlistId = await createWatchlist(page, `Smoke Schedule ${randomUUID().slice(0, 8)}`);
  const entryId = await resolveAndConfirmTarget(page, "Notion");

  await page.goto(`/watchlists?watchlistId=${watchlistId}&entryId=${entryId}`);
  await expect(page.getByText("Schedule and actions", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeVisible();

  await page.locator("select").first().selectOption("daily");
  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${watchlistId}/entries/${entryId}`) &&
        response.request().method() === "PATCH"
    ),
    page.getByRole("button", { name: "Save schedule" }).click(),
  ]);
  const saveJson = await saveResponse.json();
  expect(saveJson.success).toBeTruthy();
  expect(saveJson.data.entry.scheduleCadence).toBe("daily");
  await expect(page.getByText("Scheduled refresh set to daily.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run due refreshes" })).toBeVisible();
});
