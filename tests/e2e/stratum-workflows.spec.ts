import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import fixture from "./phase10-fixture.json";

const bannedLabels = [
  "Aggressive Expansion",
  "Hypergrowth",
  "Maintenance Mode",
  "Strategic Pivot",
  "R&D Pivot",
  "Product Pivot",
];

type CreatedIds = {
  briefIds: string[];
  watchlistIds: string[];
  watchlistEntryIds: string[];
};

const createdIds: CreatedIds = {
  briefIds: [],
  watchlistIds: [],
  watchlistEntryIds: [],
};

const {
  homeQuery,
  noMatchQuery,
  providerFailureQuery,
  throwErrorQuery,
  customWatchlistName,
} = fixture;
const runKey = `phase10-${Date.now()}-${randomUUID().slice(0, 8)}`;

let providerFailureBriefId = "";
let ambiguousBriefId = "";
let phase9HistoryWatchlistId = "";
let phase9HistoryEntryId = "";
let phase9OlderBriefId = "";
let phase9PreviousBriefId = "";
let phase9LatestBriefId = "";

async function assignUniqueClientIp(page: import("@playwright/test").Page): Promise<string> {
  const clientIp = `e2e-${randomUUID().slice(0, 8)}`;
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": clientIp,
  });
  return clientIp;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/test/e2e/bootstrap", {
    data: { runKey },
  });

  if (!response.ok) {
    throw new Error(`E2E bootstrap failed with status ${response.status()}: ${await response.text()}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`E2E bootstrap failed: ${payload.error ?? "unknown error"}`);
  }

  providerFailureBriefId = payload.data.providerFailureBriefId;
  ambiguousBriefId = payload.data.ambiguousBriefId;
  phase9HistoryWatchlistId = payload.data.phase9HistoryWatchlistId;
  phase9HistoryEntryId = payload.data.phase9HistoryEntryId;
  phase9OlderBriefId = payload.data.phase9OlderBriefId;
  phase9PreviousBriefId = payload.data.phase9PreviousBriefId;
  phase9LatestBriefId = payload.data.phase9LatestBriefId;
});

test("fresh brief flow, saved brief replay, and default watchlist add all work", async ({ page, context }) => {
  await assignUniqueClientIp(page);

  await page.goto("/");
  await page.getByLabel("Company name to analyze").fill(homeQuery);

  const [analyzeResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/analyze-unified") && response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Build brief" }).click(),
  ]);

  const analyzeJson = await analyzeResponse.json();
  expect(analyzeJson.success).toBeTruthy();
  expect(analyzeJson.cached).toBeFalsy();
  expect(analyzeJson.data.resultState).toBe("unsupported_ats_or_source_pattern");
  expect(analyzeJson.data.briefId).toBeTruthy();
  createdIds.briefIds.push(analyzeJson.data.briefId);
  const companyMatchSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Company Match & Coverage" }) }).first();
  const watchlistReadSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Watchlist Read" }) }).first();
  const proofRolesSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Proof Roles" }) }).first();
  const limitsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Limits & Caveats" }) }).first();
  const liveArtifactHeading = page.locator("p").filter({ hasText: /^Live result saved$/ }).first();

  await expect(liveArtifactHeading).toBeVisible();
  await expect(
    watchlistReadSection.getByText("Unsupported ATS or source pattern", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Company Match & Coverage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watchlist Read" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proof Roles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Limits & Caveats" })).toBeVisible();
  await expect(companyMatchSection).toBeVisible();
  await expect(proofRolesSection).toBeVisible();
  await expect(limitsSection).toBeVisible();

  const pageText = await page.locator("body").textContent();
  for (const banned of bannedLabels) {
    expect(pageText ?? "").not.toContain(banned);
  }
  expect(pageText ?? "").toContain("One matched provider is not full company coverage.");

  const briefApiResponse = await page.request.get(`/api/briefs/${analyzeJson.data.briefId}`);
  expect(briefApiResponse.ok()).toBeTruthy();
  const briefApiJson = await briefApiResponse.json();
  expect(briefApiJson.success).toBeTruthy();
  expect(briefApiJson.data.id).toBe(analyzeJson.data.briefId);

  const savedPage = await context.newPage();
  const savedBriefUrl = new URL(`/briefs/${analyzeJson.data.briefId}`, page.url()).toString();
  await savedPage.goto(savedBriefUrl, { waitUntil: "domcontentloaded" });
  await expect(savedPage.getByText("Saved brief", { exact: true })).toBeVisible();
  await expect(
    savedPage.getByText("being replayed from storage, not recomputed from a fresh fetch")
  ).toBeVisible();
  await savedPage.close();

  const [watchlistAddResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists/default/entries") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Add To Default Watchlist" }).click(),
  ]);

  const watchlistAddJson = await watchlistAddResponse.json();
  expect(watchlistAddJson.success).toBeTruthy();
  createdIds.watchlistEntryIds.push(watchlistAddJson.data.entry.id);
  await expect(page.getByText("Tracked in Default Watchlist.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Entry Detail" })).toBeVisible();

  await page.getByRole("link", { name: "Open Entry Detail" }).click();
  await expect(page).toHaveURL(/\/watchlists\?/);
  await expect(
    page.getByText(
      "due entries still require invoking the scheduled runner route explicitly."
    ).first()
  ).toBeVisible();

  const defaultEntry = page.locator("article").filter({ hasText: homeQuery }).first();
  await expect(defaultEntry).toBeVisible();
  await expect(defaultEntry.getByText("Open Latest Brief")).toBeVisible();

  await defaultEntry.getByRole("link", { name: "Open Latest Brief" }).click();
  await expect(page).toHaveURL(new RegExp(`/briefs/${analyzeJson.data.briefId}$`));
  await expect(page.locator("p").filter({ hasText: /^Saved brief$/ }).first()).toBeVisible();
});

test("custom watchlist manual refresh keeps latest and previous aligned, and cache reuse stays honest", async ({ page }) => {
  const clientIp = await assignUniqueClientIp(page);

  await page.goto("/watchlists");

  await page.getByLabel("New watchlist").fill(customWatchlistName);
  const [createWatchlistResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists") &&
        !response.url().includes("/entries") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Create" }).click(),
  ]);

  const createWatchlistJson = await createWatchlistResponse.json();
  expect(createWatchlistJson.success).toBeTruthy();
  const customWatchlistId = createWatchlistJson.data.watchlist.id;
  createdIds.watchlistIds.push(customWatchlistId);
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${customWatchlistId}`));

  await page.getByLabel("Add company or query").fill(noMatchQuery);
  const [addEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${customWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);

  const addEntryJson = await addEntryResponse.json();
  expect(addEntryJson.success).toBeTruthy();
  const customEntryId = addEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(customEntryId);

  const customEntry = page.locator("article").filter({ hasText: noMatchQuery }).first();
  await expect(customEntry).toBeVisible();
  await expect(customEntry.getByText("No saved brief yet").first()).toBeVisible();

  const [firstRefreshResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/analyze-unified") && response.request().method() === "POST"
    ),
    customEntry.getByRole("link", { name: "Refresh Manually" }).click(),
  ]);

  const firstRefreshJson = await firstRefreshResponse.json();
  expect(firstRefreshJson.success).toBeTruthy();
  expect(firstRefreshJson.cached).toBeFalsy();
  expect(firstRefreshJson.data.resultState).toBe("no_matched_provider_found");
  expect(firstRefreshJson.data.watchlistEntryId).toBe(customEntryId);
  expect(firstRefreshJson.data.watchlistId).toBe(customWatchlistId);
  expect(firstRefreshJson.data.briefId).toBeTruthy();
  expect(firstRefreshJson.data.manualRefreshRequested).toBeTruthy();
  const firstBriefId = firstRefreshJson.data.briefId;
  createdIds.briefIds.push(firstBriefId);
  const watchlistReadSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Watchlist Read" }) }).first();

  await expect(page.locator("p").filter({ hasText: /^Manual refresh saved$/ }).first()).toBeVisible();
  await expect(
    watchlistReadSection.getByText("No supported ATS match confirmed", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("This manual refresh created the current latest saved brief for this tracked entry.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Entry Detail" }).first()).toBeVisible();

  await page.goto(`/watchlists?watchlistId=${customWatchlistId}`);
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${customWatchlistId}`));

  const entryAfterFirstRefresh = page.locator("article").filter({ hasText: noMatchQuery }).first();
  await expect(entryAfterFirstRefresh.getByText("No supported match")).toBeVisible();
  await expect(entryAfterFirstRefresh.getByText("Open Latest Brief")).toBeVisible();

  await entryAfterFirstRefresh.getByRole("link", { name: "Open Latest Brief" }).click();
  await expect(page).toHaveURL(new RegExp(`/briefs/${firstBriefId}$`));
  await expect(page.locator("p").filter({ hasText: /^Saved brief$/ }).first()).toBeVisible();
  await expect(page.getByText("No supported ATS match confirmed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Current latest saved brief", { exact: true }).first()).toBeVisible();

  await page.goto(`/watchlists?watchlistId=${customWatchlistId}`);
  const entryBeforeSecondRefresh = page.locator("article").filter({ hasText: noMatchQuery }).first();
  await expect(entryBeforeSecondRefresh).toBeVisible();

  const [secondRefreshResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/analyze-unified") && response.request().method() === "POST"
    ),
    entryBeforeSecondRefresh.getByRole("link", { name: "Refresh Manually" }).click(),
  ]);

  const secondRefreshJson = await secondRefreshResponse.json();
  expect(secondRefreshJson.success).toBeTruthy();
  expect(secondRefreshJson.cached).toBeFalsy();
  expect(secondRefreshJson.data.watchlistEntryId).toBe(customEntryId);
  expect(secondRefreshJson.data.briefId).toBeTruthy();
  expect(secondRefreshJson.data.briefId).not.toBe(firstBriefId);
  expect(secondRefreshJson.data.manualRefreshRequested).toBeTruthy();
  const secondBriefId = secondRefreshJson.data.briefId;
  createdIds.briefIds.push(secondBriefId);

  await expect(page.locator("p").filter({ hasText: /^Manual refresh saved$/ }).first()).toBeVisible();
  await expect(page.getByText("No material change observed between the latest two saved briefs.")).toBeVisible();

  await page.goto(`/watchlists?watchlistId=${customWatchlistId}&entryId=${customEntryId}`);
  await expect(page.getByText("Scheduled Refresh", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest Monitoring State")).toBeVisible();
  await expect(page.getByText("Refresh Lifecycle")).toBeVisible();
  await expect(page.getByText("Current latest saved brief").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Refresh Entry Manually" })).toBeVisible();

  const detailResponse = await page.request.get(`/api/watchlists/${customWatchlistId}/entries/${customEntryId}`);
  expect(detailResponse.ok()).toBeTruthy();
  const detailJson = await detailResponse.json();
  expect(detailJson.success).toBeTruthy();
  expect(detailJson.data.monitoring.latestBriefId).toBe(secondBriefId);
  expect(detailJson.data.monitoring.previousBriefId).toBe(firstBriefId);
  expect(detailJson.data.history).toHaveLength(2);
  expect(detailJson.data.attemptHistory).toHaveLength(2);
  expect(detailJson.data.monitoring.lastMonitoringAttemptOutcome).toBe("saved_brief_created");
  expect(detailJson.data.monitoring.lastMonitoringAttemptCreatedSavedBrief).toBeTruthy();
  expect(detailJson.data.diff.comparisonAvailable).toBeTruthy();
  expect(detailJson.data.diff.summary).toBe("No material change observed between the latest two saved briefs.");
  expect(detailJson.data.monitoring.notificationCandidateCount).toBe(0);
  expect(detailJson.data.monitoring.unreadNotificationCount).toBe(0);

  const cachedReuseResponse = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": clientIp,
    },
    data: {
      companyName: noMatchQuery,
      watchlistEntryId: customEntryId,
    },
  });
  expect(cachedReuseResponse.ok()).toBeTruthy();
  const cachedReuseJson = await cachedReuseResponse.json();
  expect(cachedReuseJson.success).toBeTruthy();
  expect(cachedReuseJson.cached).toBeTruthy();
  expect(cachedReuseJson.data.briefId).toBe(secondBriefId);
  expect(cachedReuseJson.data.watchlistMonitoring.latestBriefId).toBe(secondBriefId);
  expect(cachedReuseJson.data.watchlistMonitoring.previousBriefId).toBe(firstBriefId);

  const detailAfterCacheResponse = await page.request.get(`/api/watchlists/${customWatchlistId}/entries/${customEntryId}`);
  expect(detailAfterCacheResponse.ok()).toBeTruthy();
  const detailAfterCacheJson = await detailAfterCacheResponse.json();
  expect(detailAfterCacheJson.success).toBeTruthy();
  expect(detailAfterCacheJson.data.monitoring.latestBriefId).toBe(secondBriefId);
  expect(detailAfterCacheJson.data.monitoring.previousBriefId).toBe(firstBriefId);
  expect(detailAfterCacheJson.data.history).toHaveLength(2);
  expect(detailAfterCacheJson.data.attemptHistory).toHaveLength(3);
  expect(detailAfterCacheJson.data.monitoring.lastMonitoringAttemptOutcome).toBe("reused_cached_result");
  expect(detailAfterCacheJson.data.monitoring.lastMonitoringAttemptCreatedSavedBrief).toBeFalsy();
  expect(detailAfterCacheJson.data.monitoring.latestStateBasis).toBe("saved_brief");
  expect(detailAfterCacheJson.data.monitoring.latestStateResultState).toBe("no_matched_provider_found");
  expect(detailAfterCacheJson.data.monitoring.latestStateWatchlistReadLabel).toBe(
    "No supported ATS match confirmed"
  );

  await page.goto(`/watchlists?watchlistId=${customWatchlistId}`);
  const entryAfterCacheReuse = page.locator("article").filter({ hasText: noMatchQuery }).first();
  await expect(entryAfterCacheReuse).toBeVisible();

  const [deleteEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${customWatchlistId}/entries/${customEntryId}`) &&
        response.request().method() === "DELETE"
    ),
    entryAfterCacheReuse.getByRole("button", { name: "Remove" }).click(),
  ]);

  const deleteEntryJson = await deleteEntryResponse.json();
  expect(deleteEntryJson.success).toBeTruthy();
  await expect(page.getByText("Tracked company removed from watchlist.")).toBeVisible();
  await expect(page.locator("article").filter({ hasText: noMatchQuery })).toHaveCount(0);
});

test("scheduled refresh configuration and due execution stay honest", async ({ page }) => {
  const clientIp = await assignUniqueClientIp(page);

  await page.goto("/watchlists");

  const scheduledWatchlistName = `Phase 12 Scheduled ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("New watchlist").fill(scheduledWatchlistName);
  const [createWatchlistResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists") &&
        !response.url().includes("/entries") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Create" }).click(),
  ]);

  const createWatchlistJson = await createWatchlistResponse.json();
  expect(createWatchlistJson.success).toBeTruthy();
  const scheduledWatchlistId = createWatchlistJson.data.watchlist.id;
  createdIds.watchlistIds.push(scheduledWatchlistId);
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${scheduledWatchlistId}`));
  await expect(page.getByRole("button", { name: "Run Due Scheduled Refreshes" })).toBeVisible();

  await page.getByLabel("Add company or query").fill(noMatchQuery);
  const [savedEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${scheduledWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);
  const savedEntryJson = await savedEntryResponse.json();
  expect(savedEntryJson.success).toBeTruthy();
  const scheduledSavedEntryId = savedEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(scheduledSavedEntryId);

  await page.getByLabel("Add company or query").fill(providerFailureQuery);
  const [unsavedEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${scheduledWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);
  const unsavedEntryJson = await unsavedEntryResponse.json();
  expect(unsavedEntryJson.success).toBeTruthy();
  const scheduledUnsavedEntryId = unsavedEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(scheduledUnsavedEntryId);

  await page.getByLabel("Add company or query").fill(throwErrorQuery);
  const [failedEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${scheduledWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);
  const failedEntryJson = await failedEntryResponse.json();
  expect(failedEntryJson.success).toBeTruthy();
  const scheduledFailedEntryId = failedEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(scheduledFailedEntryId);

  const firstManualRefreshResponse = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": clientIp,
    },
    data: {
      companyName: noMatchQuery,
      watchlistEntryId: scheduledSavedEntryId,
      forceRefresh: true,
    },
  });
  expect(firstManualRefreshResponse.ok()).toBeTruthy();
  const firstManualRefreshJson = await firstManualRefreshResponse.json();
  expect(firstManualRefreshJson.success).toBeTruthy();
  expect(firstManualRefreshJson.data.briefId).toBeTruthy();
  createdIds.briefIds.push(firstManualRefreshJson.data.briefId);

  await page.goto(`/watchlists?watchlistId=${scheduledWatchlistId}&entryId=${scheduledSavedEntryId}`);
  await page.getByLabel("Cadence").selectOption("daily");
  const [scheduleSaveResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${scheduledWatchlistId}/entries/${scheduledSavedEntryId}`) &&
        response.request().method() === "PATCH"
    ),
    page.getByRole("button", { name: "Save Schedule" }).click(),
  ]);
  const scheduleSaveJson = await scheduleSaveResponse.json();
  expect(scheduleSaveJson.success).toBeTruthy();
  expect(scheduleSaveJson.data.entry.scheduleCadence).toBe("daily");
  expect(scheduleSaveJson.data.entry.scheduleNextRunAt).toBeTruthy();
  await expect(page.getByText("Scheduled refresh set to Daily.")).toBeVisible();

  for (const entryId of [scheduledUnsavedEntryId, scheduledFailedEntryId]) {
    const response = await page.request.patch(
      `/api/watchlists/${scheduledWatchlistId}/entries/${entryId}`,
      {
        data: { scheduleCadence: "daily" },
      }
    );
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.success).toBeTruthy();
    expect(json.data.entry.scheduleCadence).toBe("daily");
    expect(json.data.entry.scheduleNextRunAt).toBeTruthy();
  }

  const scheduledRunResponse = await page.request.post("/api/scheduled-refreshes/run", {
    data: { watchlistId: scheduledWatchlistId, limit: 10 },
  });
  expect(scheduledRunResponse.ok()).toBeTruthy();
  const scheduledRunJson = await scheduledRunResponse.json();
  expect(scheduledRunJson.success).toBeTruthy();
  expect(scheduledRunJson.data.dueCount).toBe(3);
  expect(scheduledRunJson.data.processedCount).toBe(3);
  expect(scheduledRunJson.data.savedBriefCount).toBe(1);
  expect(scheduledRunJson.data.unsavedCount).toBe(1);
  expect(scheduledRunJson.data.failedCount).toBe(1);

  const savedScheduledRun = scheduledRunJson.data.results.find(
    (result: { watchlistEntryId: string }) => result.watchlistEntryId === scheduledSavedEntryId
  );
  expect(savedScheduledRun).toBeTruthy();
  expect(savedScheduledRun.outcomeStatus).toBe("saved_brief_created");
  expect(savedScheduledRun.relatedBriefId).toBeTruthy();
  createdIds.briefIds.push(savedScheduledRun.relatedBriefId);

  const unsavedScheduledRun = scheduledRunJson.data.results.find(
    (result: { watchlistEntryId: string }) => result.watchlistEntryId === scheduledUnsavedEntryId
  );
  expect(unsavedScheduledRun).toBeTruthy();
  expect(unsavedScheduledRun.outcomeStatus).toBe("completed_without_saved_brief");
  expect(unsavedScheduledRun.relatedBriefId ?? null).toBeNull();

  const failedScheduledRun = scheduledRunJson.data.results.find(
    (result: { watchlistEntryId: string }) => result.watchlistEntryId === scheduledFailedEntryId
  );
  expect(failedScheduledRun).toBeTruthy();
  expect(failedScheduledRun.outcomeStatus).toBe("failed");
  expect(failedScheduledRun.errorSummary).toContain("Simulated E2E monitoring failure.");

  const savedDetailResponse = await page.request.get(
    `/api/watchlists/${scheduledWatchlistId}/entries/${scheduledSavedEntryId}`
  );
  expect(savedDetailResponse.ok()).toBeTruthy();
  const savedDetailJson = await savedDetailResponse.json();
  expect(savedDetailJson.success).toBeTruthy();
  expect(savedDetailJson.data.history).toHaveLength(2);
  expect(savedDetailJson.data.monitoring.lastMonitoringAttemptOrigin).toBe("scheduled_refresh");
  expect(savedDetailJson.data.monitoring.lastMonitoringAttemptOutcome).toBe("saved_brief_created");
  expect(savedDetailJson.data.monitoring.schedule.cadence).toBe("daily");
  expect(savedDetailJson.data.monitoring.schedule.lastScheduledOutcome).toBe("saved_brief_created");
  expect(savedDetailJson.data.monitoring.schedule.hasScheduledRun).toBeTruthy();
  expect(savedDetailJson.data.monitoring.schedule.scheduledRunCount).toBe(1);
  expect(savedDetailJson.data.monitoring.schedule.consecutiveFailures).toBe(0);
  expect(savedDetailJson.data.monitoring.schedule.nextRunAt).toBeTruthy();
  expect(savedDetailJson.data.monitoring.notificationCandidateCount).toBe(0);
  expect(savedDetailJson.data.attemptHistory[0].attemptOrigin).toBe("scheduled_refresh");
  expect(savedDetailJson.data.attemptHistory[1].attemptOrigin).toBe("manual_refresh");

  const unsavedDetailResponse = await page.request.get(
    `/api/watchlists/${scheduledWatchlistId}/entries/${scheduledUnsavedEntryId}`
  );
  expect(unsavedDetailResponse.ok()).toBeTruthy();
  const unsavedDetailJson = await unsavedDetailResponse.json();
  expect(unsavedDetailJson.success).toBeTruthy();
  expect(unsavedDetailJson.data.history).toHaveLength(0);
  expect(unsavedDetailJson.data.monitoring.lastMonitoringAttemptOrigin).toBe("scheduled_refresh");
  expect(unsavedDetailJson.data.monitoring.lastMonitoringAttemptOutcome).toBe(
    "completed_without_saved_brief"
  );
  expect(unsavedDetailJson.data.monitoring.latestStateBasis).toBe("latest_attempt_only");
  expect(unsavedDetailJson.data.monitoring.notificationCandidateCount).toBe(0);
  expect(unsavedDetailJson.data.monitoring.schedule.lastScheduledOutcome).toBe(
    "completed_without_saved_brief"
  );

  const failedDetailResponse = await page.request.get(
    `/api/watchlists/${scheduledWatchlistId}/entries/${scheduledFailedEntryId}`
  );
  expect(failedDetailResponse.ok()).toBeTruthy();
  const failedDetailJson = await failedDetailResponse.json();
  expect(failedDetailJson.success).toBeTruthy();
  expect(failedDetailJson.data.history).toHaveLength(0);
  expect(failedDetailJson.data.monitoring.lastMonitoringAttemptOrigin).toBe("scheduled_refresh");
  expect(failedDetailJson.data.monitoring.lastMonitoringAttemptOutcome).toBe("failed");
  expect(failedDetailJson.data.monitoring.schedule.lastScheduledOutcome).toBe("failed");
  expect(failedDetailJson.data.monitoring.schedule.consecutiveFailures).toBe(1);
  expect(failedDetailJson.data.monitoring.schedule.retryBackoffActive).toBeTruthy();
  expect(failedDetailJson.data.monitoring.notificationCandidateCount).toBe(1);
  expect(failedDetailJson.data.monitoring.latestNotificationCandidateSummary).toContain(
    "Scheduled refresh failed"
  );
  expect(failedDetailJson.data.monitoring.schedule.lastScheduledErrorSummary).toContain(
    "Simulated E2E monitoring failure."
  );

  await page.goto(`/watchlists?watchlistId=${scheduledWatchlistId}&entryId=${scheduledSavedEntryId}`);
  await expect(page.getByText("Scheduled Refresh", { exact: true })).toBeVisible();
  await expect(page.getByText("Daily", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Last scheduled outcome", { exact: true })).toBeVisible();
  await expect(page.getByText("Scheduled run count", { exact: true })).toBeVisible();
});

test("cron execution, retry backoff, and overlap protection stay honest", async ({ page }) => {
  await page.goto("/watchlists");

  const watchlistName = `Phase 13 Cron ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("New watchlist").fill(watchlistName);
  const [createWatchlistResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists") &&
        !response.url().includes("/entries") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Create" }).click(),
  ]);

  const createWatchlistJson = await createWatchlistResponse.json();
  expect(createWatchlistJson.success).toBeTruthy();
  const watchlistId = createWatchlistJson.data.watchlist.id;
  createdIds.watchlistIds.push(watchlistId);
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${watchlistId}`));

  await page.getByLabel("Add company or query").fill(noMatchQuery);
  const [savedEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${watchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);
  const savedEntryJson = await savedEntryResponse.json();
  expect(savedEntryJson.success).toBeTruthy();
  const cronSavedEntryId = savedEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(cronSavedEntryId);

  const savedScheduleResponse = await page.request.patch(
    `/api/watchlists/${watchlistId}/entries/${cronSavedEntryId}`,
    {
      data: { scheduleCadence: "daily" },
    }
  );
  expect(savedScheduleResponse.ok()).toBeTruthy();

  const [cronRunA, cronRunB] = await Promise.all([
    page.request.get("/api/cron/scheduled-refreshes", {
      headers: { "x-vercel-cron": "1" },
    }),
    page.request.get("/api/cron/scheduled-refreshes", {
      headers: { "x-vercel-cron": "1" },
    }),
  ]);

  expect(cronRunA.ok()).toBeTruthy();
  expect(cronRunB.ok()).toBeTruthy();
  const cronRunAJson = await cronRunA.json();
  const cronRunBJson = await cronRunB.json();
  expect(cronRunAJson.success).toBeTruthy();
  expect(cronRunBJson.success).toBeTruthy();
  expect(cronRunAJson.automation.alwaysOnActive).toBeFalsy();
  expect(cronRunBJson.automation.alwaysOnActive).toBeFalsy();
  expect(cronRunAJson.data.processedCount + cronRunBJson.data.processedCount).toBe(1);

  const savedDetailResponse = await page.request.get(
    `/api/watchlists/${watchlistId}/entries/${cronSavedEntryId}`
  );
  expect(savedDetailResponse.ok()).toBeTruthy();
  const savedDetailJson = await savedDetailResponse.json();
  expect(savedDetailJson.success).toBeTruthy();
  expect(
    savedDetailJson.data.attemptHistory.filter(
      (attempt: { attemptOrigin: string }) => attempt.attemptOrigin === "scheduled_refresh"
    )
  ).toHaveLength(1);
  expect(savedDetailJson.data.monitoring.schedule.scheduledRunCount).toBe(1);
  expect(savedDetailJson.data.monitoring.notificationCandidateCount).toBe(0);
  expect(savedDetailJson.data.history[0]?.id).toBeTruthy();
  createdIds.briefIds.push(savedDetailJson.data.history[0].id);

  await page.getByLabel("Add company or query").fill(throwErrorQuery);
  const [failedEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${watchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);
  const failedEntryJson = await failedEntryResponse.json();
  expect(failedEntryJson.success).toBeTruthy();
  const cronFailedEntryId = failedEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(cronFailedEntryId);

  const failedScheduleResponse = await page.request.patch(
    `/api/watchlists/${watchlistId}/entries/${cronFailedEntryId}`,
    {
      data: { scheduleCadence: "daily" },
    }
  );
  expect(failedScheduleResponse.ok()).toBeTruthy();

  const failedCronRun = await page.request.get("/api/cron/scheduled-refreshes", {
    headers: { "x-vercel-cron": "1" },
  });
  expect(failedCronRun.ok()).toBeTruthy();
  const failedCronRunJson = await failedCronRun.json();
  expect(failedCronRunJson.success).toBeTruthy();
  expect(failedCronRunJson.data.processedCount).toBe(1);
  expect(failedCronRunJson.data.failedCount).toBe(1);

  const failedDetailResponse = await page.request.get(
    `/api/watchlists/${watchlistId}/entries/${cronFailedEntryId}`
  );
  expect(failedDetailResponse.ok()).toBeTruthy();
  const failedDetailJson = await failedDetailResponse.json();
  expect(failedDetailJson.success).toBeTruthy();
  expect(failedDetailJson.data.monitoring.lastMonitoringAttemptOrigin).toBe("scheduled_refresh");
  expect(failedDetailJson.data.monitoring.schedule.consecutiveFailures).toBe(1);
  expect(failedDetailJson.data.monitoring.schedule.retryBackoffActive).toBeTruthy();
  expect(failedDetailJson.data.monitoring.schedule.nextRunAt).toBeTruthy();
  expect(failedDetailJson.data.monitoring.notificationCandidateCount).toBe(1);
  expect(failedDetailJson.data.notificationCandidates).toHaveLength(1);
  expect(failedDetailJson.data.notificationCandidates[0].summary).toContain(
    "Scheduled refresh failed"
  );

  const secondFailedCronRun = await page.request.get("/api/cron/scheduled-refreshes", {
    headers: { "x-vercel-cron": "1" },
  });
  expect(secondFailedCronRun.ok()).toBeTruthy();
  const secondFailedCronRunJson = await secondFailedCronRun.json();
  expect(secondFailedCronRunJson.success).toBeTruthy();
  expect(secondFailedCronRunJson.data.processedCount).toBe(0);
  expect(secondFailedCronRunJson.data.failedCount).toBe(0);
});

test("notifications inbox supports read, unread, dismiss, navigation, and honest noise control", async ({ page }) => {
  const clientIp = await assignUniqueClientIp(page);

  await page.goto("/watchlists");

  const notificationWatchlistName = `Phase 14 Notifications ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("New watchlist").fill(notificationWatchlistName);
  const [createWatchlistResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists") &&
        !response.url().includes("/entries") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Create" }).click(),
  ]);

  const createWatchlistJson = await createWatchlistResponse.json();
  expect(createWatchlistJson.success).toBeTruthy();
  const notificationWatchlistId = createWatchlistJson.data.watchlist.id;
  createdIds.watchlistIds.push(notificationWatchlistId);
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${notificationWatchlistId}`));

  await page.getByLabel("Add company or query").fill(throwErrorQuery);
  const [failedEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${notificationWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);

  const failedEntryJson = await failedEntryResponse.json();
  expect(failedEntryJson.success).toBeTruthy();
  const failedEntryId = failedEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(failedEntryId);

  const failedRefreshResponse = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": clientIp,
    },
    data: {
      companyName: throwErrorQuery,
      watchlistEntryId: failedEntryId,
      forceRefresh: true,
    },
  });
  expect(failedRefreshResponse.status()).toBe(500);

  await page.goto("/notifications?status=all");
  await expect(
    page.getByText(
      "Meaningful monitoring changes now surface in Stratum's in-product inbox."
    )
  ).toBeVisible();
  await expect(page.getByText("No email, push, Slack, or external delivery channel exists yet.")).toBeVisible();

  const failureCard = page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." }).first();
  await expect(failureCard).toBeVisible();
  await expect(failureCard.getByText("Unread", { exact: true })).toBeVisible();
  await expect(failureCard.getByText("In-app inbox only", { exact: true })).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/watchlists\\?watchlistId=${notificationWatchlistId}&entryId=${failedEntryId}`)),
    failureCard.getByRole("link", { name: "Open Entry Detail" }).click(),
  ]);
  await expect(page.getByText("Entry Monitoring", { exact: true })).toBeVisible();

  await page.goto("/notifications?status=all");
  const seededBriefCard = page
    .locator("article")
    .filter({ has: page.locator(`a[href="/briefs/${phase9LatestBriefId}"]`) })
    .first();
  await expect(seededBriefCard).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/briefs/${phase9LatestBriefId}$`)),
    seededBriefCard.getByRole("link", { name: "Open Related Brief" }).click(),
  ]);
  await expect(page.locator("p").filter({ hasText: /^Saved brief$/ }).first()).toBeVisible();

  await page.goto("/notifications?status=all");
  const failureCardAgain = page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." }).first();

  const [markReadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/notifications/") && response.request().method() === "PATCH"
    ),
    failureCardAgain.getByRole("button", { name: "Mark Read" }).click(),
  ]);
  const markReadJson = await markReadResponse.json();
  expect(markReadJson.success).toBeTruthy();
  expect(markReadJson.data.status).toBe("read");
  await expect(page.getByText("Notification marked as read.")).toBeVisible();

  const [markUnreadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/notifications/") && response.request().method() === "PATCH"
    ),
    failureCardAgain.getByRole("button", { name: "Mark Unread" }).click(),
  ]);
  const markUnreadJson = await markUnreadResponse.json();
  expect(markUnreadJson.success).toBeTruthy();
  expect(markUnreadJson.data.status).toBe("unread");
  await expect(page.getByText("Notification marked as unread.")).toBeVisible();

  const [dismissResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/notifications/") && response.request().method() === "PATCH"
    ),
    failureCardAgain.getByRole("button", { name: "Dismiss" }).click(),
  ]);
  const dismissJson = await dismissResponse.json();
  expect(dismissJson.success).toBeTruthy();
  expect(dismissJson.data.status).toBe("dismissed");
  await expect(page.getByText("Notification dismissed from the active inbox.")).toBeVisible();

  await page.goto("/notifications?status=dismissed");
  const dismissedFailureCard = page.locator("article").filter({ hasText: "Simulated E2E monitoring failure." }).first();
  await expect(dismissedFailureCard).toBeVisible();
  await expect(dismissedFailureCard.getByText("Dismissed", { exact: true })).toBeVisible();

  const [restoreUnreadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/notifications/") && response.request().method() === "PATCH"
    ),
    dismissedFailureCard.getByRole("button", { name: "Mark Unread" }).click(),
  ]);
  const restoreUnreadJson = await restoreUnreadResponse.json();
  expect(restoreUnreadJson.success).toBeTruthy();
  expect(restoreUnreadJson.data.status).toBe("unread");

  await page.goto(`/watchlists?watchlistId=${notificationWatchlistId}`);
  await page.getByLabel("Add company or query").fill(noMatchQuery);
  const [noiseEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${notificationWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);
  const noiseEntryJson = await noiseEntryResponse.json();
  expect(noiseEntryJson.success).toBeTruthy();
  const noiseEntryId = noiseEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(noiseEntryId);

  const firstNoiseRefresh = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": clientIp,
    },
    data: {
      companyName: noMatchQuery,
      watchlistEntryId: noiseEntryId,
      forceRefresh: true,
    },
  });
  expect(firstNoiseRefresh.ok()).toBeTruthy();
  const firstNoiseRefreshJson = await firstNoiseRefresh.json();
  expect(firstNoiseRefreshJson.success).toBeTruthy();
  expect(firstNoiseRefreshJson.data.briefId).toBeTruthy();
  createdIds.briefIds.push(firstNoiseRefreshJson.data.briefId);

  const secondNoiseRefresh = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": clientIp,
    },
    data: {
      companyName: noMatchQuery,
      watchlistEntryId: noiseEntryId,
      forceRefresh: true,
    },
  });
  expect(secondNoiseRefresh.ok()).toBeTruthy();

  const notificationApiResponse = await page.request.get("/api/notifications?status=all");
  expect(notificationApiResponse.ok()).toBeTruthy();
  const notificationApiJson = await notificationApiResponse.json();
  expect(notificationApiJson.success).toBeTruthy();
  expect(
    notificationApiJson.data.notifications.some(
      (notification: { watchlistEntryId: string }) => notification.watchlistEntryId === noiseEntryId
    )
  ).toBeFalsy();
});

test("unsaved and failed refresh attempts persist honest monitoring events", async ({ page }) => {
  const clientIp = await assignUniqueClientIp(page);

  await page.goto("/watchlists");

  const attemptWatchlistName = `Phase 11 Attempt Log ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("New watchlist").fill(attemptWatchlistName);
  const [createWatchlistResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/watchlists") &&
        !response.url().includes("/entries") &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Create" }).click(),
  ]);

  const createWatchlistJson = await createWatchlistResponse.json();
  expect(createWatchlistJson.success).toBeTruthy();
  const attemptWatchlistId = createWatchlistJson.data.watchlist.id;
  createdIds.watchlistIds.push(attemptWatchlistId);
  await expect(page).toHaveURL(new RegExp(`/watchlists\\?watchlistId=${attemptWatchlistId}`));

  await page.getByLabel("Add company or query").fill(providerFailureQuery);
  const [providerEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${attemptWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);

  const providerEntryJson = await providerEntryResponse.json();
  expect(providerEntryJson.success).toBeTruthy();
  const providerEntryId = providerEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(providerEntryId);

  const providerEntryCard = page.locator("article").filter({ hasText: providerFailureQuery }).first();
  await expect(providerEntryCard).toBeVisible();

  const [providerRefreshResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/analyze-unified") && response.request().method() === "POST"
    ),
    providerEntryCard.getByRole("link", { name: "Refresh Manually" }).click(),
  ]);

  const providerRefreshJson = await providerRefreshResponse.json();
  expect(providerRefreshJson.success).toBeTruthy();
  expect(providerRefreshJson.cached).toBeFalsy();
  expect(providerRefreshJson.data.resultState).toBe("provider_failure");
  expect(providerRefreshJson.data.briefId ?? null).toBeNull();
  expect(providerRefreshJson.data.manualRefreshRequested).toBeTruthy();

  await expect(
    page
      .getByText("No saved brief exists yet. The latest monitoring state comes only from an unsaved attempt with Provider failure.")
      .first()
  ).toBeVisible();

  const providerDetailResponse = await page.request.get(
    `/api/watchlists/${attemptWatchlistId}/entries/${providerEntryId}`
  );
  expect(providerDetailResponse.ok()).toBeTruthy();
  const providerDetailJson = await providerDetailResponse.json();
  expect(providerDetailJson.success).toBeTruthy();
  expect(providerDetailJson.data.history).toHaveLength(0);
  expect(providerDetailJson.data.attemptHistory).toHaveLength(1);
  expect(providerDetailJson.data.monitoring.lastMonitoringAttemptOutcome).toBe("completed_without_saved_brief");
  expect(providerDetailJson.data.monitoring.lastMonitoringAttemptCreatedSavedBrief).toBeFalsy();
  expect(providerDetailJson.data.monitoring.latestStateBasis).toBe("latest_attempt_only");
  expect(providerDetailJson.data.monitoring.latestStateSummary).toContain("No saved brief exists yet.");
  expect(providerDetailJson.data.monitoring.latestStateResultState).toBe("provider_failure");
  expect(providerDetailJson.data.monitoring.latestStateWatchlistReadLabel).toBe("Provider fetch failure");
  expect(providerDetailJson.data.monitoring.latestStateWatchlistReadConfidence).toBe("none");

  await page.goto(`/watchlists?watchlistId=${attemptWatchlistId}`);
  await page.getByLabel("Add company or query").fill(throwErrorQuery);
  const [failedEntryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/watchlists/${attemptWatchlistId}/entries`) &&
        response.request().method() === "POST"
    ),
    page.getByRole("button", { name: "Track" }).click(),
  ]);

  const failedEntryJson = await failedEntryResponse.json();
  expect(failedEntryJson.success).toBeTruthy();
  const failedEntryId = failedEntryJson.data.entry.id;
  createdIds.watchlistEntryIds.push(failedEntryId);

  const failedRefreshResponse = await page.request.post("/api/analyze-unified", {
    headers: {
      "x-forwarded-for": clientIp,
    },
    data: {
      companyName: throwErrorQuery,
      watchlistEntryId: failedEntryId,
      forceRefresh: true,
    },
  });
  expect(failedRefreshResponse.status()).toBe(500);
  const failedRefreshJson = await failedRefreshResponse.json();
  expect(failedRefreshJson.success).toBeFalsy();
  expect(failedRefreshJson.error).toContain("Simulated E2E monitoring failure.");

  const failedDetailResponse = await page.request.get(
    `/api/watchlists/${attemptWatchlistId}/entries/${failedEntryId}`
  );
  expect(failedDetailResponse.ok()).toBeTruthy();
  const failedDetailJson = await failedDetailResponse.json();
  expect(failedDetailJson.success).toBeTruthy();
  expect(failedDetailJson.data.history).toHaveLength(0);
  expect(failedDetailJson.data.attemptHistory).toHaveLength(1);
  expect(failedDetailJson.data.monitoring.lastMonitoringAttemptOutcome).toBe("failed");
  expect(failedDetailJson.data.monitoring.lastMonitoringAttemptCreatedSavedBrief).toBeFalsy();
  expect(failedDetailJson.data.monitoring.latestStateBasis).toBe("latest_attempt_only");
  expect(failedDetailJson.data.monitoring.recentFailuresObserved).toBeTruthy();
  expect(failedDetailJson.data.monitoring.latestStateResultState).toBeNull();
  expect(failedDetailJson.data.monitoring.latestStateWatchlistReadLabel).toBeNull();
  expect(failedDetailJson.data.monitoring.lastMonitoringAttemptErrorSummary).toContain(
    "Simulated E2E monitoring failure."
  );

  await page.goto(`/watchlists?watchlistId=${attemptWatchlistId}&entryId=${failedEntryId}`);
  await expect(page.getByText("Monitoring Attempts", { exact: true })).toBeVisible();
  await expect(page.getByText("Refresh failed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Attempt only", { exact: true })).toBeVisible();
  await expect(page.getByText("No saved brief exists yet.")).toBeVisible();
});

test("saved brief replay keeps weak and failure states honest", async ({ page }) => {
  await page.goto(`/briefs/${providerFailureBriefId}`);
  const providerFailureWatchlistRead = page.locator("section").filter({ has: page.getByRole("heading", { name: "Watchlist Read" }) }).first();
  await expect(page.locator("p").filter({ hasText: /^Saved brief$/ }).first()).toBeVisible();
  await expect(page.getByText("Provider failure", { exact: true }).first()).toBeVisible();
  await expect(
    providerFailureWatchlistRead.getByText("Provider fetch failure", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(
      "Supported provider requests failed, so Stratum cannot treat absence as evidence.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(providerFailureWatchlistRead.getByText("Read confidence", { exact: true })).toBeVisible();
  await expect(providerFailureWatchlistRead.getByText("None", { exact: true }).first()).toBeVisible();

  await page.goto(`/briefs/${ambiguousBriefId}`);
  const ambiguousWatchlistRead = page.locator("section").filter({ has: page.getByRole("heading", { name: "Watchlist Read" }) }).first();
  await expect(page.locator("p").filter({ hasText: /^Saved brief$/ }).first()).toBeVisible();
  await expect(page.getByText("Weak or indirect company match", { exact: true }).first()).toBeVisible();
  await expect(ambiguousWatchlistRead.getByText("Indirect company match", { exact: true })).toBeVisible();
  await expect(page.getByText("Ambiguous low-confidence match")).toBeVisible();
  await expect(page.getByText("Treat this brief as tentative.")).toBeVisible();
  await expect(page.getByText("One matched provider is not full company coverage.")).toBeVisible();
});

test("saved brief replay makes latest vs older tracked-entry state explicit", async ({ page }) => {
  await page.goto(`/briefs/${phase9PreviousBriefId}`);
  await expect(page.getByText("Previous saved brief", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("A newer saved brief now exists for this tracked entry. This screen is replaying the previous saved brief only.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Current Latest Brief" })).toBeVisible();

  await page.getByRole("link", { name: "Open Current Latest Brief" }).click();
  await expect(page).toHaveURL(new RegExp(`/briefs/${phase9LatestBriefId}$`));
  await expect(page.getByText("Current latest saved brief").first()).toBeVisible();

  await page.goto(`/briefs/${phase9OlderBriefId}`);
  await expect(page.getByText("Older saved brief", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("A newer saved brief now exists for this tracked entry. This screen is replaying an older saved brief only.")
  ).toBeVisible();
});

test("watchlist entry detail exposes manual monitoring lifecycle and deterministic diff honestly", async ({ page }) => {
  await page.goto(`/watchlists?watchlistId=${phase9HistoryWatchlistId}&entryId=${phase9HistoryEntryId}`);
  await expect(page.getByText("Scheduled Refresh", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest Monitoring State")).toBeVisible();
  await expect(page.getByText("Refresh Lifecycle")).toBeVisible();
  await expect(page.getByText("Monitoring Attempts", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest Saved Brief", { exact: true })).toBeVisible();
  await expect(page.getByText("Previous Saved Brief", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved Brief History", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest saved brief still anchors the monitoring state")).toBeVisible();
  await expect(page.getByText("Weak comparison")).toBeVisible();
  await expect(page.getByText("Refresh failed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Reused cached result", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Broader product and GTM buildout", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Focused product hiring", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("The most recent monitoring attempt failed and did not create a replacement brief")
  ).toBeVisible();
  await expect(
    page.getByText("Simulated provider timeout during a manual refresh.", { exact: true }).last()
  ).toBeVisible();
  await expect(
    page.getByText(
      'Watchlist read changed from "Focused product hiring" to "Broader product and GTM buildout".'
    ).first()
  ).toBeVisible();
  await expect(page.getByText("Read confidence strengthened from Low to Medium.").first()).toBeVisible();
  await expect(page.getByText("Role evidence expanded from 2 observed openings to 4.").first()).toBeVisible();
  await expect(page.getByText(/Displayed proof-role evidence changed: added Account Executive/).first()).toBeVisible();
  await expect(
    page.getByText(
      "Comparison is weak because at least one of the compared briefs has weak company-match confidence."
    )
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Refresh Entry Manually" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Close Detail" })).toBeVisible();
});
