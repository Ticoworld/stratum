import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { formatHiringPatternDisplay } from "../../src/lib/briefs/presentation";
import fixture from "./phase10-fixture.json";

type Persona = {
  userId: string;
  tenantId: string;
  role: "owner" | "analyst" | "viewer";
  email: string;
  name: string;
};

const baseURL = process.env.STRATUM_E2E_BASE_URL ?? "http://127.0.0.1:3002";
const sessionCookieName = "authjs.session-token";

async function mintSessionToken(persona: Persona): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for brief artifact verification.");
  }

  return encode({
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
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `brief-artifact-${persona.role}-${randomUUID().slice(0, 8)}`,
  });
}

async function bootstrapPersonas(request: APIRequestContext, runKey: string) {
  const bootstrap = await request.post("/api/test/e2e/access-control", {
    data: { runKey },
  });

  expect(bootstrap.ok()).toBeTruthy();
  const json = await bootstrap.json();
  expect(json.success).toBeTruthy();
  return json.data.personas as Record<string, Persona>;
}

async function ensureTargetComposerOpen(page: Page): Promise<void> {
  const targetInput = page.getByLabel("Company name or URL");
  if (!(await targetInput.isVisible())) {
    await page.getByRole("button", { name: "Track company" }).click();
    await expect(targetInput).toBeVisible();
  }
}

async function resolveAndConfirmTarget(page: Page, input: string): Promise<string> {
  await ensureTargetComposerOpen(page);
  const targetInput = page.getByLabel("Company name or URL");
  await targetInput.fill(input);

  const [resolveResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists/resolve") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Continue" }).click(),
  ]);
  const resolveJson = await resolveResponse.json();
  expect(resolveJson.success).toBeTruthy();
  await expect(page.getByText("Match summary")).toBeVisible();

  const [createResponse, refreshResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/entries") &&
        response.request().method() === "POST"
    ),
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/analyze-unified") &&
        response.request().method() === "POST"
    ),
    page.locator("div.fixed.inset-0").getByRole("button", { name: "Track company" }).click(),
  ]);

  const createJson = await createResponse.json();
  const refreshJson = await refreshResponse.json();
  expect(createJson.success).toBeTruthy();
  expect(refreshJson.success).toBeTruthy();

  return createJson.data.entry.id as string;
}

test.describe.configure({ mode: "serial" });

test.describe("hiring pattern display labels", () => {
  test("Ramp-like hiring mix displays Sales-led, not Broad", () => {
    expect(formatHiringPatternDisplay([["Sales", 50], ["Engineering", 32], ["Operations", 12]])).toBe("Sales-led");
  });

  test("Notion-like hiring mix displays Sales-led, not Broad", () => {
    expect(formatHiringPatternDisplay([["Sales", 70], ["Engineering", 24], ["Product", 8]])).toBe("Sales-led");
  });

  test("close hiring mix displays Mixed", () => {
    expect(formatHiringPatternDisplay([["Sales", 25], ["Engineering", 24], ["Product", 12]])).toBe("Mixed");
  });
});

test("saved brief reads like a durable artifact and keeps replay context obvious", async ({
  page,
  request,
}) => {
  const runKey = `brief-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const personas = await bootstrapPersonas(request, runKey);
  await authenticate(page, personas.ownerA);

  const watchlistName = `Brief Artifact ${runKey}`;
  const query = fixture.multiCandidateQuery;
  const targetLabel = "Notion";

  await page.goto("/watchlists");
  await page.locator("aside").getByRole("button", { name: "New" }).click();
  await page.getByLabel("Watchlist name").fill(watchlistName);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/watchlists") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Create watchlist" }).click(),
  ]);

  await resolveAndConfirmTarget(page, query);

  const latestBriefLink = page.getByRole("link", { name: "Brief", exact: true }).first();
  await expect(latestBriefLink).toBeVisible();
  await latestBriefLink.click();
  await expect(page.getByText("saved brief", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: targetLabel })).toBeVisible();
  const hiringPatternChip = page
    .locator("header")
    .locator("div")
    .filter({ has: page.getByText("Hiring pattern", { exact: true }) })
    .first();
  await expect(hiringPatternChip).toContainText("Sales-led");
  await expect(hiringPatternChip).not.toContainText("Broad");
  await expect(page.getByText("Worth watching")).toHaveCount(0);
  await expect(page.getByText(/visible roles span/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Executive summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why this matters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example openings from the observed board" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hiring mix and geography" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example jobs" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /Source and trust/i })).toBeVisible();
  const sourceTrustSection = page.locator("section").filter({ hasText: "Source and trust" });
  await expect(sourceTrustSection).toContainText("Source used");
  await expect(sourceTrustSection).toContainText("Date");
  await expect(sourceTrustSection).toContainText("Source limit");
  await expect(sourceTrustSection).toContainText("Ashby only. Not full company coverage.");
  await expect(sourceTrustSection).not.toContainText("Read strength");
  await expect(sourceTrustSection).not.toContainText("matched ATS token");
  await expect(sourceTrustSection).not.toContainText("partially grounded");
  // Plain-language guards: these old labels must not appear
  await expect(page.getByText("Evidence Quality")).not.toBeVisible();
  await expect(page.getByText("Signal Clarity")).not.toBeVisible();
  await expect(page.getByText("Cautious read")).not.toBeVisible();
  await expect(page.getByText("public strategic posts")).not.toBeVisible();
  await expect(page.getByText("Displayed proof roles")).not.toBeVisible();
  await expect(page.getByText("Advanced provider diagnostics")).not.toBeVisible();
  await expect(
    page.getByText("AI enrichment was unavailable for this brief. Stratum used basic analysis instead.")
  ).toBeVisible();
  const providerDiagnosticsToggle = page
    .locator("details")
    .filter({ hasText: /Scan details for support/i })
    .locator("summary");
  await expect(providerDiagnosticsToggle).toBeVisible();
  await providerDiagnosticsToggle.click();
  const providerDiagnosticsSection = page
    .locator("details")
    .filter({ hasText: /Scan details for support/i });
  await expect(
    providerDiagnosticsSection.getByText("Shows source checks and scan details. Share with support if something looks wrong.")
  ).toBeVisible();
  await expect(providerDiagnosticsSection).toContainText("Jobs found");
  await expect(providerDiagnosticsSection).toContainText("Used for this brief");
  await expect(providerDiagnosticsSection).toContainText("Retries");
  await expect(providerDiagnosticsSection).toContainText("Scan time");
  await expect(providerDiagnosticsSection).not.toContainText("jobsCount");
  await expect(providerDiagnosticsSection).not.toContainText("usedForBrief");
  await expect(providerDiagnosticsSection).toContainText("Skipped. Ashby already matched.");
  const skippedProvider = providerDiagnosticsSection
    .locator("article")
    .filter({ hasText: "Status: Skipped" })
    .first();
  await expect(skippedProvider).not.toContainText("Scan attempts");
  await expect(page.getByRole("link", { name: "Back to watchlist" })).toBeVisible();
});
