import { test, expect } from "@playwright/test";
import { buildWatchlistEntryDiff } from "../../src/lib/watchlists/history";
import { computeFunctionalMix } from "../../src/lib/signals/watchlistTaxonomy";
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

  test("6. Source department shift is detected from full jobs", () => {
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
    // The department-movement substring must still appear in the summary
    expect(diff.summary).toContain("Engineering openings increased from 0 to 3");
    // Phase 6B-2A: verify the new wording and category
    expect(diff.summary).toContain("Source department activity shifted");
    expect(diff.summary).not.toContain("Visible hiring mix shifted");
    expect(diff.changes.some(c => c.category === "source_department_activity_changed")).toBe(true);
    expect(diff.changes.some(c => c.label === "Source department activity shifted")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6B-2A: source department activity wording regression guard
// ---------------------------------------------------------------------------

test.describe("6B-2A: Source department activity wording", () => {
  // These tests verify that the change summary section uses the new wording that
  // makes clear the comparison is raw ATS department data, not the functional
  // Hiring Mix chart buckets. Numbers are not comparable across the two views.

  test("Mix-shift detail uses 'Source department activity shifted', not 'Visible hiring mix shifted'", () => {
    const prevJobs = [
      mockJob("Sales A", { department: "Sales" }),
      mockJob("Sales B", { department: "Sales" }),
      mockJob("Sales C", { department: "Sales" }),
    ];
    const latestJobs = [
      ...prevJobs,
      mockJob("Eng A", { department: "Engineering" }),
      mockJob("Eng B", { department: "Engineering" }),
      mockJob("Eng C", { department: "Engineering" }),
    ];

    const prev = mockHistoryItem(prevJobs, [], {
      hiringMix: [{ department: "Sales", count: 3, sampleJobs: [] }],
    });
    const latest = mockHistoryItem(latestJobs, [], {
      hiringMix: [
        { department: "Sales", count: 3, sampleJobs: [] },
        { department: "Engineering", count: 3, sampleJobs: [] },
      ],
    });

    const diff = buildWatchlistEntryDiff(latest, prev);
    const mixChange = diff.changes.find(c => c.category === "source_department_activity_changed");

    expect(mixChange).toBeDefined();
    expect(mixChange!.label).toBe("Source department activity shifted");
    expect(mixChange!.detail).toContain("Source department activity shifted");
    expect(mixChange!.detail).not.toContain("Visible hiring mix shifted");
    expect(mixChange!.detail).not.toContain("Hiring mix shifted");
    // Department-level movement text is still present
    expect(mixChange!.detail).toContain("Engineering openings increased from 0 to 3");
  });

  test("Mix-shift change is no longer miscategorised as watchlist_read_label_changed", () => {
    const prevJobs = [
      mockJob("Sales A", { department: "Sales" }),
      mockJob("Sales B", { department: "Sales" }),
    ];
    const latestJobs = [
      ...prevJobs,
      mockJob("Eng A", { department: "Engineering" }),
      mockJob("Eng B", { department: "Engineering" }),
      mockJob("Eng C", { department: "Engineering" }),
    ];

    const prev = mockHistoryItem(prevJobs, [], {
      hiringMix: [{ department: "Sales", count: 2, sampleJobs: [] }],
    });
    const latest = mockHistoryItem(latestJobs, [], {
      hiringMix: [
        { department: "Sales", count: 2, sampleJobs: [] },
        { department: "Engineering", count: 3, sampleJobs: [] },
      ],
    });

    const diff = buildWatchlistEntryDiff(latest, prev);

    // The mix-shift event must use the new category
    const mixChange = diff.changes.find(c => c.label === "Source department activity shifted");
    expect(mixChange).toBeDefined();
    expect(mixChange!.category).toBe("source_department_activity_changed");
    expect(mixChange!.category).not.toBe("watchlist_read_label_changed");
  });

  test("Actual label change still uses watchlist_read_label_changed category", () => {
    const jobs = [mockJob("Engineer A"), mockJob("Engineer B")];

    const prev = mockHistoryItem(jobs, [], {
      watchlistReadLabel: "Go-to-market hiring signal",
      hiringMix: [{ department: "Engineering", count: 2, sampleJobs: [] }],
    });
    const latest = mockHistoryItem(jobs, [], {
      watchlistReadLabel: "Product and engineering buildout signal",
      hiringMix: [{ department: "Engineering", count: 2, sampleJobs: [] }],
    });

    const diff = buildWatchlistEntryDiff(latest, prev);
    const labelChange = diff.changes.find(c => c.category === "watchlist_read_label_changed");

    expect(labelChange).toBeDefined();
    expect(labelChange!.label).toBe("Watchlist read changed");
  });

  test("Detection thresholds are unchanged: small board +1 ATS dept role is still material", () => {
    const prevJobs = [
      mockJob("Sales A", { department: "Sales" }),
      mockJob("Sales B", { department: "Sales" }),
    ];
    const latestJobs = [
      ...prevJobs,
      mockJob("Eng A", { department: "Engineering" }),
    ];

    const prev = mockHistoryItem(prevJobs, [], {
      hiringMix: [{ department: "Sales", count: 2, sampleJobs: [] }],
    });
    const latest = mockHistoryItem(latestJobs, [], {
      hiringMix: [
        { department: "Sales", count: 2, sampleJobs: [] },
        { department: "Engineering", count: 1, sampleJobs: [] },
      ],
    });

    const diff = buildWatchlistEntryDiff(latest, prev);

    // Wording changed but detection behaviour is unchanged
    expect(diff.hasMaterialChange).toBe(true);
    expect(diff.changes.some(c => c.category === "source_department_activity_changed")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6B-2D: functional mix comparison
// ---------------------------------------------------------------------------

function mockHistoryItemWithFunctionalMix(
  functionalMix: [string, number][],
  jobsCount: number,
  opts: Partial<WatchlistEntryBriefHistoryItem> = {}
): WatchlistEntryBriefHistoryItem {
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
    jobsObservedCount: jobsCount,
    hiringMix: [],
    functionalMix,
    allJobsSnapshot: [],
    proofRolesSnapshot: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...opts,
  };
}

function mockLegacyHistoryItem(
  hiringMix: Array<{ department: string; count: number }>,
  jobsCount: number,
  opts: Partial<WatchlistEntryBriefHistoryItem> = {}
): WatchlistEntryBriefHistoryItem {
  return {
    id: "legacy-id",
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
    jobsObservedCount: jobsCount,
    hiringMix: hiringMix.map(d => ({ ...d, sampleJobs: [] })),
    functionalMix: undefined,
    allJobsSnapshot: [],
    proofRolesSnapshot: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...opts,
  };
}

test.describe("6B-2D: functional mix comparison", () => {

  // A. Both briefs have functionalMix — use functional comparison
  test("A1. Both have functionalMix: uses functional_mix_changed category", () => {
    const prev = mockHistoryItemWithFunctionalMix(
      [["Engineering", 10], ["Sales", 3]],
      13
    );
    const latest = mockHistoryItemWithFunctionalMix(
      [["Engineering", 14], ["Sales", 3]],
      17
    );

    const diff = buildWatchlistEntryDiff(latest, prev);
    const mixChange = diff.changes.find(c => c.category === "functional_mix_changed");

    expect(mixChange).toBeDefined();
    expect(mixChange!.label).toBe("Functional hiring mix shifted");
    expect(mixChange!.detail).toContain("Engineering openings increased from 10 to 14");
    expect(mixChange!.detail).not.toContain("Source department");
    // Must NOT use the raw ATS category
    expect(diff.changes.some(c => c.category === "source_department_activity_changed")).toBe(false);
  });

  test("A2. Both have functionalMix: summary reflects functional bucket names", () => {
    const prev = mockHistoryItemWithFunctionalMix(
      [["Engineering", 8], ["Sales", 5]],
      13
    );
    const latest = mockHistoryItemWithFunctionalMix(
      [["Engineering", 12], ["Sales", 4]],
      16
    );

    const diff = buildWatchlistEntryDiff(latest, prev);

    expect(diff.summary).toContain("Functional hiring mix shifted");
    expect(diff.summary).not.toContain("Source department activity shifted");
  });

  test("A3. Both have functionalMix: numbers are chart-consistent", () => {
    // Simulate a board where computeFunctionalMix was used to build functionalMix.
    // "Platform Engineer" (dept: Core Platform) maps to "Engineering" in the chart.
    const jobs: Job[] = [
      { title: "Platform Engineer", department: "Core Platform", location: null, source: "GREENHOUSE",
        roleId: null, roleIdType: null, requisitionId: null, jobUrl: null, applyUrl: null,
        sourceTimestamp: null, sourceTimestampType: null, observedAt: new Date().toISOString() },
      { title: "Platform Engineer", department: "Core Platform", location: null, source: "GREENHOUSE",
        roleId: null, roleIdType: null, requisitionId: null, jobUrl: null, applyUrl: null,
        sourceTimestamp: null, sourceTimestampType: null, observedAt: new Date().toISOString() },
      { title: "Account Executive", department: "Sales", location: null, source: "GREENHOUSE",
        roleId: null, roleIdType: null, requisitionId: null, jobUrl: null, applyUrl: null,
        sourceTimestamp: null, sourceTimestampType: null, observedAt: new Date().toISOString() },
    ];
    const computedMix = computeFunctionalMix(jobs);

    // computedMix should be [["Engineering", 2], ["Sales", 1]]
    const asMap = Object.fromEntries(computedMix);
    expect(asMap["Engineering"]).toBe(2);
    expect(asMap["Sales"]).toBe(1);
    // "Core Platform" never appears as a bucket — chart always shows "Engineering"
    expect(asMap["Core Platform"]).toBeUndefined();
  });

  // B. Both briefs lack functionalMix — raw ATS fallback
  test("B. Neither has functionalMix: falls back to source_department_activity_changed", () => {
    const prev = mockLegacyHistoryItem([{ department: "Sales", count: 5 }], 5);
    const latest = mockLegacyHistoryItem(
      [{ department: "Sales", count: 3 }, { department: "Engineering", count: 3 }],
      6
    );

    const diff = buildWatchlistEntryDiff(latest, prev);

    expect(diff.changes.some(c => c.category === "source_department_activity_changed")).toBe(true);
    expect(diff.changes.some(c => c.category === "functional_mix_changed")).toBe(false);
    expect(diff.summary).toContain("Source department activity shifted");
  });

  // C. Mixed pair — one has functionalMix, one does not
  test("C1. Mixed pair: falls back to raw ATS comparison", () => {
    const legacyBrief = mockLegacyHistoryItem([{ department: "Engineering", count: 10 }], 10);
    const newBrief = mockHistoryItemWithFunctionalMix([["Engineering", 14]], 14);

    // Latest is new, previous is legacy
    const diff = buildWatchlistEntryDiff(newBrief, legacyBrief);

    // Must not use functional_mix_changed — sources are incompatible
    expect(diff.changes.some(c => c.category === "functional_mix_changed")).toBe(false);
    // Should degrade to weak comparison
    expect(diff.comparisonStrength).toBe("weak");
  });

  test("C2. Mixed pair: adds a comparison note about the legacy brief", () => {
    const legacyBrief = mockLegacyHistoryItem([{ department: "Engineering", count: 5 }], 5);
    const newBrief = mockHistoryItemWithFunctionalMix([["Engineering", 8]], 8);

    const diff = buildWatchlistEntryDiff(newBrief, legacyBrief);

    expect(diff.comparisonStrength).toBe("weak");
    // The note should mention legacy and functional mix
    const notesText = diff.comparisonNotes.join(" ").toLowerCase();
    expect(notesText).toContain("functional mix");
    expect(notesText).toMatch(/legacy|unavailable/);
  });

  test("C3. Reversed mixed pair (previous is new, latest is legacy) also falls back", () => {
    const legacyBrief = mockLegacyHistoryItem([{ department: "Engineering", count: 10 }], 10);
    const newBrief = mockHistoryItemWithFunctionalMix([["Engineering", 8]], 8);

    // Latest is legacy, previous is new — still incompatible
    const diff = buildWatchlistEntryDiff(legacyBrief, newBrief);

    expect(diff.changes.some(c => c.category === "functional_mix_changed")).toBe(false);
    expect(diff.comparisonStrength).toBe("weak");
  });

  // D. No crash on malformed functionalMix
  test("D1. Malformed functionalMix (not an array) falls back to raw ATS", () => {
    const malformed = {
      ...mockLegacyHistoryItem([{ department: "Engineering", count: 5 }], 5),
      // Override functionalMix with an invalid value
      functionalMix: "not-an-array" as unknown as [string, number][],
    };
    const prev = mockLegacyHistoryItem([{ department: "Engineering", count: 3 }], 3);

    const diff = buildWatchlistEntryDiff(malformed, prev);
    // Should not throw; should fall back gracefully
    expect(diff.changes.some(c => c.category === "source_department_activity_changed")).toBe(true);
    expect(diff.changes.some(c => c.category === "functional_mix_changed")).toBe(false);
  });

  test("D2. Malformed functionalMix (wrong tuple shape) falls back to raw ATS", () => {
    const malformed = {
      ...mockLegacyHistoryItem([{ department: "Engineering", count: 5 }], 5),
      functionalMix: [["Engineering", "not-a-number"]] as unknown as [string, number][],
    };
    const prev = mockLegacyHistoryItem([{ department: "Engineering", count: 3 }], 3);

    const diff = buildWatchlistEntryDiff(malformed, prev);
    expect(diff.changes.some(c => c.category === "functional_mix_changed")).toBe(false);
  });

  // E. Significance detection is preserved with functionalMix
  test("E. Significance thresholds work on functionalMix buckets (small board)", () => {
    const prev = mockHistoryItemWithFunctionalMix(
      [["Engineering", 4], ["Sales", 2]],
      6
    );
    const latest = mockHistoryItemWithFunctionalMix(
      [["Engineering", 6], ["Sales", 2]],
      8
    );

    const diff = buildWatchlistEntryDiff(latest, prev);

    // Small board (<10): any delta is significant — Engineering +2 should fire
    expect(diff.hasSignificantChange).toBe(true);
    expect(diff.significanceDrivers).toContain("mix");
  });

  test("E2. No change in functionalMix produces no mix change event", () => {
    const mix: [string, number][] = [["Engineering", 10], ["Sales", 5]];
    const prev = mockHistoryItemWithFunctionalMix(mix, 15);
    const latest = mockHistoryItemWithFunctionalMix(mix, 15);

    const diff = buildWatchlistEntryDiff(latest, prev);

    expect(diff.changes.some(c => c.category === "functional_mix_changed")).toBe(false);
    expect(diff.hasSignificantChange).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 6B-3A: mix diff cap
// ---------------------------------------------------------------------------

test.describe("6B-3A: Mix diff detail cap", () => {
  test("E1. More than 5 functional mix changes are capped with 'plus N more'", () => {
    // 8 functional buckets all change; the board-size guard (lCount > 2 || pCount > 2)
    // filters Leadership (1→2) since both counts ≤ 2, so 7 pass to mixDiffs.
    // Cap at 5 → 5 visible + "plus 2 more".
    const prev = mockHistoryItemWithFunctionalMix(
      [["Engineering", 10], ["Sales", 5], ["Marketing", 3],
       ["Operations", 4], ["Finance", 2], ["Product", 6],
       ["Leadership", 1], ["Broader roles", 8]],
      39
    );
    const latest = mockHistoryItemWithFunctionalMix(
      [["Engineering", 15], ["Sales", 8], ["Marketing", 5],
       ["Operations", 6], ["Finance", 4], ["Product", 9],
       ["Leadership", 2], ["Broader roles", 12]],
      61
    );

    const diff = buildWatchlistEntryDiff(latest, prev);
    const mixChange = diff.changes.find(c => c.category === "functional_mix_changed");

    expect(mixChange).toBeDefined();
    // 7 items pass threshold, cap at 5 → "plus 2 more"
    expect(mixChange!.detail).toContain("plus 2 more");
    // The detail prefix is preserved
    expect(mixChange!.detail).toContain("Functional hiring mix shifted:");
  });

  test("E2. More than 5 raw ATS department changes are capped with 'plus N more'", () => {
    // 7 raw ATS departments all change — exceeds the cap
    const prevMix = [
      { department: "Eng", count: 5, sampleJobs: [] },
      { department: "Sales", count: 3, sampleJobs: [] },
      { department: "Marketing", count: 4, sampleJobs: [] },
      { department: "Ops", count: 6, sampleJobs: [] },
      { department: "Finance", count: 3, sampleJobs: [] },
      { department: "Product", count: 5, sampleJobs: [] },
      { department: "Recruiting", count: 4, sampleJobs: [] },
    ];
    const latestMix = prevMix.map(d => ({ ...d, count: d.count + 2 }));

    const prev = mockLegacyHistoryItem(prevMix.map(d => ({ department: d.department, count: d.count })), 30);
    const latest = mockLegacyHistoryItem(latestMix.map(d => ({ department: d.department, count: d.count })), 44);

    const diff = buildWatchlistEntryDiff(latest, prev);
    const mixChange = diff.changes.find(c => c.category === "source_department_activity_changed");

    expect(mixChange).toBeDefined();
    // 7 items, cap at 5 → "plus 2 more"
    expect(mixChange!.detail).toContain("plus 2 more");
    expect(mixChange!.detail).toContain("Source department activity shifted:");
  });

  test("E3. Five or fewer mix changes are all shown without truncation", () => {
    const prev = mockHistoryItemWithFunctionalMix(
      [["Engineering", 10], ["Sales", 5], ["Marketing", 3]],
      18
    );
    const latest = mockHistoryItemWithFunctionalMix(
      [["Engineering", 12], ["Sales", 8], ["Marketing", 5]],
      25
    );

    const diff = buildWatchlistEntryDiff(latest, prev);
    const mixChange = diff.changes.find(c => c.category === "functional_mix_changed");

    expect(mixChange).toBeDefined();
    expect(mixChange!.detail).not.toContain("plus");
    expect(mixChange!.detail).toContain("Engineering");
    expect(mixChange!.detail).toContain("Sales");
    expect(mixChange!.detail).toContain("Marketing");
  });

  test("E4. Cap does not affect significance detection (computed before capping)", () => {
    // All 8 buckets change significantly; hasSignificantChange should still fire
    const prev = mockHistoryItemWithFunctionalMix(
      [["Engineering", 50], ["Sales", 30]],
      80
    );
    const latest = mockHistoryItemWithFunctionalMix(
      [["Engineering", 80], ["Sales", 50]],
      130
    );

    const diff = buildWatchlistEntryDiff(latest, prev);

    // Significance computed independently of display cap
    expect(diff.hasSignificantChange).toBe(true);
    expect(diff.significanceDrivers).toContain("mix");
    const mixChange = diff.changes.find(c => c.category === "functional_mix_changed");
    expect(mixChange).toBeDefined();
  });
});
