/**
 * AI-1A: getLabelSuggestionSentence mix-sensitivity fix
 *
 * Tests the deterministic fix for the department-casing bug where the
 * "Product and engineering buildout signal" always produced the generic
 * "product and engineering work" sentence regardless of the actual mix.
 *
 * Coverage:
 * 1. Engineering-heavy board (≥75% of bucket are engineers)
 * 2. Product-heavy board (≥75% of bucket are PMs/designers)
 * 3. Balanced board (neither side ≥75%)
 * 4. Non–product_engineering labels are not affected
 * 5. Backward compat: hiringMix param still accepted, still ignored for logic
 * 6. getProductEngineeringSubRatio counts and ratios
 */

import { test, expect } from "@playwright/test";
import {
  buildApprovedWatchlistSummary,
  getProductEngineeringSubRatio,
  type ApprovedWatchlistLabel,
} from "../../src/lib/signals/watchlistTaxonomy";
import type { Job } from "../../src/lib/api/boards";

// ---------------------------------------------------------------------------
// Minimal job factory — only title and source are required for signal logic.
// ---------------------------------------------------------------------------

function makeJob(title: string, department?: string): Job {
  return {
    title,
    department: department ?? null,
    location: null,
    source: "GREENHOUSE",
    roleId: null,
    roleIdType: null,
    requisitionId: null,
    jobUrl: null,
    applyUrl: null,
    sourceTimestamp: null,
    sourceTimestampType: null,
    observedAt: new Date().toISOString(),
  };
}

// Shared base args — only the label and jobs change per test.
function summaryArgs(
  label: ApprovedWatchlistLabel,
  jobs: Job[]
): Parameters<typeof buildApprovedWatchlistSummary>[0] {
  return {
    label,
    jobs,
    proofRoles: jobs.slice(0, 3),
    apiSource: "GREENHOUSE",
    watchlistReadConfidence: "high",
    companyMatchConfidence: "high",
    proofRoleGrounding: "exact",
  };
}

// ---------------------------------------------------------------------------
// Engineering-heavy jobs (8 engineers, 1 PM)
// ---------------------------------------------------------------------------
const ENGINEERING_HEAVY_JOBS: Job[] = [
  makeJob("Senior Software Engineer"),
  makeJob("Backend Engineer"),
  makeJob("Frontend Engineer"),
  makeJob("Staff Software Engineer"),
  makeJob("Mobile Engineer"),
  makeJob("iOS Engineer"),
  makeJob("Android Engineer"),
  makeJob("Full-Stack Engineer"),
  makeJob("Product Manager"), // 1 PM
];

// ---------------------------------------------------------------------------
// Product-heavy jobs (1 engineer, 8 PMs/designers)
// ---------------------------------------------------------------------------
const PRODUCT_HEAVY_JOBS: Job[] = [
  makeJob("Product Manager"),
  makeJob("Senior Product Manager"),
  makeJob("Product Designer"),
  makeJob("UX Designer"),
  makeJob("UI Designer"),
  makeJob("Head of Design"),   // classified as leadership, not product_engineering
  makeJob("Product Manager, Growth"),
  makeJob("Senior UX Researcher"),
  makeJob("Software Engineer"), // 1 engineer
];

// ---------------------------------------------------------------------------
// Balanced jobs (4 engineers, 4 PMs)
// ---------------------------------------------------------------------------
const BALANCED_JOBS: Job[] = [
  makeJob("Software Engineer"),
  makeJob("Backend Engineer"),
  makeJob("Frontend Developer"),
  makeJob("Mobile Engineer"),
  makeJob("Product Manager"),
  makeJob("Senior Product Manager"),
  makeJob("Product Designer"),
  makeJob("UX Designer"),
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("AI-1A: getLabelSuggestionSentence mix-sensitivity", () => {

  // 1. Engineering-heavy board -------------------------------------------------

  test("engineering-heavy board: summary emphasizes engineering, not generic product/engineering", () => {
    const summary = buildApprovedWatchlistSummary(
      summaryArgs("Product and engineering buildout signal", ENGINEERING_HEAVY_JOBS)
    );
    // Must NOT say the old generic sentence
    expect(summary).not.toContain("product and engineering work");
    // Must say engineering-heavy variant
    expect(summary).toContain("engineering work");
    expect(summary).toContain("limited product headcount");
  });

  // 2. Product-heavy board -----------------------------------------------------

  test("product-heavy board: summary emphasizes product management and design", () => {
    // Note: "Head of Design" routes to leadership signal, not product_engineering,
    // so the product bucket has PMs + UX roles. UX Designer → product_engineering via "ux".
    const summary = buildApprovedWatchlistSummary(
      summaryArgs("Product and engineering buildout signal", PRODUCT_HEAVY_JOBS)
    );
    expect(summary).not.toContain("product and engineering work");
    expect(summary).toContain("product management and design work");
  });

  // 3. Balanced board ----------------------------------------------------------

  test("balanced board: summary uses generic product and engineering sentence", () => {
    const summary = buildApprovedWatchlistSummary(
      summaryArgs("Product and engineering buildout signal", BALANCED_JOBS)
    );
    expect(summary).toContain("product and engineering work");
    expect(summary).not.toContain("limited product headcount");
    expect(summary).not.toContain("product management and design work");
  });

  // 4. Non–product_engineering labels are unchanged ----------------------------

  test("go-to-market label: suggestion sentence unchanged", () => {
    const jobs = [
      makeJob("Account Executive"),
      makeJob("Sales Development Rep"),
      makeJob("Marketing Manager"),
      makeJob("Field Marketing Lead"),
    ];
    const summary = buildApprovedWatchlistSummary(
      summaryArgs("Go-to-market hiring signal", jobs)
    );
    expect(summary).toContain("go-to-market functions");
  });

  test("platform and infrastructure label: suggestion sentence unchanged", () => {
    const jobs = [
      makeJob("Platform Engineer"),
      makeJob("Infrastructure Engineer"),
      makeJob("DevOps Engineer"),
    ];
    const summary = buildApprovedWatchlistSummary(
      summaryArgs("Platform and infrastructure signal", jobs)
    );
    expect(summary).toContain("platform and infrastructure work");
  });

  test("security and compliance label: suggestion sentence unchanged", () => {
    const jobs = [
      makeJob("Security Engineer"),
      makeJob("Compliance Manager"),
      makeJob("Risk Analyst"),
    ];
    const summary = buildApprovedWatchlistSummary(
      summaryArgs("Security and compliance signal", jobs)
    );
    expect(summary).toContain("security and compliance work");
  });

  test("mixed hiring label: suggestion sentence unchanged", () => {
    const jobs = [
      makeJob("Software Engineer"),
      makeJob("Account Executive"),
      makeJob("Marketing Manager"),
      makeJob("Data Analyst"),
    ];
    const summary = buildApprovedWatchlistSummary(
      summaryArgs("Mixed hiring signal", jobs)
    );
    expect(summary).toContain("mixed functional hiring focus");
  });

  // 5. Backward compat: hiringMix param still accepted -------------------------

  test("passing hiringMix does not cause errors or override keyword-based logic", () => {
    const summary = buildApprovedWatchlistSummary({
      ...summaryArgs("Product and engineering buildout signal", ENGINEERING_HEAVY_JOBS),
      // Pass old-style hiringMix with casing that previously broke the branch
      hiringMix: [
        { department: "Engineering", count: 8, sampleJobs: ENGINEERING_HEAVY_JOBS.slice(0, 3) },
        { department: "Product", count: 1, sampleJobs: ENGINEERING_HEAVY_JOBS.slice(8, 9) },
      ],
    });
    // Keyword-based logic should still produce the engineering-heavy sentence
    expect(summary).toContain("engineering work");
    expect(summary).toContain("limited product headcount");
    expect(summary).not.toContain("product and engineering work");
  });

  // 6. getProductEngineeringSubRatio unit tests --------------------------------

  test.describe("getProductEngineeringSubRatio", () => {
    test("engineering-heavy board: engineeringRatio >= 0.75", () => {
      const ratio = getProductEngineeringSubRatio(ENGINEERING_HEAVY_JOBS);
      // 8 engineers, 1 PM → all 9 map to product_engineering_buildout
      // 8 match ENGINEERING_SUB_KEYWORDS, 1 matches PRODUCT_SUB_KEYWORDS
      expect(ratio.engineeringCount).toBe(8);
      expect(ratio.productCount).toBe(1);
      expect(ratio.engineeringRatio).toBeGreaterThanOrEqual(0.75);
      expect(ratio.productRatio).toBeLessThan(0.25);
    });

    test("product-heavy board: productRatio >= 0.75", () => {
      const ratio = getProductEngineeringSubRatio(PRODUCT_HEAVY_JOBS);
      // "Head of Design" → leadership, excluded from bucket
      // 1 Software Engineer → engineering
      // Product Manager × 4, Product Designer, UX Designer × 2 → product
      expect(ratio.productCount).toBeGreaterThan(ratio.engineeringCount);
      expect(ratio.productRatio).toBeGreaterThanOrEqual(0.75);
    });

    test("balanced board: neither ratio >= 0.75", () => {
      const ratio = getProductEngineeringSubRatio(BALANCED_JOBS);
      expect(ratio.engineeringRatio).toBeLessThan(0.75);
      expect(ratio.productRatio).toBeLessThan(0.75);
    });

    test("empty board: returns zeros", () => {
      const ratio = getProductEngineeringSubRatio([]);
      expect(ratio.engineeringCount).toBe(0);
      expect(ratio.productCount).toBe(0);
      expect(ratio.engineeringRatio).toBe(0);
      expect(ratio.productRatio).toBe(0);
    });

    test("board with no product_engineering_buildout roles: returns zeros", () => {
      const gtmJobs = [
        makeJob("Account Executive"),
        makeJob("Sales Development Rep"),
        makeJob("Marketing Manager"),
      ];
      const ratio = getProductEngineeringSubRatio(gtmJobs);
      expect(ratio.engineeringCount).toBe(0);
      expect(ratio.productCount).toBe(0);
      expect(ratio.engineeringRatio).toBe(0);
      expect(ratio.productRatio).toBe(0);
    });

    test("roles matching neither sub-keyword do not inflate either count", () => {
      const jobs = [
        makeJob("Technical Lead"),      // product_engineering_buildout but no sub-keyword
        makeJob("Software Engineer"),   // engineering
      ];
      const ratio = getProductEngineeringSubRatio(jobs);
      // Only the engineer counts; Technical Lead is in neither bucket
      expect(ratio.engineeringCount).toBe(1);
      expect(ratio.productCount).toBe(0);
      expect(ratio.engineeringRatio).toBe(1);
    });
  });
});
