import { test, expect } from "@playwright/test";
import { selectProofRoles } from "../../src/lib/services/StratumInvestigator";
import type { Job } from "../../src/lib/api/boards";
import type { AiSignalCluster } from "../../src/lib/signals/roleEnrichment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(title: string, department = "", source: "GREENHOUSE" | "ASHBY" = "GREENHOUSE"): Job {
  return {
    title,
    department,
    location: "San Francisco",
    jobUrl: null,
    applyUrl: null,
    roleId: null,
    roleIdType: null,
    requisitionId: null,
    sourceTimestamp: null,
    sourceTimestampType: null,
    observedAt: new Date().toISOString(),
    source,
  };
}

function makeCluster(
  label: string,
  roleKeys: string[],
  confidence: "high" | "medium" | "low" = "high"
): AiSignalCluster {
  return {
    clusterKey: `theme::${label.toLowerCase().replace(/\s/g, "_")}`,
    label,
    roleKeys,
    roleCount: roleKeys.length,
    businessThemes: ["core_platform"],
    functions: ["engineering"],
    strategicTags: [],
    evidenceReason: "Test cluster",
    confidence,
  };
}

// Build jobs that produce a specific functionalMix without relying on mapToFunctionalBucket internals.
// These titles are chosen to produce deterministic bucket assignments.
const ENG_JOBS = Array.from({ length: 10 }, (_, i) => makeJob(`Software Engineer ${i + 1}`, "Engineering"));
const SALES_JOBS = Array.from({ length: 5 }, (_, i) => makeJob(`Account Executive ${i + 1}`, "Sales"));
const PRODUCT_JOBS = Array.from({ length: 4 }, (_, i) => makeJob(`Product Manager ${i + 1}`, "Product"));
const COMPLIANCE_JOBS = Array.from({ length: 4 }, (_, i) => makeJob(`Compliance Manager ${i + 1}`, "Operations"));

// ---------------------------------------------------------------------------
// Section A: functionalMix alignment (broad board)
// ---------------------------------------------------------------------------

test.describe("A. functionalMix alignment — broad board", () => {
  const broadJobs = [...ENG_JOBS, ...SALES_JOBS, ...PRODUCT_JOBS, ...COMPLIANCE_JOBS];
  // funcMix: Engineering(10), Sales(5), Product(4), Operations(4)  → broad (top ratio ~43%)

  test("T-PR-A1: broad board shows ≤2 Engineering proof roles (not all 5)", () => {
    const result = selectProofRoles(broadJobs);
    const engCount = result.roles.filter((r) => r.title.startsWith("Software Engineer")).length;
    expect(engCount).toBeLessThanOrEqual(2);
  });

  test("T-PR-A2: broad board covers at least 3 different functionalMix buckets", () => {
    const result = selectProofRoles(broadJobs);
    const titles = result.roles.map((r) => r.title);
    const hasEng = titles.some((t) => t.startsWith("Software Engineer"));
    const hasSales = titles.some((t) => t.startsWith("Account Executive"));
    const hasProd = titles.some((t) => t.startsWith("Product Manager"));
    const hasComp = titles.some((t) => t.startsWith("Compliance Manager"));
    const bucketsCovered = [hasEng, hasSales, hasProd, hasComp].filter(Boolean).length;
    expect(bucketsCovered).toBeGreaterThanOrEqual(3);
  });

  test("T-PR-A3: broad board respects limit of 5", () => {
    const result = selectProofRoles(broadJobs);
    expect(result.roles.length).toBeLessThanOrEqual(5);
  });

  test("T-PR-A4: explicit broad functionalMix drives selection even without watchlistReadLabel", () => {
    const funcMix: [string, number][] = [
      ["Engineering", 10],
      ["Sales", 5],
      ["Product", 4],
      ["Operations", 4],
    ];
    const result = selectProofRoles(broadJobs, undefined, { functionalMix: funcMix });
    const engCount = result.roles.filter((r) => r.title.startsWith("Software Engineer")).length;
    expect(engCount).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Section B: concentrated board behavior
// ---------------------------------------------------------------------------

test.describe("B. concentrated board behavior", () => {
  const concentratedEngJobs = [
    ...Array.from({ length: 12 }, (_, i) => makeJob(`Software Engineer ${i + 1}`, "Engineering")),
    makeJob("Account Executive", "Sales"),
    makeJob("Product Manager", "Product"),
  ];

  test("T-PR-B1: concentrated engineering board returns 3 engineering roles", () => {
    const funcMix: [string, number][] = [["Engineering", 12], ["Sales", 1], ["Product", 1]];
    const result = selectProofRoles(concentratedEngJobs, undefined, {
      functionalMix: funcMix,
      watchlistReadLabel: "Product and engineering buildout signal",
    });
    const engCount = result.roles.filter((r) => r.title.startsWith("Software Engineer")).length;
    expect(engCount).toBe(3);
  });

  test("T-PR-B2: concentrated GTM board returns mostly GTM roles", () => {
    const gtmJobs = [
      ...Array.from({ length: 12 }, (_, i) => makeJob(`Account Executive ${i + 1}`, "Sales")),
      makeJob("Software Engineer", "Engineering"),
      makeJob("Product Manager", "Product"),
    ];
    const funcMix: [string, number][] = [["Sales", 12], ["Engineering", 1], ["Product", 1]];
    const result = selectProofRoles(gtmJobs, undefined, {
      functionalMix: funcMix,
      watchlistReadLabel: "Go-to-market hiring signal",
    });
    const salesCount = result.roles.filter((r) => r.title.startsWith("Account Executive")).length;
    expect(salesCount).toBe(3);
  });

  test("T-PR-B3: concentrated board grounding is fallback when no notable roles provided", () => {
    const funcMix: [string, number][] = [["Engineering", 12], ["Sales", 1], ["Product", 1]];
    const result = selectProofRoles(concentratedEngJobs, undefined, {
      functionalMix: funcMix,
      watchlistReadLabel: "Product and engineering buildout signal",
    });
    expect(result.grounding).toBe("fallback");
  });
});

// ---------------------------------------------------------------------------
// Section C: signalCluster alignment
// ---------------------------------------------------------------------------

test.describe("C. signalCluster alignment", () => {
  // Board: 10 engineering roles, but top cluster is compliance (3 specific roles)
  const complianceRoleJobs = [
    makeJob("Compliance Officer", "Compliance"),
    makeJob("Risk Manager", "Risk"),
    makeJob("Audit Analyst", "Audit"),
    ...Array.from({ length: 7 }, (_, i) => makeJob(`Software Engineer ${i + 1}`, "Engineering")),
  ];

  // Role keys that match the cluster (buildEnrichmentRoleKey format for these jobs)
  // Since jobs have no roleId/jobUrl/requisitionId, keys are text-based:
  // "text::<normalized title>::<normalized dept>::<normalized location>::<source>"
  function buildTextKey(title: string, dept: string): string {
    const normTitle = title.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
    const normDept = dept.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
    const normLoc = "san francisco";
    const normSrc = "greenhouse";
    return `text::${normTitle}::${normDept}::${normLoc}::${normSrc}`;
  }

  const clusterRoleKeys = [
    buildTextKey("Compliance Officer", "Compliance"),
    buildTextKey("Risk Manager", "Risk"),
    buildTextKey("Audit Analyst", "Audit"),
  ];

  const topCluster = makeCluster("Risk & Compliance", clusterRoleKeys, "high");

  test("T-PR-C1: at least one cluster role appears in proof roles when cluster matches jobs", () => {
    const result = selectProofRoles(complianceRoleJobs, undefined, {
      signalClusters: [topCluster],
    });
    const titles = result.roles.map((r) => r.title);
    const clusterTitles = ["Compliance Officer", "Risk Manager", "Audit Analyst"];
    const hasClusterRole = titles.some((t) => clusterTitles.includes(t));
    expect(hasClusterRole).toBe(true);
  });

  test("T-PR-C2: cluster role guarantee fires even when cluster bucket is outside top funcMix bucket", () => {
    const funcMix: [string, number][] = [["Engineering", 7], ["Operations", 3]];
    const result = selectProofRoles(complianceRoleJobs, undefined, {
      signalClusters: [topCluster],
      functionalMix: funcMix,
    });
    const clusterTitles = ["Compliance Officer", "Risk Manager", "Audit Analyst"];
    const hasClusterRole = result.roles.some((r) => clusterTitles.includes(r.title));
    expect(hasClusterRole).toBe(true);
  });

  test("T-PR-C3: low-confidence single-role cluster does not guarantee a slot", () => {
    const singleRoleCluster = makeCluster("Solo Theme", [clusterRoleKeys[0]], "low");
    // roleCount is 1 with low confidence → does not qualify as topCluster
    const result = selectProofRoles(complianceRoleJobs, undefined, {
      signalClusters: [singleRoleCluster],
    });
    // Should not crash and should still return valid roles
    expect(result.roles.length).toBeGreaterThan(0);
    expect(result.roles.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Section D: AI notable roles as tie-breakers
// ---------------------------------------------------------------------------

test.describe("D. AI notable roles as tie-breakers", () => {
  const salesJobs = [
    makeJob("Account Executive Senior", "Sales"),
    makeJob("Account Executive Junior", "Sales"),
    makeJob("Business Development Rep", "Sales"),
    makeJob("Sales Manager", "Sales"),
    makeJob("Account Manager", "Sales"),
  ];

  test("T-PR-D1: AI notable role preferred within its bucket over source-order", () => {
    // Notable = "Sales Manager" (not first in list)
    const result = selectProofRoles(salesJobs, ["Sales Manager"]);
    const titles = result.roles.map((r) => r.title);
    expect(titles).toContain("Sales Manager");
  });

  test("T-PR-D2: non-dominant AI notable role is NOT blindly skipped (old bug)", () => {
    // Board: 12 engineering + 1 compliance. AI suggests compliance role.
    // Old code skipped non-dominant AI suggestions when ratio > 0.7.
    // New code should include it via bucket allocation or phase 3.
    const mixedJobs = [
      ...Array.from({ length: 12 }, (_, i) => makeJob(`Software Engineer ${i + 1}`, "Engineering")),
      makeJob("Head of Compliance", "Compliance"),
    ];
    const result = selectProofRoles(mixedJobs, ["Head of Compliance"]);
    const titles = result.roles.map((r) => r.title);
    // Head of Compliance must appear somewhere (via bucket phase or phase 3)
    expect(titles).toContain("Head of Compliance");
  });

  test("T-PR-D3: AI notable partial match contributes when exact is absent", () => {
    const jobs = [
      makeJob("Staff Software Engineer", "Engineering"),
      makeJob("Account Executive", "Sales"),
    ];
    // Notable title "software engineer" should partial-match "Staff Software Engineer"
    const result = selectProofRoles(jobs, ["software engineer"]);
    expect(result.partialMatches).toBeGreaterThan(0);
    expect(result.grounding).toBe("partial");
  });

  test("T-PR-D4: AI notable does not destroy broad representation", () => {
    // Broad board, AI notables all in one bucket — should not give all 5 slots to that bucket
    const boardJobs = [...ENG_JOBS, ...SALES_JOBS, ...PRODUCT_JOBS, ...COMPLIANCE_JOBS];
    const engineeringNotables = ENG_JOBS.slice(0, 5).map((j) => j.title);
    const result = selectProofRoles(boardJobs, engineeringNotables);
    const engCount = result.roles.filter((r) => r.title.startsWith("Software Engineer")).length;
    // Even with 5 engineering notables, broad board caps engineering at 2
    expect(engCount).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Section E: fallback behavior
// ---------------------------------------------------------------------------

test.describe("E. fallback behavior", () => {
  test("T-PR-E1: empty jobs → empty proof roles, grounding none", () => {
    const result = selectProofRoles([]);
    expect(result.roles).toHaveLength(0);
    expect(result.grounding).toBe("none");
  });

  test("T-PR-E2: no options passed → still returns valid roles", () => {
    const result = selectProofRoles(ENG_JOBS);
    expect(result.roles.length).toBeGreaterThan(0);
    expect(result.roles.length).toBeLessThanOrEqual(5);
    expect(result.grounding).toBe("fallback");
  });

  test("T-PR-E3: signalClusters missing → falls back to functionalMix-based selection", () => {
    const result = selectProofRoles([...ENG_JOBS, ...SALES_JOBS]);
    expect(result.roles.length).toBeGreaterThan(0);
  });

  test("T-PR-E4: functionalMix missing → recomputes from jobs, does not crash", () => {
    const result = selectProofRoles([...ENG_JOBS, ...SALES_JOBS], undefined, {
      signalClusters: [],
    });
    expect(result.roles.length).toBeGreaterThan(0);
  });

  test("T-PR-E5: thin board (3 roles) → all roles returned, no forced balancing", () => {
    const thinJobs = [makeJob("Software Engineer", "Engineering"), makeJob("Account Executive", "Sales"), makeJob("Product Manager", "Product")];
    const result = selectProofRoles(thinJobs, undefined, {
      watchlistReadLabel: "Thin hiring signal",
    });
    expect(result.roles.length).toBe(3);
  });

  test("T-PR-E6: empty jobs regardless of options → empty proof roles", () => {
    const result = selectProofRoles([], ["Some Role"], {
      signalClusters: [makeCluster("Test", ["key1"])],
      functionalMix: [["Engineering", 5]],
    });
    expect(result.roles).toHaveLength(0);
    expect(result.grounding).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Section F: grounding accuracy
// ---------------------------------------------------------------------------

test.describe("F. grounding accuracy", () => {
  test("T-PR-F1: exact match on all notables → grounding exact", () => {
    const jobs = [
      makeJob("Senior Software Engineer", "Engineering"),
      makeJob("Account Executive", "Sales"),
    ];
    const result = selectProofRoles(jobs, ["senior software engineer", "account executive"]);
    expect(result.exactMatches).toBe(2);
    expect(result.grounding).toBe("exact");
  });

  test("T-PR-F2: no notable matches → grounding fallback", () => {
    const jobs = [makeJob("Software Engineer", "Engineering"), makeJob("Account Executive", "Sales")];
    const result = selectProofRoles(jobs, ["chief revenue officer", "vp engineering"]);
    expect(result.grounding).toBe("fallback");
    expect(result.exactMatches).toBe(0);
    expect(result.partialMatches).toBe(0);
  });

  test("T-PR-F3: no notable roles passed → grounding fallback", () => {
    const result = selectProofRoles(ENG_JOBS);
    expect(result.grounding).toBe("fallback");
  });

  test("T-PR-F4: explanation is non-empty string", () => {
    const result = selectProofRoles(ENG_JOBS);
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Section G: regression safety — existing behavior preserved
// ---------------------------------------------------------------------------

test.describe("G. regression: limit respected in all cases", () => {
  test("T-PR-G1: never returns more than limit roles", () => {
    const largeBoard = Array.from({ length: 100 }, (_, i) =>
      makeJob(`Software Engineer ${i + 1}`, "Engineering")
    );
    const result = selectProofRoles(largeBoard);
    expect(result.roles.length).toBeLessThanOrEqual(5);
  });

  test("T-PR-G2: custom limit respected", () => {
    const result = selectProofRoles([...ENG_JOBS, ...SALES_JOBS], undefined, { limit: 3 });
    expect(result.roles.length).toBeLessThanOrEqual(3);
  });

  test("T-PR-G3: fewer jobs than limit → returns all available jobs", () => {
    const result = selectProofRoles(SALES_JOBS.slice(0, 2));
    expect(result.roles.length).toBe(2);
  });

  test("T-PR-G4: no duplicate roles in result", () => {
    const result = selectProofRoles([...ENG_JOBS, ...SALES_JOBS]);
    const indices = new Set<number>();
    for (const role of result.roles) {
      const idx = [...ENG_JOBS, ...SALES_JOBS].findIndex(
        (j) => j.title === role.title && j.department === role.department
      );
      expect(indices.has(idx)).toBe(false);
      indices.add(idx);
    }
  });
});
