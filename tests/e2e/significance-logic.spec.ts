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
    expect(diff.changeDirection).toBe("minor_movement");
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
    expect(diff.changeDirection).toBe("expansion");
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
    expect(diff.changeDirection).toBe("expansion");
  });

  test("G. Source change does not trigger significance alone", () => {
    const jobs = [mockJob("Engineer")];
    const prev = mockHistoryItem(jobs, { atsSourceUsed: "GREENHOUSE" });
    const latest = mockHistoryItem(jobs, { atsSourceUsed: "ASHBY" });
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.hasSignificantChange).toBe(false);
    expect(diff.changeDirection).toBe("limited");
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
    expect(diff.changeDirection).toBe("minor_movement");
  });

  test("I. Large board minor mix shift is not significant", () => {
    const jobsPrev = [
      ...Array(40).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(10).fill(0).map((_, i) => mockJob(`PM ${i}`, { department: "Product" })),
      ...Array(24).fill(0).map((_, i) => mockJob(`Ops ${i}`, { department: "Operations" })),
      ...Array(5).fill(0).map((_, i) => mockJob(`MFB ${i}`, { department: "MFB" })),
    ];
    const jobsLatest = [
      ...Array(40).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(10).fill(0).map((_, i) => mockJob(`PM ${i}`, { department: "Product" })),
      ...Array(24).fill(0).map((_, i) => mockJob(`Ops ${i}`, { department: "Operations" })),
      ...Array(2).fill(0).map((_, i) => mockJob(`MFB ${i}`, { department: "MFB" })),
    ];
    
    const prevHistory = mockHistoryItem(jobsPrev);
    prevHistory.hiringMix = [
      { department: "Engineering", count: 40, sampleJobs: [] },
      { department: "Operations", count: 24, sampleJobs: [] },
      { department: "Product", count: 10, sampleJobs: [] },
      { department: "MFB", count: 5, sampleJobs: [] }
    ];
    const latestHistory = mockHistoryItem(jobsLatest);
    latestHistory.hiringMix = [
      { department: "Engineering", count: 40, sampleJobs: [] },
      { department: "Operations", count: 24, sampleJobs: [] },
      { department: "Product", count: 10, sampleJobs: [] },
      { department: "MFB", count: 2, sampleJobs: [] }
    ];

    const diff = buildWatchlistEntryDiff(latestHistory, prevHistory);
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.hasSignificantChange).toBe(false);
    expect(diff.significanceDrivers).not.toContain("mix");
    expect(diff.changeDirection).toBe("minor_movement");
  });

  test("J. Large board meaningful mix shift is significant", () => {
    const jobsPrev = [
      ...Array(20).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(59).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    const jobsLatest = [
      ...Array(30).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(49).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    
    const prevHistory = mockHistoryItem(jobsPrev);
    prevHistory.hiringMix = [
      { department: "Other", count: 59, sampleJobs: [] },
      { department: "Engineering", count: 20, sampleJobs: [] },
    ];
    const latestHistory = mockHistoryItem(jobsLatest);
    latestHistory.hiringMix = [
      { department: "Other", count: 49, sampleJobs: [] },
      { department: "Engineering", count: 30, sampleJobs: [] },
    ];

    const diff = buildWatchlistEntryDiff(latestHistory, prevHistory);
    
    expect(diff.hasSignificantChange).toBe(true);
    expect(diff.significanceDrivers).toContain("mix");
    expect(diff.changeDirection).toBe("mix_shift");
  });

  test("K. Giant board minor mix shift is not significant", () => {
    const jobsPrev = [
      ...Array(120).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(712).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    const jobsLatest = [
      ...Array(130).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(702).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    
    const prevHistory = mockHistoryItem(jobsPrev);
    prevHistory.hiringMix = [
      { department: "Other", count: 712, sampleJobs: [] },
      { department: "Engineering", count: 120, sampleJobs: [] },
    ];
    const latestHistory = mockHistoryItem(jobsLatest);
    latestHistory.hiringMix = [
      { department: "Other", count: 702, sampleJobs: [] },
      { department: "Engineering", count: 130, sampleJobs: [] },
    ];

    const diff = buildWatchlistEntryDiff(latestHistory, prevHistory);
    
    expect(diff.significanceDrivers).not.toContain("mix");
  });

  test("L. Giant board meaningful mix shift is significant", () => {
    const jobsPrev = [
      ...Array(120).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(712).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    const jobsLatest = [
      ...Array(170).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(662).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    
    const prevHistory = mockHistoryItem(jobsPrev);
    prevHistory.hiringMix = [
      { department: "Other", count: 712, sampleJobs: [] },
      { department: "Engineering", count: 120, sampleJobs: [] },
    ];
    const latestHistory = mockHistoryItem(jobsLatest);
    latestHistory.hiringMix = [
      { department: "Other", count: 662, sampleJobs: [] },
      { department: "Engineering", count: 170, sampleJobs: [] },
    ];

    const diff = buildWatchlistEntryDiff(latestHistory, prevHistory);
    
    expect(diff.significanceDrivers).toContain("mix");
  });

  test("M. Small board mix shift remains sensitive", () => {
    const jobsPrev = [
      ...Array(4).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(5).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    const jobsLatest = [
      ...Array(5).fill(0).map((_, i) => mockJob(`Engineer ${i}`, { department: "Engineering" })),
      ...Array(4).fill(0).map((_, i) => mockJob(`Other ${i}`, { department: "Other" })),
    ];
    
    const prevHistory = mockHistoryItem(jobsPrev);
    prevHistory.hiringMix = [
      { department: "Other", count: 5, sampleJobs: [] },
      { department: "Engineering", count: 4, sampleJobs: [] },
    ];
    const latestHistory = mockHistoryItem(jobsLatest);
    latestHistory.hiringMix = [
      { department: "Engineering", count: 5, sampleJobs: [] },
      { department: "Other", count: 4, sampleJobs: [] },
    ];

    const diff = buildWatchlistEntryDiff(latestHistory, prevHistory);
    
    expect(diff.significanceDrivers).toContain("mix");
    expect(diff.changeDirection).toBe("mix_shift");
  });

  test("N. Significant headcount contraction", () => {
    // 63 -> 56 (delta -7, > 5 roles and significant delta)
    const jobsPrev = Array(63).fill(0).map((_, i) => mockJob(`Engineer ${i}`));
    const jobsLatest = jobsPrev.slice(0, 56);
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasSignificantChange).toBe(true);
    expect(diff.significanceDrivers).toContain("count");
    expect(diff.changeDirection).toBe("contraction");
  });

  test("O. Replacement churn (Stable count, many role changes)", () => {
    // 20 roles, 10 removed, 10 added -> Total delta 20 vs board 20
    const jobsPrev = Array(20).fill(0).map((_, i) => mockJob(`Old ${i}`, { jobUrl: `url-${i}` }));
    const jobsLatest = [
      ...jobsPrev.slice(0, 10),
      ...Array(10).fill(0).map((_, i) => mockJob(`New ${i}`, { jobUrl: `new-url-${i}` }))
    ];
    
    const diff = buildWatchlistEntryDiff(
      mockHistoryItem(jobsLatest),
      mockHistoryItem(jobsPrev)
    );
    
    expect(diff.hasSignificantChange).toBe(true);
    expect(diff.significanceDrivers).toContain("roles");
    expect(diff.changeDirection).toBe("replacement_churn");
  });
});
