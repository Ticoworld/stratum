import { test, expect } from "@playwright/test";
import type { Job } from "../../src/lib/api/boards";
import {
  deriveApprovedWatchlistLabel,
  type WatchlistConfidenceLevel
} from "../../src/lib/signals/watchlistTaxonomy";

function makeJob(overrides: { title: string; department: string }): Job {
  return {
    title: overrides.title,
    department: overrides.department,
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

test.describe("6A-2: Scale-Aware Label Derivation", () => {
  const highConfidence: WatchlistConfidenceLevel = "high";
  const lowConfidence: WatchlistConfidenceLevel = "low";

  test("Stripe-style giant/mixed board should return broad label", () => {
    // 200 roles: 80 Engineering split, 70 GTM, 50 others
    const jobs: Job[] = [
      ...Array(30).fill(makeJob({ title: "Software Engineer", department: "Engineering" })), // product_engineering_buildout
      ...Array(30).fill(makeJob({ title: "Platform Engineer", department: "Engineering" })), // platform_infrastructure
      ...Array(20).fill(makeJob({ title: "Data Scientist", department: "Engineering" })), // data_ai
      ...Array(70).fill(makeJob({ title: "Account Executive", department: "Sales" })), // go_to_market
      ...Array(50).fill(makeJob({ title: "HR Manager", department: "People" })), // unclassified
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Broad platform and GTM hiring signal");
  });

  test("Large board with multiple meaningful families returns multi-function", () => {
    // 100 roles: 5 GTM (not meaningful), 40 Operations (unclassified), 55 Product
    const jobs: Job[] = [
      ...Array(5).fill(makeJob({ title: "Sales Rep", department: "Sales" })), // go_to_market
      ...Array(40).fill(makeJob({ title: "Operations Coordinator", department: "Ops" })), // unclassified
      ...Array(55).fill(makeJob({ title: "Product Manager", department: "Product" })), // product_engineering_buildout
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Broad multi-function hiring signal");
  });

  test("Large board with overwhelming GTM dominance returns GTM label", () => {
    // 100 roles: 70 GTM (70% > 65%), 30 others
    const jobs: Job[] = [
      ...Array(70).fill(makeJob({ title: "Sales Rep", department: "Sales" })), // go_to_market
      ...Array(30).fill(makeJob({ title: "Staff", department: "Other" })), // unclassified
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Go-to-market hiring signal");
  });

  test("Giant board with no overwhelming dominance returns broad label", () => {
    // 250 roles: 100 GTM (40% < 70%), 150 others
    const jobs: Job[] = [
      ...Array(100).fill(makeJob({ title: "Sales Rep", department: "Sales" })), // go_to_market
      ...Array(150).fill(makeJob({ title: "Staff", department: "Other" })), // unclassified
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Broad multi-function hiring signal");
  });

  test("Small board regression: startup engineering focus remains narrow", () => {
    // 10 roles: 6 Engineering, 4 others (60% > 45%)
    const jobs: Job[] = [
      ...Array(6).fill(makeJob({ title: "Software Engineer", department: "Engineering" })),
      ...Array(4).fill(makeJob({ title: "Office Manager", department: "Admin" })),
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Product and engineering buildout signal");
  });

  test("Small board plurality: 5 roles total, 3 GTM returns GTM (count >= 3 shortcut)", () => {
    const jobs: Job[] = [
      ...Array(3).fill(makeJob({ title: "Sales", department: "Sales" })),
      ...Array(2).fill(makeJob({ title: "Eng", department: "Eng" })),
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Go-to-market hiring signal");
  });

  test("Thin/tentative regression: low confidence returns tentative", () => {
    const jobs: Job[] = Array(10).fill(makeJob({ title: "Sales", department: "Sales" }));

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: lowConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Tentative hiring signal");
  });

  test("Thin/tentative regression: low company match returns tentative", () => {
    const jobs: Job[] = Array(10).fill(makeJob({ title: "Sales", department: "Sales" }));

    const result = deriveApprovedWatchlistLabel({
      jobs,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: lowConfidence,
    });

    expect(result).toBe("Tentative hiring signal");
  });
});
