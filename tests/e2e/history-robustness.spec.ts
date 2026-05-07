import { test, expect } from "@playwright/test";
import { buildWatchlistEntryDiff, toWatchlistEntryBriefHistoryItem } from "../../src/lib/watchlists/history";

test.describe("History Robustness Tests", () => {
  const baseSnapshot: any = {
    id: "brief-latest",
    queriedCompanyName: "Test",
    matchedCompanyName: "Test",
    resultState: "supported_provider_matched_with_observed_openings",
    companyMatchConfidence: "high",
    watchlistReadLabel: "Hiring",
    watchlistReadConfidence: "high",
    jobsObservedCount: 10,
    proofRolesSnapshot: [
      { title: "Engineer", source: "ashby", location: "SF", department: "Eng" }
    ],
    createdAt: new Date().toISOString(),
    resultSnapshot: {
      hiringMix: [{ department: "Eng", count: 10 }],
      jobs: [{ title: "Engineer", source: "ashby", location: "SF", department: "Eng" }]
    }
  };

  test("Should not crash when resultSnapshot is missing", () => {
    const legacySnapshot = { ...baseSnapshot };
    delete legacySnapshot.resultSnapshot;

    const latest = toWatchlistEntryBriefHistoryItem(legacySnapshot);
    const previous = toWatchlistEntryBriefHistoryItem(legacySnapshot);

    const diff = buildWatchlistEntryDiff(latest, previous);
    expect(diff.comparisonStrength).toBe("weak");
    expect(diff.comparisonNotes.length).toBeGreaterThan(0);
  });

  test("Should not crash when hiringMix is missing inside resultSnapshot", () => {
    const legacySnapshot = { 
      ...baseSnapshot,
      resultSnapshot: { jobs: baseSnapshot.resultSnapshot.jobs }
    };

    const latest = toWatchlistEntryBriefHistoryItem(legacySnapshot);
    const diff = buildWatchlistEntryDiff(latest, latest);
    expect(diff.comparisonAvailable).toBe(true);
  });

  test("Should not crash when proofRolesSnapshot is missing", () => {
    const legacySnapshot = { ...baseSnapshot };
    delete legacySnapshot.proofRolesSnapshot;

    const latest = toWatchlistEntryBriefHistoryItem(legacySnapshot);
    const diff = buildWatchlistEntryDiff(latest, latest);
    expect(diff.comparisonAvailable).toBe(true);
  });

  test("Should handle null/missing job fields safely", () => {
    const badJobSnapshot = {
      ...baseSnapshot,
      proofRolesSnapshot: [{ source: "ashby" }], // missing title, location, dept
      resultSnapshot: {
        jobs: [{ source: "ashby" }],
        hiringMix: [{ department: "Unknown", count: 1 }]
      }
    };

    const latest = toWatchlistEntryBriefHistoryItem(badJobSnapshot);
    const diff = buildWatchlistEntryDiff(latest, latest);
    expect(diff.comparisonAvailable).toBe(true);
    expect(diff.hasMaterialChange).toBe(false);
  });

  test("Should handle baseline behavior (only one brief)", () => {
    const latest = toWatchlistEntryBriefHistoryItem(baseSnapshot);
    const diff = buildWatchlistEntryDiff(latest, null);
    
    expect(diff.comparisonAvailable).toBe(false);
    expect(diff.comparisonStrength).toBe("unavailable");
    expect(diff.summary).toContain("No comparison available yet");
  });

  test("Should detect change even with partial data if jobsObservedCount differs", () => {
    const v1 = { ...baseSnapshot, jobsObservedCount: 5 };
    const v2 = { ...baseSnapshot, jobsObservedCount: 10 };

    const diff = buildWatchlistEntryDiff(
      toWatchlistEntryBriefHistoryItem(v2),
      toWatchlistEntryBriefHistoryItem(v1)
    );

    expect(diff.hasMaterialChange).toBe(true);
    const countChange = diff.changes.find(c => c.category === "open_roles_observed_changed");
    expect(countChange).toBeDefined();
    expect(countChange?.detail).toContain("expanded from 5 observed openings to 10");
  });
});
