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

  test("source issue alert returns scan-problem language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "watch",
      latestBriefId: "brief-1",
      latestUnreadAlertPriority: "source_issue",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
      resultState: "provider_failure",
    });

    expect(copy.mainLine).toBe("Scan problem.");
    expect(copy.nextStep).toBe("Check source details.");
  });

  test("WAIT returns not-enough-signal language", () => {
    const copy = buildWatchlistActionCopy({
      verdict: "wait",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Tentative hiring signal",
    });

    expect(copy.mainLine).toBe("Not enough signal yet.");
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
    expect(copy.nextStep).toBe("Add or refresh this company to start tracking.");
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
    await expect(sourceAlertRow.getByText("Scan problem.", { exact: true })).toBeVisible();
    await expect(sourceAlertRow.getByTestId("watchlist-row-next-step")).toHaveText("Check source details.");

    const waitRow = page.getByTestId(`watchlist-row-${seededFixture.rows.wait.entryId}`);
    await expect(waitRow.getByText("WAIT", { exact: true })).toBeVisible();
    await expect(waitRow.getByTestId("watchlist-row-main-line")).toHaveText("Not enough signal yet.");
    await expect(waitRow.getByTestId("watchlist-row-next-step")).toHaveText("Keep it on the watchlist.");

    const ignoreRow = page.getByTestId(`watchlist-row-${seededFixture.rows.ignore.entryId}`);
    await expect(ignoreRow.getByText("IGNORE", { exact: true })).toBeVisible();
    await expect(ignoreRow.getByTestId("watchlist-row-main-line")).toHaveText("No useful hiring signal.");
    await expect(ignoreRow.getByTestId("watchlist-row-next-step")).toHaveText("No action needed.");

    const noBriefRow = page.getByTestId(`watchlist-row-${seededFixture.rows.noBrief.entryId}`);
    await expect(noBriefRow.getByTestId("watchlist-row-main-line")).toHaveText("No scan yet.");
    await expect(noBriefRow.getByTestId("watchlist-row-next-step")).toHaveText(
      "Add or refresh this company to start tracking."
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
