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
  await page.getByRole("button", { name: "New" }).click();
  await page.getByLabel("Watchlist name").fill(name);

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
  const targetInput = page.getByLabel("Company name or URL");
  if (!(await targetInput.isVisible())) {
    await page.getByRole("button", { name: "Track company" }).click();
    await expect(targetInput).toBeVisible();
  }
}

async function resolveAndConfirmTarget(page: Page, query: string): Promise<string> {
  await ensureTargetComposerOpen(page);
  await page.getByLabel("Company name or URL").fill(query);

  const [resolveResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/watchlists/resolve") &&
        candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Continue" }).click(),
  ]);
  expect((await resolveResponse.json()).success).toBeTruthy();
  await expect(page.getByText("Match summary")).toBeVisible();

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
    page.locator("div.fixed.inset-0").getByRole("button", { name: "Track company" }).click(),
  ]);

  const createJson = await createResponse.json();
  expect(createJson.success).toBeTruthy();
  expect((await refreshResponse.json()).success).toBeTruthy();
  await expect(page.getByText("WATCH", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Brief", exact: true }).first()).toBeVisible();
  const entryId = createJson.data.entry.id as string;
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${createJson.data.watchlist.id}$`));
  return entryId;
}

async function resolveOnlyTarget(page: Page, query: string): Promise<void> {
  await ensureTargetComposerOpen(page);
  await page.getByLabel("Company name or URL").fill(query);

  const [resolveResponse] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/watchlists/resolve") &&
        candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Continue" }).click(),
  ]);

  const resolveJson = await resolveResponse.json();
  expect(resolveJson.success).toBeTruthy();
  await expect(page.getByText("Match summary")).toBeVisible();
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
  const drawer = page.locator("div.fixed.inset-0.z-50.flex.justify-end");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Company name or URL")).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Beta limits" })).toBeVisible();
  await expect(
    drawer.getByText(
      "Supported sources: Greenhouse, Ashby, Lever, and Workable. Other hiring sources may not be recognized."
    )
  ).toBeVisible();
  await expect(drawer.getByText("Alerts stay in Stratum's in-app inbox during beta.")).toBeVisible();
  await expect(
    drawer.getByText("If Gemini is unavailable, Stratum uses local fallback analysis and still shows a brief.")
  ).toBeVisible();
  await expect(
    drawer.getByText(
      "Track companies you care about. Stratum will add the company and run the first check automatically when a supported source is confirmed."
    )
  ).toBeVisible();
  await expect(
    drawer.getByText("Enter a company name or careers page URL to add it to this watchlist and start the first check.")
  ).toBeVisible();

  await resolveOnlyTarget(page, "Notion");
  await expect(drawer.getByRole("button", { name: "Track company" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Try another source" })).toBeVisible();

  await drawer.getByRole("button", { name: "Try another source" }).click();
  await expect(page.getByLabel("Company name or URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("resolution preview keeps confidence, unsupported paths, and baseline start explicit", async ({ page }) => {
  await assignUniqueClientIp(page);

  await createWatchlist(page, `Smoke Resolution ${randomUUID().slice(0, 8)}`);

  await resolveOnlyTarget(page, "Notion");
  await expect(page.getByText("Company", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Careers source", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Confidence", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Why this match?", { exact: true })).toBeVisible();
  const drawer = page.locator("div.fixed.inset-0");
  await expect(drawer.getByRole("button", { name: "Track company" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Try another source" })).toBeVisible();

  await drawer.getByRole("button", { name: "Try another source" }).click();
  await resolveOnlyTarget(page, fixture.homeQuery);
  await expect(
    page.getByText("Visible careers source, but it matches WORKDAY, which Stratum does not treat as a supported ATS path.")
  ).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Track company" })).toBeVisible();
  await drawer.getByRole("button", { name: "Track company" }).click();
  await expect(page.getByText("Track this company anyway?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Track anyway" })).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();

  await drawer.getByRole("button", { name: "Try another source" }).click();
  await resolveOnlyTarget(page, fixture.noMatchQuery);
  await expect(
    page.getByText("No supported ATS path was confirmed, so the match stays cautious.")
  ).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Track company" })).toBeVisible();
  await drawer.getByRole("button", { name: "Track company" }).click();
  await expect(page.getByText("Track this company anyway?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Track anyway" })).toBeVisible();
});

test("ambiguous source resolution requires an explicit candidate choice", async ({ page }) => {
  await assignUniqueClientIp(page);

  await createWatchlist(page, `Smoke Candidate ${randomUUID().slice(0, 8)}`);

  await resolveOnlyTarget(page, fixture.multiCandidateQuery);
  await expect(page.getByText("Company", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Careers source", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Confidence", { exact: true }).first()).toBeVisible();
  const drawer = page.locator("div.fixed.inset-0");
  await expect(drawer.getByRole("button", { name: "Track company" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Try another source" })).toBeVisible();

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
    drawer.getByRole("button", { name: "Track company" }).click(),
  ]);

  expect((await createResponse.json()).success).toBeTruthy();
  expect((await refreshResponse.json()).success).toBeTruthy();
  await expect(page.getByRole("link", { name: "Brief", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Broad platform and GTM hiring signal", { exact: true })).toBeVisible();
});

test("watchlists hand off cleanly to saved briefs and back again", async ({ page }) => {
  await assignUniqueClientIp(page);

  const watchlistId = await createWatchlist(page, `Smoke Brief ${randomUUID().slice(0, 8)}`);
  await resolveAndConfirmTarget(page, "Notion");

  const targetLink = page.getByRole("link", { name: "Notion" }).first();
  await expect(targetLink).toBeVisible();
  await expect(page.getByText("WATCH", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Brief", exact: true }).first()).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/watchlists/${watchlistId}/entries/[^/]+$`)),
    targetLink.click(),
  ]);
  await expect(page).toHaveURL(new RegExp(`/watchlists/${watchlistId}/entries/[^/]+$`));
  await expect(page.getByText("Current state", { exact: true })).toBeVisible();
  await expect(page.getByText("Source and trust", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest brief", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open saved brief" }).first()).toBeVisible();
  await expect(page.getByText("Recent activity", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Update frequency")).toBeVisible();

  await page.getByRole("link", { name: "Open saved brief" }).first().click();
  await expect(page).toHaveURL(/\/briefs\/[^/]+$/);
  await expect(page.getByRole("link", { name: "Back to watchlist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Executive summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why this matters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example openings from the observed board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hiring mix and geography" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Displayed proof roles/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Source and trust/i })).toBeVisible();

  await expect(page.getByRole("link", { name: "Back to watchlist" })).toBeVisible();

  await page.getByRole("link", { name: "Back to watchlist" }).click();
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${watchlistId}(?:&entryId=[^&]+)?$`));
  await expect(page.getByRole("link", { name: "Notion" }).first()).toBeVisible();
  await expect(page.getByText("WATCH", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Brief", exact: true }).first()).toBeVisible();
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
  await expect(page.getByText("Signal inbox", { exact: true })).toBeVisible();

  const targetLink = page.getByRole("link", { name: "Notion" }).first();
  await expect(targetLink).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/watchlists/${watchlistId}/entries/${entryId}$`)),
    targetLink.click(),
  ]);
  await expect(page.getByText("Current state", { exact: true })).toBeVisible();
  await expect(page.getByText("Source and trust", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent activity", { exact: true })).toBeVisible();
});

test("schedule edits stay readable and the heavy refresh control remains explicit", async ({ page }) => {
  await assignUniqueClientIp(page);

  const watchlistId = await createWatchlist(page, `Smoke Schedule ${randomUUID().slice(0, 8)}`);
  const entryId = await resolveAndConfirmTarget(page, "Notion");

  await page.goto(`/watchlists/${watchlistId}/entries/${entryId}`);
  await expect(page.getByLabel("Update frequency")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(page.getByLabel("Update frequency")).toBeVisible();

  await page.getByLabel("Update frequency").selectOption("daily");
  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${watchlistId}/entries/${entryId}`) &&
        response.request().method() === "PATCH"
    ),
    page.getByRole("button", { name: "Update schedule" }).click(),
  ]);
  const saveJson = await saveResponse.json();
  expect(saveJson.success).toBeTruthy();
  expect(saveJson.data.entry.scheduleCadence).toBe("daily");
  await expect(page.getByText("Schedule updated.")).toBeVisible();
  await expect(page.getByLabel("Update frequency")).toHaveValue("daily");
});
