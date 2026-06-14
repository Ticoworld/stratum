import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test, type Page } from "@playwright/test";
import { buildWatchlistActionCopy } from "@/lib/watchlists/watchlistActionCopy";

type Persona = {
  userId: string;
  tenantId: string;
  role: "owner" | "analyst" | "viewer";
  email: string;
  name: string;
};

type SeededRow = {
  entryId: string;
  companyName: string;
  briefId: string | null;
};

type WatchlistActionCopyFixture = {
  ownerPersona: Persona;
  watchlistId: string;
  rows: {
    noBrief: SeededRow;
    watch: SeededRow;
    act: SeededRow;
    verify: SeededRow;
    sourceAlert: SeededRow;
    wait: SeededRow;
    ignore: SeededRow;
  };
};

const baseURL = process.env.STRATUM_E2E_BASE_URL ?? "http://127.0.0.1:3002";
const sessionCookieName = "authjs.session-token";
const sessionSalt = sessionCookieName;
const runKey = `watchlist-action-copy-${Date.now()}-${randomUUID().slice(0, 8)}`;

let ownerPersona: Persona | null = null;
let seededFixture: WatchlistActionCopyFixture | null = null;

async function mintSessionToken(persona: Persona): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for watchlist action-copy verification.");
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

async function bootstrapWatchlistActionCopyFixture(): Promise<WatchlistActionCopyFixture> {
  const response = await fetch(`${baseURL}/api/test/e2e/watchlist-action-copy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ runKey }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; error?: string; data?: WatchlistActionCopyFixture }
    | null;

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error ?? "Watchlist action-copy fixture bootstrap failed.");
  }

  return payload.data;
}

test.describe("buildWatchlistActionCopy", () => {
  test("ACT returns an action-oriented next step", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "act",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
    });

    expect(copy.mainLine).toBe("Sales hiring increased since last scan.");
    expect(copy.nextStep).toBe("Use this for account research or outreach timing.");
  });

  test("ACT later scan uses top bucket growth when available", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "act",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 68,
      previousObservedJobsCount: 50,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 68,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    });

    expect(copy.mainLine).toBe("Sales hiring grew from 50 to 68 jobs.");
    expect(copy.nextStep).toBe("Use this for account timing.");
  });

  test("ACT later scan falls back to total growth when the bucket is unknown", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "act",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 140,
      previousObservedJobsCount: 111,
    });

    expect(copy.mainLine).toBe("Hiring grew from 111 to 140 jobs.");
    expect(copy.nextStep).toBe("Use this for account research.");
  });

  test("ACT later scan uses top bucket shift when the lead changes", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "act",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 72,
      previousObservedJobsCount: 68,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 34,
      previousTopHiringBucket: "Engineering",
      previousTopHiringBucketCount: 36,
    });

    expect(copy.mainLine).toBe("Hiring shifted from Engineering to Sales.");
    expect(copy.nextStep).toBe("Check the brief before acting.");
  });

  test("WATCH first scan returns wait-for-next-scan language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
    });

    expect(copy.mainLine).toBe("Sales-led first scan.");
    expect(copy.nextStep).toBe("Wait for the next scan to see what changed.");
  });

  test("WATCH first scan includes observed job count when available", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
      latestObservedJobsCount: 111,
    });

    expect(copy.mainLine).toBe("Sales-led first scan, 111 jobs.");
    expect(copy.nextStep).toBe("Wait for the next scan to see what changed.");
  });

  test("WATCH first scan falls back to count without a pattern", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: null,
      latestObservedJobsCount: 111,
    });

    expect(copy.mainLine).toBe("First scan, 111 jobs.");
    expect(copy.nextStep).toBe("Wait for the next scan to see what changed.");
  });

  test("WATCH with a digest alert returns keep-tracking language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestUnreadAlertPriority: "digest",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
    });

    expect(copy.mainLine).toBe("Still watching. No major change yet.");
    expect(copy.nextStep).toBe("Keep tracking.");
  });

  test("WATCH later scan with no previous count keeps tracking", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestUnreadAlertPriority: "digest",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
    });

    expect(copy.mainLine).toBe("Still watching. No major change yet.");
    expect(copy.nextStep).toBe("Keep tracking.");
  });

  test("WATCH later scan with no major change stays simple", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 111,
      previousObservedJobsCount: 111,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 50,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    });

    expect(copy.mainLine).toBe("Sales still leads. No major change since last scan.");
    expect(copy.nextStep).toBe("Keep watching.");
  });

  test("WATCH later scan with a small shift still names the stable lead", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 112,
      previousObservedJobsCount: 111,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 49,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    });

    expect(copy.mainLine).toBe("Sales still leads. No major change since last scan.");
    expect(copy.nextStep).toBe("Keep watching.");
  });

  test("WATCH later scan with a smaller change keeps watching", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 68,
      previousObservedJobsCount: 66,
      latestTopHiringBucket: "Engineering",
      latestTopHiringBucketCount: 18,
      previousTopHiringBucket: "Engineering",
      previousTopHiringBucketCount: 16,
    });

    expect(copy.mainLine).toBe("Engineering hiring changed slightly.");
    expect(copy.nextStep).toBe("Keep watching.");
  });

  test("WATCH later scan with a total drop keeps watching", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 90,
      previousObservedJobsCount: 111,
    });

    expect(copy.mainLine).toBe("Hiring dropped from 111 to 90 jobs.");
    expect(copy.nextStep).toBe("Keep watching unless the drop matters to your workflow.");
  });

  test("VERIFY SOURCE returns check-source language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "verify_source",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Source needs verification",
      resultState: "unsupported_ats_or_source_pattern",
    });

    expect(copy.mainLine).toBe("Source needs checking.");
    expect(copy.nextStep).toBe("Check the source before using this.");
  });

  test("source issue alert returns refresh-failed language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestUnreadAlertPriority: "source_issue",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
      resultState: "provider_failure",
    });

    expect(copy.mainLine).toBe("Refresh failed.");
    expect(copy.nextStep).toBe("Check the source before using this signal.");
  });

  test("WAIT returns not-enough-signal language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "wait",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Tentative hiring signal",
    });

    expect(copy.mainLine).toBe("Not enough hiring data yet.");
    expect(copy.nextStep).toBe("Keep it on the watchlist.");
  });

  test("IGNORE returns no-action language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "ignore",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Thin hiring signal",
    });

    expect(copy.mainLine).toBe("No useful hiring signal.");
    expect(copy.nextStep).toBe("No action needed.");
  });

  test("no brief returns start-tracking language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: null,
      latestWatchlistReadLabel: null,
    });

    expect(copy.mainLine).toBe("No scan yet.");
    expect(copy.nextStep).toBe("Refresh to run the first check.");
  });

  test("returned copy stays free of internal terms", () => {
    const outputs = [
      buildWatchlistActionCopy({
        verdict: "act",
        latestBriefId: "brief-1",
        latestWatchlistReadLabel: "Broader product and GTM buildout",
      }),
      buildWatchlistActionCopy({
        verdict: "watch",
        latestBriefId: "brief-1",
        latestWatchlistReadLabel: "Broader product and GTM buildout",
      }),
      buildWatchlistActionCopy({
        verdict: "verify_source",
        latestBriefId: "brief-1",
      }),
      buildWatchlistActionCopy({
        verdict: "wait",
        latestBriefId: "brief-1",
      }),
      buildWatchlistActionCopy({
        verdict: "ignore",
        latestBriefId: "brief-1",
      }),
      buildWatchlistActionCopy({
        verdict: "watch",
        latestBriefId: null,
      }),
    ];

    const text = outputs.flatMap((entry) => [entry.mainLine, entry.nextStep]).join(" ").toLowerCase();
    for (const banned of [
      "result state",
      "monitoring state",
      "signal clarity",
      "evidence quality",
      "public use",
      "caveats",
      "material movement",
      "proof basis",
      "baseline still forming",
      "diff",
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});

test.describe("Watchlist signal inbox action copy", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    seededFixture = await bootstrapWatchlistActionCopyFixture();
    ownerPersona = seededFixture.ownerPersona;
  });

  test.beforeEach(async ({ page }) => {
    if (!ownerPersona) {
      throw new Error("Owner persona was not initialized.");
    }

    await authenticate(page, ownerPersona);
  });

  test("rows show main lines, next steps, and no internal wording", async ({ page }) => {
    if (!seededFixture) {
      throw new Error("Watchlist action-copy fixture was not initialized.");
    }

    await page.goto(`/watchlists?watchlistId=${seededFixture.watchlistId}`);

    const inbox = page.getByTestId("watchlist-signal-inbox");
    await expect(inbox).toBeVisible();

    const watchRow = page.getByTestId(`watchlist-row-${seededFixture.rows.watch.entryId}`);
    await expect(watchRow.getByText("WATCH", { exact: true })).toBeVisible();
    await expect(watchRow.getByTestId("watchlist-row-main-line")).toHaveText(
      "Sales-led first scan, 111 jobs."
    );
    await expect(watchRow.getByTestId("watchlist-row-next-step")).toHaveText(
      "Wait for the next scan to see what changed."
    );
    await expect(watchRow.getByRole("link", { name: "Brief", exact: true })).toBeVisible();

    const actRow = page.getByTestId(`watchlist-row-${seededFixture.rows.act.entryId}`);
    await expect(actRow.getByText("ACT", { exact: true })).toBeVisible();
    await expect(actRow.getByTestId("watchlist-row-main-line")).toHaveText(
      "Sales hiring increased since last scan."
    );
    await expect(actRow.getByTestId("watchlist-row-next-step")).toHaveText(
      "Use this for account research or outreach timing."
    );

    const verifyRow = page.getByTestId(`watchlist-row-${seededFixture.rows.verify.entryId}`);
    await expect(verifyRow.getByText("VERIFY SOURCE", { exact: true })).toBeVisible();
    await expect(verifyRow.getByTestId("watchlist-row-main-line")).toHaveText("Source needs checking.");
    await expect(verifyRow.getByTestId("watchlist-row-next-step")).toHaveText(
      "Check the source before using this."
    );

    const sourceAlertRow = page.getByTestId(`watchlist-row-${seededFixture.rows.sourceAlert.entryId}`);
    await expect(sourceAlertRow.getByText("Refresh failed.", { exact: true })).toBeVisible();
    await expect(sourceAlertRow.getByTestId("watchlist-row-next-step")).toHaveText("Check the source before using this signal.");

    const waitRow = page.getByTestId(`watchlist-row-${seededFixture.rows.wait.entryId}`);
    await expect(waitRow.getByText("WAIT", { exact: true })).toBeVisible();
    await expect(waitRow.getByTestId("watchlist-row-main-line")).toHaveText(
      "Not enough hiring data yet."
    );
    await expect(waitRow.getByTestId("watchlist-row-next-step")).toHaveText("Keep it on the watchlist.");

    const ignoreRow = page.getByTestId(`watchlist-row-${seededFixture.rows.ignore.entryId}`);
    await expect(ignoreRow.getByText("IGNORE", { exact: true })).toBeVisible();
    await expect(ignoreRow.getByTestId("watchlist-row-main-line")).toHaveText("No useful hiring signal.");
    await expect(ignoreRow.getByTestId("watchlist-row-next-step")).toHaveText("No action needed.");

    const noBriefRow = page.getByTestId(`watchlist-row-${seededFixture.rows.noBrief.entryId}`);
    await expect(noBriefRow.getByTestId("watchlist-row-main-line")).toHaveText("No scan yet.");
    await expect(noBriefRow.getByTestId("watchlist-row-next-step")).toHaveText(
      "Refresh to run the first check."
    );
    await expect(noBriefRow.getByRole("link", { name: "Brief", exact: true })).toHaveCount(0);

    for (const banned of [
      "result state",
      "monitoring state",
      "signal clarity",
      "evidence quality",
      "public use",
      "caveats",
    ]) {
      await expect(inbox.getByText(banned, { exact: false })).toHaveCount(0);
    }
  });
});
