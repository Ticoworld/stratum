import { test, expect } from "@playwright/test";
import { buildWatchlistEntryDiff, toWatchlistEntryBriefHistoryItem } from "../../src/lib/watchlists/history";
import { buildWhatChangedDisplay } from "../../src/lib/briefs/whatChangedDisplay";

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

// ---------------------------------------------------------------------------
// Phase 6B-3A: What Changed display logic (brief position + weak comparison)
// ---------------------------------------------------------------------------

test.describe("6B-3A: What Changed display logic", () => {
  const standardSummary = "Role evidence shrank from 494 observed openings to 477. Observed roles changed: removed Account Executive, AI Sales.";

  // A. Latest brief: standard display, no heading
  test("A. Latest brief: standard display with no forward-looking heading", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "latest",
      comparisonAvailable: true,
      comparisonStrength: "standard",
      comparisonSummary: standardSummary,
      comparisonNotes: [],
    });

    expect(display.kind).toBe("standard");
    if (display.kind === "standard") {
      expect(display.heading).toBeNull();
      expect(display.summary).toBe(standardSummary);
      expect(display.comparisonStrength).toBe("standard");
    }
  });

  // B. Previous brief: adds "Since this brief was saved" heading
  test("B. Previous brief: adds forward-looking heading", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "previous",
      comparisonAvailable: true,
      comparisonStrength: "standard",
      comparisonSummary: standardSummary,
      comparisonNotes: [],
    });

    expect(display.kind).toBe("standard");
    if (display.kind === "standard") {
      expect(display.heading).toBe("Since this brief was saved");
      expect(display.summary).toBe(standardSummary);
    }
  });

  // C. Older brief: unrelated diff must not be shown
  test("C. Older brief: returns archived regardless of comparisonSummary content", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "older",
      comparisonAvailable: true,
      comparisonStrength: "standard",
      comparisonSummary: standardSummary,
      comparisonNotes: [],
    });

    expect(display.kind).toBe("archived");
  });

  test("C2. Older brief with weak comparison also returns archived", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "older",
      comparisonAvailable: true,
      comparisonStrength: "weak",
      comparisonSummary: "Some diff from newer briefs.",
      comparisonNotes: ["Comparison is weak because sources differ."],
    });

    expect(display.kind).toBe("archived");
  });

  // D. Weak comparison: caveat surfaces, raw summary goes behind disclosure
  test("D. Weak comparison: returns weak_caveat not standard", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "latest",
      comparisonAvailable: true,
      comparisonStrength: "weak",
      comparisonSummary: standardSummary,
      comparisonNotes: ["Comparison is weak because the briefs rely on different ATS sources."],
    });

    expect(display.kind).toBe("weak_caveat");
    if (display.kind === "weak_caveat") {
      // Primary text is the comparison note, not the raw role-level summary
      expect(display.caveat).toContain("different ATS sources");
      expect(display.caveat).not.toBe(standardSummary);
      // Full raw summary is available for the disclosure element
      expect(display.fullSummary).toBe(standardSummary);
      // Latest brief: no forward-looking heading
      expect(display.heading).toBeNull();
    }
  });

  test("D2. Weak comparison previous brief: caveat has 'Since this brief was saved' heading", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "previous",
      comparisonAvailable: true,
      comparisonStrength: "weak",
      comparisonSummary: standardSummary,
      comparisonNotes: ["Comparison is weak because the briefs rely on different ATS sources."],
    });

    expect(display.kind).toBe("weak_caveat");
    if (display.kind === "weak_caveat") {
      expect(display.heading).toBe("Since this brief was saved");
    }
  });

  test("D3. Weak comparison with no notes uses generic fallback caveat", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "latest",
      comparisonAvailable: true,
      comparisonStrength: "weak",
      comparisonSummary: standardSummary,
      comparisonNotes: [],
    });

    expect(display.kind).toBe("weak_caveat");
    if (display.kind === "weak_caveat") {
      expect(display.caveat).toContain("directional");
    }
  });

  // Baseline (no comparison yet)
  test("No comparison available: returns baseline regardless of briefPosition", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: "latest",
      comparisonAvailable: false,
      comparisonStrength: "unavailable",
      comparisonSummary: null,
      comparisonNotes: [],
    });

    expect(display.kind).toBe("baseline");
  });

  test("Null briefPosition with comparison available: standard display, no heading", () => {
    const display = buildWhatChangedDisplay({
      briefPosition: null,
      comparisonAvailable: true,
      comparisonStrength: "standard",
      comparisonSummary: standardSummary,
      comparisonNotes: [],
    });

    expect(display.kind).toBe("standard");
    if (display.kind === "standard") {
      expect(display.heading).toBeNull();
    }
  });
});
