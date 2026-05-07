import { test, expect } from "@playwright/test";
import { buildWatchlistEntryDiff } from "../../src/lib/watchlists/history";
import type { WatchlistEntryBriefHistoryItem } from "../../src/lib/watchlists/history";
import type { Job } from "../../src/lib/api/boards";

function mockJob(title: string, opts: Partial<Job> = {}): Job {
  return {
    title,
    location: "San Francisco, CA",
    department: "Engineering",
    source: "GREENHOUSE",
    roleId: null,
    roleIdType: null,
    requisitionId: null,
    jobUrl: opts.jobUrl || "http://test.com/stable",
    applyUrl: null,
    sourceTimestamp: null,
    sourceTimestampType: null,
    observedAt: new Date().toISOString(),
    ...opts,
  };
}

function mockHistoryItem(jobs: Job[], opts: Partial<WatchlistEntryBriefHistoryItem> = {}): WatchlistEntryBriefHistoryItem {
  return {
    id: "test-id",
    queriedCompanyName: "Test Co",
    matchedCompanyName: "Test Co",
    atsSourceUsed: "GREENHOUSE",
    resultState: "supported_provider_matched_with_observed_openings",
    companyMatchConfidence: "high",
    sourceCoverageCompleteness: "single_matched_provider_only",
    watchlistReadLabel: "Product and engineering buildout signal",
    watchlistReadSummary: "Summary",
    watchlistReadConfidence: "high",
    proofRoleGrounding: "exact",
    jobsObservedCount: jobs.length,
    hiringMix: [],
    allJobsSnapshot: jobs,
    proofRolesSnapshot: jobs.slice(0, 5),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...opts,
  };
}

test.describe("Strategic Significance & Tiered Dampening (Phase 5.8)", () => {
  
  test("A. Giant board minor churn is not significant", () => {
    // 832 roles -> 844 roles (delta 12, ~1.4%)
    const jobsPrev = Array(832).fill(0).map((_, i) => mockJob(`Engineer ${i}`));
    const jobsLatest = [...jobsPrev, ...Array(12).fill(0).map((_, i) => mockJob(`New ${i}`))];
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.hasSignificantChange).toBe(false);
    expect(diff.significanceDrivers.length).toBe(0);
  });

  test("B. Giant board meaningful growth is significant", () => {
    // 832 -> 874 (delta 42, > 5% and > 20 roles)
    const jobsPrev = Array(832).fill(0).map((_, i) => mockJob(`Engineer ${i}`));
    const jobsLatest = [...jobsPrev, ...Array(50).fill(0).map((_, i) => mockJob(`New ${i}`))];
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasSignificantChange).toBe(true);
    expect(diff.significanceDrivers).toContain("count");
  });

  test("C. Metadata-only change is not significant", () => {
    const jobs = [mockJob("Engineer")];
    const prev = mockHistoryItem(jobs, { watchlistReadLabel: "Old Label" });
    const latest = mockHistoryItem(jobs, { watchlistReadLabel: "New Label" });
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.hasSignificantChange).toBe(false);
    expect(diff.significanceDrivers.length).toBe(0);
  });

  test("D. Large board small delta is not significant", () => {
    // 79 -> 81 (delta 2, < 5 roles)
    const jobsPrev = Array(79).fill(0).map((_, i) => mockJob(`Engineer ${i}`));
    const jobsLatest = [...jobsPrev, mockJob("Eng 80"), mockJob("Eng 81")];
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasSignificantChange).toBe(false);
  });

  test("E. Medium board (20 roles) +1 is not significant", () => {
    const jobsPrev = Array(20).fill(0).map((_, i) => mockJob(`Engineer ${i}`));
    const jobsLatest = [...jobsPrev, mockJob("New")];
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasSignificantChange).toBe(false);
  });

  test("F. Small board (4 roles) +1 is significant", () => {
    const jobsPrev = Array(4).fill(0).map((_, i) => mockJob(`Engineer ${i}`));
    const jobsLatest = [...jobsPrev, mockJob("New")];
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasSignificantChange).toBe(true);
    expect(diff.significanceDrivers).toContain("count");
  });

  test("G. Source change does not trigger significance alone", () => {
    const jobs = [mockJob("Engineer")];
    const prev = mockHistoryItem(jobs, { atsSourceUsed: "GREENHOUSE" });
    const latest = mockHistoryItem(jobs, { atsSourceUsed: "ASHBY" });
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.hasSignificantChange).toBe(false);
  });

  test("H. Geography shift without roles is not significant", () => {
    const jobsPrev = [mockJob("A", { location: "NY" }), mockJob("B", { location: "NY" })];
    const jobsLatest = [mockJob("A", { location: "NY" }), mockJob("B", { location: "SF" })]; // Same count, same roles, just location swap
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.hasSignificantChange).toBe(false);
  });
});
