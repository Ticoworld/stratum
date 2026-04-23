import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
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
const sessionSalt = sessionCookieName;

function makeRunKey(): string {
  return `mutation-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function mintSessionToken(persona: Persona): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for mutation verification.");
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

  return token;
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
    "x-forwarded-for": `mutation-${persona.role}-${randomUUID().slice(0, 8)}`,
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

  const watchlistId = createJson.data.watchlist.id as string;
  const entryId = (createJson.data.entry.id as string) ?? "";
  expect(entryId).toBeTruthy();
  await expect(page).toHaveURL(
    new RegExp(`/watchlists\\?watchlistId=${watchlistId}&entryId=${entryId}$`)
  );
  return entryId;
}

async function delayFirstMatchingPostResponse(
  page: Page,
  urlPart: string,
  delayMs: number
): Promise<void> {
  let delayed = false;
  await page.route(`**${urlPart}`, async (route) => {
    if (
      delayed ||
      route.request().method() !== "POST" ||
      !route.request().url().includes(urlPart)
    ) {
      await route.continue();
      return;
    }

    delayed = true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

test.describe.configure({ mode: "serial" });

test("watchlist reconciliation stays aligned across repeated add, schedule, remove, and re-add", async ({
  page,
  request,
}) => {
  const runKey = makeRunKey();
  const personas = await bootstrapPersonas(request, runKey);
  await authenticate(page, personas.ownerA);

  const query = "Notion";
  const watchlistName = `Consistency Watchlist ${runKey}`;

  await page.goto("/watchlists");
  await page.getByRole("button", { name: "New watchlist" }).click();
  await page.getByPlaceholder("Name this watchlist").fill(watchlistName);
  const [createResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/watchlists") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Create watchlist" }).click(),
  ]);
  const createWatchlistJson = await createResponse.json();
  const watchlistId = createWatchlistJson.data.watchlist.id as string;
  expect(watchlistId).toBeTruthy();

  await expect(page.getByRole("heading", { name: watchlistName }).first()).toBeVisible();

  await resolveAndConfirmTarget(page, query);

  await expect(page.getByText("1 tracked", { exact: true })).toBeVisible();
  await expect(page.getByText("Notion", { exact: true }).first()).toBeVisible();
  await expect(page.locator("aside").getByRole("heading", { name: "Notion" })).toBeVisible();
  await expect(page.getByText("1 target", { exact: true })).toBeVisible();
  await expect(page.locator("aside").getByRole("heading", { name: "Notion" })).toBeVisible();

  const scheduleSelect = page.locator("aside select");
  const [saveDailyResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/`) && response.request().method() === "PATCH"
    ),
    scheduleSelect.selectOption("daily").then(() =>
      page.getByRole("button", { name: "Save schedule" }).click()
    ),
  ]);
  expect((await saveDailyResponse.json()).success).toBeTruthy();
  await expect(scheduleSelect).toHaveValue("daily");

  const [saveOffResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/`) && response.request().method() === "PATCH"
    ),
    scheduleSelect.selectOption("off").then(() =>
      page.getByRole("button", { name: "Save schedule" }).click()
    ),
  ]);
  expect((await saveOffResponse.json()).success).toBeTruthy();
  await expect(scheduleSelect).toHaveValue("off");

  const [removeResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/entries/") && response.request().method() === "DELETE"
    ),
    page.getByRole("button", { name: "Remove" }).click(),
  ]);
  expect((await removeResponse.json()).success).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${watchlistId}$`));
  await expect(page.getByText("Tracked company removed from watchlist.")).toBeVisible();
  await expect(page.locator("table").getByText("Notion", { exact: true })).toHaveCount(0);
  await expect(page.locator("aside").getByText("Select a tracked target.")).toBeVisible();
  const trackedStat = page.locator("header").locator("div").filter({
    has: page.getByText("Tracked", { exact: true }),
  }).first();
  await expect(trackedStat).toContainText("Tracked");
  await expect(trackedStat).toContainText("0");

  await resolveAndConfirmTarget(page, query);

  await expect(page.getByText("1 tracked", { exact: true })).toBeVisible();
  await expect(page.locator("table").getByText("Notion", { exact: true })).toHaveCount(1);
  await expect(page.locator("aside").getByRole("heading", { name: "Notion" })).toBeVisible();
});

test("notification reconciliation stays aligned across read, unread, dismiss, and repeat transitions", async ({
  page,
  request,
}) => {
  const runKey = makeRunKey();
  const personas = await bootstrapPersonas(request, runKey);
  await authenticate(page, personas.ownerA);

  const query = "Notion";
  const watchlistName = `Inbox Consistency ${runKey}`;

  await page.goto("/watchlists");
  await page.getByRole("button", { name: "New watchlist" }).click();
  await page.getByPlaceholder("Name this watchlist").fill(watchlistName);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/watchlists") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Create watchlist" }).click(),
  ]);

  const entryId = await resolveAndConfirmTarget(page, query);

  const failureResponse = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": `e2e-${randomUUID().slice(0, 8)}`,
    },
    data: {
      companyName: fixture.throwErrorQuery,
      watchlistEntryId: entryId,
      forceRefresh: true,
    },
  });
  expect(failureResponse.status()).toBe(500);

  await page.goto("/notifications?status=all");
  const notificationRow = page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." }).first();
  await expect(notificationRow).toBeVisible();
  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();
  await expect(page.getByText("0 reviewed", { exact: true })).toBeVisible();
  await expect(page.getByText("0 dismissed", { exact: true })).toBeVisible();

  const [markReadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/notifications/`) && response.request().method() === "PATCH"
    ),
    notificationRow.getByRole("button", { name: "Mark read" }).click(),
  ]);
  expect((await markReadResponse.json()).success).toBeTruthy();
  await expect(page.getByText("0 unread", { exact: true })).toBeVisible();
  await expect(page.getByText("1 reviewed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark unread" })).toBeVisible();

  const [markUnreadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/notifications/`) && response.request().method() === "PATCH"
    ),
    notificationRow.getByRole("button", { name: "Mark unread" }).click(),
  ]);
  expect((await markUnreadResponse.json()).success).toBeTruthy();
  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();
  await expect(page.getByText("0 reviewed", { exact: true })).toBeVisible();

  const [dismissResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/notifications/`) && response.request().method() === "PATCH"
    ),
    notificationRow.getByRole("button", { name: "Dismiss" }).click(),
  ]);
  expect((await dismissResponse.json()).success).toBeTruthy();
  await expect(page.getByText("0 unread", { exact: true })).toBeVisible();
  await expect(page.getByText("0 reviewed", { exact: true })).toBeVisible();
  await expect(page.getByText("1 dismissed", { exact: true })).toBeVisible();

  await page.goto("/notifications?status=dismissed");
  const dismissedRow = page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." }).first();
  await expect(dismissedRow).toBeVisible();
  await expect(dismissedRow.getByText("Dismissed", { exact: true })).toBeVisible();

  const [restoreUnreadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/notifications/`) && response.request().method() === "PATCH"
    ),
    dismissedRow.getByRole("button", { name: "Mark unread" }).click(),
  ]);
  expect((await restoreUnreadResponse.json()).success).toBeTruthy();

  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();
  await expect(page.getByText("0 dismissed", { exact: true })).toBeVisible();
  await page.goto("/notifications?status=unread");
  await expect(page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." })).toHaveCount(1);
  await expect(page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." }).first()).toBeVisible();
});

test("heavy refresh flows keep context visible while the full refresh runs", async ({
  page,
  request,
}) => {
  const runKey = makeRunKey();
  const personas = await bootstrapPersonas(request, runKey);
  await authenticate(page, personas.ownerA);

  const watchlistName = `Heavy Refresh ${runKey}`;
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

  const targetRow = page.locator("table").locator("tr").filter({ hasText: "Notion" }).first();
  await expect(targetRow).toBeVisible();
  await expect(page.locator("aside").getByRole("heading", { name: targetLabel })).toBeVisible();

  await delayFirstMatchingPostResponse(page, "/api/analyze-unified", 600);
  const manualRefreshResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/analyze-unified") && response.request().method() === "POST"
  );
  await targetRow.getByRole("button", { name: "Refresh" }).click();
  await expect(
    page.getByText(
      `Running a full refresh for ${targetLabel}. Stratum will keep this page open until the source result is ready.`
    )
  ).toBeVisible();
  await expect(targetRow.getByRole("button", { name: "Refresh" })).toBeDisabled();
  const manualRefreshResponse = await manualRefreshResponsePromise;
  expect(manualRefreshResponse.ok()).toBeTruthy();
  const manualRefreshJson = await manualRefreshResponse.json();
  expect(manualRefreshJson.success).toBeTruthy();
  await expect(page.getByText(`Finished full refresh for ${targetLabel}.`)).toBeVisible();
  await expect(page.locator("aside").getByRole("heading", { name: targetLabel })).toBeVisible();

  const scheduleSelect = page.locator("aside select");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists/") && response.request().method() === "PATCH"
    ),
    scheduleSelect.selectOption("daily").then(() =>
      page.getByRole("button", { name: "Save schedule" }).click()
    ),
  ]);

  await delayFirstMatchingPostResponse(page, "/api/scheduled-refreshes/run", 600);
  const scheduledRefreshResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/scheduled-refreshes/run") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Run due refreshes" }).click();
  await expect(
    page.getByText(
      `Running a full refresh for due entries in ${watchlistName}. Stratum will keep this page open until the new saved state is ready.`
    )
  ).toBeVisible();
  const scheduledRefreshResponse = await scheduledRefreshResponsePromise;
  expect(scheduledRefreshResponse.ok()).toBeTruthy();
  const scheduledRefreshJson = await scheduledRefreshResponse.json();
  expect(scheduledRefreshJson.success).toBeTruthy();
  expect(scheduledRefreshJson.data.processedCount).toBeGreaterThan(0);
  await expect(page.getByText(`Finished full refresh for ${watchlistName}.`)).toBeVisible();
  await expect(page.locator("table").getByText("Notion", { exact: true })).toHaveCount(1);
  await expect(page.locator("aside").getByRole("heading", { name: targetLabel })).toBeVisible();
});
