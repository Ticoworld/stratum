import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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
  const targetInput = page.getByPlaceholder("Company name, website, or LinkedIn company URL");
  if (!(await targetInput.isVisible())) {
    await page.getByRole("button", { name: "Track company" }).click();
    await expect(targetInput).toBeVisible();
  }
}

async function resolveAndConfirmTarget(page: Page, input: string): Promise<string> {
  await ensureTargetComposerOpen(page);
  await page.getByPlaceholder("Company name, website, or LinkedIn company URL").fill(input);

  const [resolveResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists/resolve") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Find source" }).click(),
  ]);
  const resolveJson = await resolveResponse.json();
  expect(resolveJson.success).toBeTruthy();
  await expect(page.getByText("Resolution preview")).toBeVisible();

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
    page.getByRole("button", { name: "Confirm and start baseline" }).click(),
  ]);

  const createJson = await createResponse.json();
  const refreshJson = await refreshResponse.json();
  expect(createJson.success).toBeTruthy();
  expect(refreshJson.success).toBeTruthy();

  return createJson.data.entry.id as string;
}

test.describe.configure({ mode: "serial" });

test("saved brief reads like a durable artifact and keeps replay context obvious", async ({
  page,
  request,
}) => {
  const runKey = `brief-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const personas = await bootstrapPersonas(request, runKey);
  await authenticate(page, personas.ownerA);

  const watchlistName = `Brief Artifact ${runKey}`;
  const query = "Notion";
  const targetLabel = "Notion";

  await page.goto("/watchlists");
  await page.getByRole("button", { name: "New watchlist" }).click();
  await page.getByPlaceholder("Name this watchlist").fill(watchlistName);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/watchlists") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Create watchlist" }).click(),
  ]);

  await resolveAndConfirmTarget(page, query);
  await expect(page.getByText("Baseline saved", { exact: true }).first()).toBeVisible();

  const targetRow = page.locator("table").locator("tr").filter({ hasText: "Notion" }).first();
  await expect(targetRow).toBeVisible();

  const [refreshResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/analyze-unified") && response.request().method() === "POST"
    ),
    targetRow.getByRole("button", { name: "Refresh" }).click(),
  ]);
  const refreshJson = await refreshResponse.json();
  expect(refreshJson.success).toBeTruthy();
  expect(refreshJson.data.briefId).toBeTruthy();

  await page.goto(`/briefs/${refreshJson.data.briefId}`);
  await expect(page.getByRole("main").getByText("Saved brief", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: targetLabel })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Snapshot details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watchlist context" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Limits and caveats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quick links" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to watchlist" })).toBeVisible();
});
