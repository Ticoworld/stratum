import { test, expect } from "@playwright/test";
import { buildWatchlistDailySummary } from "../../src/lib/watchlists/dailySummary";
import type { WatchlistEntryOverview } from "../../src/lib/watchlists/repository";

const NOW = new Date("2026-06-10T12:00:00.000Z").getTime();

function baseEntry(overrides: Partial<WatchlistEntryOverview>): WatchlistEntryOverview {
  return {
    id: "entry-1",
    watchlistId: "watchlist-1",
    requestedQuery: "Acme",
    normalizedQuery: "acme",
    scheduleCadence: "off",
    scheduleNextRunAt: null,
    scheduleConsecutiveFailures: 0,
    scheduleLeaseExpiresAt: null,
    latestBriefId: null,
    latestMatchedCompanyName: null,
    latestResultState: null,
    latestWatchlistReadLabel: null,
    latestWatchlistReadConfidence: null,
    latestAtsSourceUsed: null,
    latestBriefCreatedAt: null,
    latestBriefUpdatedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test.describe("buildWatchlistDailySummary — empty input", () => {
  test("T-DS1: no entries → null", () => {
    expect(buildWatchlistDailySummary([], NOW)).toBeNull();
  });
});

test.describe("buildWatchlistDailySummary — needs attention (ACT)", () => {
  test("T-DS2: single ACT row leads with company name and mainLine", () => {
    const entry = baseEntry({
      requestedQuery: "Ramp",
      latestMatchedCompanyName: "Ramp",
      latestBriefId: "brief-1",
      latestSignalVerdict: "act",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 68,
      previousObservedJobsCount: 50,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 68,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary).not.toBeNull();
    expect(summary!.primaryLine).toBe("1 company needs attention.");
    expect(summary!.detailLine).toBe("Start with Ramp: Sales hiring grew from 50 to 68 jobs.");
  });

  test("T-DS3: multiple ACT rows are counted, first one is highlighted", () => {
    const ramp = baseEntry({
      id: "entry-ramp",
      requestedQuery: "Ramp",
      latestMatchedCompanyName: "Ramp",
      latestBriefId: "brief-1",
      latestSignalVerdict: "act",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 68,
      previousObservedJobsCount: 50,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 68,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    });
    const brex = baseEntry({
      id: "entry-brex",
      requestedQuery: "Brex",
      latestMatchedCompanyName: "Brex",
      latestBriefId: "brief-2",
      latestSignalVerdict: "act",
      latestWatchlistReadLabel: "Engineering-led",
    });

    const summary = buildWatchlistDailySummary([ramp, brex], NOW);

    expect(summary!.primaryLine).toBe("2 companies need attention.");
    expect(summary!.detailLine.startsWith("Start with Ramp:")).toBe(true);
  });

  test("T-DS4: ACT outranks source issues and stable rows", () => {
    const act = baseEntry({
      id: "entry-act",
      requestedQuery: "Ramp",
      latestMatchedCompanyName: "Ramp",
      latestBriefId: "brief-1",
      latestSignalVerdict: "act",
      latestObservedJobsCount: 68,
      previousObservedJobsCount: 50,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 68,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    });
    const sourceIssue = baseEntry({
      id: "entry-source",
      requestedQuery: "Vendor Co",
      latestBriefId: "brief-2",
      latestSignalVerdict: "verify_source",
    });

    const summary = buildWatchlistDailySummary([sourceIssue, act], NOW);

    expect(summary!.primaryLine).toBe("1 company needs attention.");
  });
});

test.describe("buildWatchlistDailySummary — source issues", () => {
  test("T-DS5: VERIFY SOURCE rows surface a source-check message", () => {
    const entry = baseEntry({
      requestedQuery: "Vendor Co",
      latestBriefId: "brief-1",
      latestSignalVerdict: "verify_source",
    });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary!.primaryLine).toBe("1 company needs source checks.");
    expect(summary!.detailLine).toBe("Check the source before using those signals.");
  });

  test("T-DS6: multiple source issue rows are counted with plural copy", () => {
    const a = baseEntry({
      id: "entry-a",
      requestedQuery: "Vendor A",
      latestBriefId: "brief-a",
      latestSignalVerdict: "verify_source",
    });
    const b = baseEntry({
      id: "entry-b",
      requestedQuery: "Vendor B",
      latestBriefId: "brief-b",
      latestResultState: "provider_failure",
      latestSignalVerdict: "watch",
    });

    const summary = buildWatchlistDailySummary([a, b], NOW);

    expect(summary!.primaryLine).toBe("2 companies need source checks.");
  });
});

test.describe("buildWatchlistDailySummary — due now", () => {
  test("T-DS7: overdue scheduled checks surface ahead of stable rows", () => {
    const due = baseEntry({
      id: "entry-due",
      requestedQuery: "Acme",
      latestBriefId: "brief-1",
      latestSignalVerdict: "watch",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 10,
      previousObservedJobsCount: 10,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 10,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 10,
      scheduleCadence: "daily",
      scheduleNextRunAt: "2026-06-10T11:00:00.000Z",
    });

    const summary = buildWatchlistDailySummary([due], NOW);

    expect(summary!.primaryLine).toBe("1 check is due now.");
    expect(summary!.detailLine).toBe("Run them to see what changed.");
  });

  test("T-DS8: future scheduled checks are not treated as due now", () => {
    const notDue = baseEntry({
      id: "entry-not-due",
      requestedQuery: "Acme",
      latestBriefId: "brief-1",
      latestSignalVerdict: "watch",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 10,
      previousObservedJobsCount: 10,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 10,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 10,
      scheduleCadence: "daily",
      scheduleNextRunAt: "2026-06-11T11:00:00.000Z",
    });

    const summary = buildWatchlistDailySummary([notDue], NOW);

    expect(summary!.primaryLine).toBe("No urgent changes today.");
    expect(summary!.detailLine).toBe("1 company is still worth watching.");
  });
});

test.describe("buildWatchlistDailySummary — first scans", () => {
  test("T-DS9: a single first scan row uses singular copy", () => {
    const entry = baseEntry({
      requestedQuery: "Acme",
      latestBriefId: "brief-1",
      latestSignalVerdict: "watch",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 111,
    });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary!.primaryLine).toBe("1 first scan is ready.");
    expect(summary!.detailLine).toBe("Use it as a baseline for future changes.");
  });

  test("T-DS9b: a legacy entry with a brief but no verdict and no prior data counts as a first scan", () => {
    const entry = baseEntry({
      requestedQuery: "Acme",
      latestBriefId: "brief-1",
      latestSignalVerdict: null,
      latestResultState: "supported_provider_matched_with_observed_openings",
    });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary!.primaryLine).toBe("1 first scan is ready.");
    expect(summary!.detailLine).toBe("Use it as a baseline for future changes.");
  });

  test("T-DS9c: a digest alert with no prior data is not a first scan (avoids relying on mainLine wording)", () => {
    const entry = baseEntry({
      requestedQuery: "Acme",
      latestBriefId: "brief-1",
      latestSignalVerdict: "watch",
      latestUnreadAlertPriority: "digest",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 111,
    });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary!.primaryLine).toBe("No urgent changes today.");
    expect(summary!.detailLine).toBe("1 company is still worth watching.");
  });

  test("T-DS10: multiple first scans use plural copy", () => {
    const a = baseEntry({
      id: "entry-a",
      requestedQuery: "Acme",
      latestBriefId: "brief-a",
      latestSignalVerdict: "watch",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 111,
    });
    const b = baseEntry({
      id: "entry-b",
      requestedQuery: "Globex",
      latestBriefId: "brief-b",
      latestSignalVerdict: "watch",
      latestWatchlistReadLabel: "Engineering-led",
      latestObservedJobsCount: 42,
    });
    const c = baseEntry({
      id: "entry-c",
      requestedQuery: "Initech",
      latestBriefId: "brief-c",
      latestSignalVerdict: "watch",
      latestObservedJobsCount: 5,
    });

    const summary = buildWatchlistDailySummary([a, b, c], NOW);

    expect(summary!.primaryLine).toBe("3 first scans are ready.");
  });
});

test.describe("buildWatchlistDailySummary — stable WATCH rows", () => {
  test("T-DS11: 'still leads, no major change' rows are reported as stable", () => {
    const entry = baseEntry({
      requestedQuery: "Acme",
      latestBriefId: "brief-1",
      latestSignalVerdict: "watch",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 111,
      previousObservedJobsCount: 111,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 60,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 60,
    });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary!.primaryLine).toBe("No urgent changes today.");
    expect(summary!.detailLine).toBe("1 company is still worth watching.");
  });

  test("T-DS12: stable rows outrank rows with no scan yet", () => {
    const stable = baseEntry({
      id: "entry-stable",
      requestedQuery: "Acme",
      latestBriefId: "brief-1",
      latestSignalVerdict: "watch",
      latestWatchlistReadLabel: "Sales-led",
      latestObservedJobsCount: 111,
      previousObservedJobsCount: 111,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 60,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 60,
    });
    const notStarted = baseEntry({ id: "entry-not-started", requestedQuery: "Globex" });

    const summary = buildWatchlistDailySummary([notStarted, stable], NOW);

    expect(summary!.detailLine).toBe("1 company is still worth watching.");
  });
});

test.describe("buildWatchlistDailySummary — no scans yet", () => {
  test("T-DS13: rows with no scan yet are reported when nothing else is present", () => {
    const a = baseEntry({ id: "entry-a", requestedQuery: "Acme" });
    const b = baseEntry({ id: "entry-b", requestedQuery: "Globex" });

    const summary = buildWatchlistDailySummary([a, b], NOW);

    expect(summary!.primaryLine).toBe("No urgent changes today.");
    expect(summary!.detailLine).toBe("2 companies have no scan yet.");
  });

  test("T-DS14: single row with no scan yet uses singular copy", () => {
    const entry = baseEntry({ requestedQuery: "Acme" });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary!.detailLine).toBe("1 company has no scan yet.");
  });

  test("T-DS15: a result-state-only row with no saved brief counts as no scan yet", () => {
    const entry = baseEntry({
      requestedQuery: "Acme",
      latestBriefId: null,
      latestResultState: "supported_provider_matched_with_zero_observed_openings",
    });

    const summary = buildWatchlistDailySummary([entry], NOW);

    expect(summary!.primaryLine).toBe("No urgent changes today.");
    expect(summary!.detailLine).toBe("1 company has no scan yet.");
  });
});
