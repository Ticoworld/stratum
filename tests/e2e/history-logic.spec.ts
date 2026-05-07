import { test, expect } from "@playwright/test";
import { buildWatchlistEntryDiff } from "../../src/lib/watchlists/history";
import type { Job } from "../../src/lib/api/boards";
import type { WatchlistEntryBriefHistoryItem } from "../../src/lib/watchlists/history";

function mockJob(title: string, opts: Partial<Job> = {}): Job {
  return {
    title,
    location: "San Francisco, CA",
    department: "Engineering",
    source: "GREENHOUSE",
    roleId: null,
    roleIdType: null,
    requisitionId: null,
    jobUrl: null,
    applyUrl: null,
    sourceTimestamp: null,
    sourceTimestampType: null,
    observedAt: new Date().toISOString(),
    ...opts,
  };
}

function mockHistoryItem(jobs: Job[], proofRoles: Job[] = [], opts: Partial<WatchlistEntryBriefHistoryItem> = {}): WatchlistEntryBriefHistoryItem {
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
    proofRolesSnapshot: proofRoles,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...opts,
  };
}

test.describe("Watchlist History Change Detection Logic", () => {
  test("1. Full jobs comparison detects added roles outside proof snapshot", () => {
    const jobsPrev = [
      mockJob("Engineer A"),
      mockJob("Engineer B"),
      mockJob("Engineer C"),
      mockJob("Engineer D"),
      mockJob("Engineer E"),
    ];
    const jobsLatest = [
      ...jobsPrev,
      mockJob("Engineer F"), // Added outside proof snapshot
    ];
    
    // Proof snapshots only show top 5
    const proofPrev = jobsPrev.slice(0, 5);
    const proofLatest = jobsLatest.slice(0, 5);
    
    const prev = mockHistoryItem(jobsPrev, proofPrev);
    const latest = mockHistoryItem(jobsLatest, proofLatest);
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.summary).toContain("added Engineer F");
    expect(diff.changes.some(c => c.label === "Observed roles changed")).toBe(true);
  });

  test("2. Full jobs comparison detects removed roles outside proof snapshot", () => {
    const jobsPrev = [
      mockJob("Engineer A"),
      mockJob("Engineer B"),
      mockJob("Engineer C"),
      mockJob("Engineer D"),
      mockJob("Engineer E"),
      mockJob("Engineer F"), // To be removed
    ];
    const jobsLatest = [
      mockJob("Engineer A"),
      mockJob("Engineer B"),
      mockJob("Engineer C"),
      mockJob("Engineer D"),
      mockJob("Engineer E"),
    ];
    
    const proofPrev = jobsPrev.slice(0, 5);
    const proofLatest = jobsLatest.slice(0, 5);
    
    const prev = mockHistoryItem(jobsPrev, proofPrev);
    const latest = mockHistoryItem(jobsLatest, proofLatest);
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.summary).toContain("removed Engineer F");
  });

  test("3. Reordered roles do not create false added/removed changes", () => {
    const job1 = mockJob("Engineer A");
    const job2 = mockJob("Engineer B");
    
    const jobsPrev = [job1, job2];
    const jobsLatest = [job2, job1]; // Reordered
    
    const prev = mockHistoryItem(jobsPrev, jobsPrev);
    const latest = mockHistoryItem(jobsLatest, jobsLatest);
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    // Should NOT detect roles added/removed because identity is the same
    expect(diff.changes.some(c => c.category === "proof_roles_changed")).toBe(false);
  });

  test("4. Stable identity beats fallback identity", () => {
    const prevJob = mockJob("Engineer A", { roleId: "stable-1" });
    // Same stable ID, but title changed slightly
    const latestJob = mockJob("Engineer A (Updated)", { roleId: "stable-1" });
    
    const prev = mockHistoryItem([prevJob], [prevJob]);
    const latest = mockHistoryItem([latestJob], [latestJob]);
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    // Should NOT detect added/removed roles because IDs match
    expect(diff.changes.some(c => c.category === "proof_roles_changed")).toBe(false);
  });

  test("5. Missing full jobs is marked limited (weak)", () => {
    const jobs = [mockJob("Engineer A")];
    
    const prev = mockHistoryItem(jobs, jobs);
    const latest = mockHistoryItem([], jobs); // Missing full jobs snapshot in latest (legacy style)
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    expect(diff.comparisonStrength).toBe("weak");
    expect(diff.comparisonNotes[0]).toContain("Role-level comparison is limited");
  });

  test("6. Hiring mix shift is detected from full jobs", () => {
    const prevJobs = [mockJob("Sales A", { department: "Sales" }), mockJob("Sales B", { department: "Sales" }), mockJob("Sales C", { department: "Sales" })];
    const latestJobs = [
      ...prevJobs,
      mockJob("Eng A", { department: "Engineering" }),
      mockJob("Eng B", { department: "Engineering" }),
      mockJob("Eng C", { department: "Engineering" }),
    ];
    
    const prev = mockHistoryItem(prevJobs, [], {
      hiringMix: [{ department: "Sales", count: 3, sampleJobs: [] }]
    });
    const latest = mockHistoryItem(latestJobs, [], {
      hiringMix: [
        { department: "Sales", count: 3, sampleJobs: [] },
        { department: "Engineering", count: 3, sampleJobs: [] }
      ]
    });
    
    const diff = buildWatchlistEntryDiff(latest, prev);
    
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.summary).toContain("Engineering openings increased from 0 to 3");
  });
});
