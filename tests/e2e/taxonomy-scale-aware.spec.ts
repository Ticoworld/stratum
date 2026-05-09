import { test, expect } from "@playwright/test";
import { 
  deriveApprovedWatchlistLabel,
  type WatchlistConfidenceLevel
} from "../../src/lib/signals/watchlistTaxonomy";

test.describe("6A-2: Scale-Aware Label Derivation", () => {
  const highConfidence: WatchlistConfidenceLevel = "high";
  const mediumConfidence: WatchlistConfidenceLevel = "medium";
  const lowConfidence: WatchlistConfidenceLevel = "low";

  test("Stripe-style giant/mixed board should return broad label", () => {
    // 200 roles: 80 Engineering split, 70 GTM, 50 others
    const jobs = [
      ...Array(30).fill({ title: "Software Engineer", department: "Engineering" }), // product_engineering_buildout
      ...Array(30).fill({ title: "Platform Engineer", department: "Engineering" }), // platform_infrastructure
      ...Array(20).fill({ title: "Data Scientist", department: "Engineering" }), // data_ai
      ...Array(70).fill({ title: "Account Executive", department: "Sales" }), // go_to_market
      ...Array(50).fill({ title: "HR Manager", department: "People" }), // unclassified
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Broad platform and GTM hiring signal");
  });

  test("Large board with multiple meaningful families returns multi-function", () => {
    // 100 roles: 5 GTM (not meaningful), 40 Operations (unclassified), 55 Product
    const jobs = [
      ...Array(5).fill({ title: "Sales Rep", department: "Sales" }), // go_to_market
      ...Array(40).fill({ title: "Operations Coordinator", department: "Ops" }), // unclassified
      ...Array(55).fill({ title: "Product Manager", department: "Product" }), // product_engineering_buildout
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Broad multi-function hiring signal");
  });

  test("Large board with overwhelming GTM dominance returns GTM label", () => {
    // 100 roles: 70 GTM (70% > 65%), 30 others
    const jobs = [
      ...Array(70).fill({ title: "Sales Rep", department: "Sales" }), // go_to_market
      ...Array(30).fill({ title: "Staff", department: "Other" }), // unclassified
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Go-to-market hiring signal");
  });

  test("Giant board with no overwhelming dominance returns broad label", () => {
    // 250 roles: 100 GTM (40% < 70%), 150 others
    const jobs = [
      ...Array(100).fill({ title: "Sales Rep", department: "Sales" }), // go_to_market
      ...Array(150).fill({ title: "Staff", department: "Other" }), // unclassified
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Broad multi-function hiring signal");
  });

  test("Small board regression: startup engineering focus remains narrow", () => {
    // 10 roles: 6 Engineering, 4 others (60% > 45%)
    const jobs = [
      ...Array(6).fill({ title: "Software Engineer", department: "Engineering" }),
      ...Array(4).fill({ title: "Office Manager", department: "Admin" }),
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Product and engineering buildout signal");
  });

  test("Small board plurality: 5 roles total, 3 GTM returns GTM (count >= 3 shortcut)", () => {
    const jobs = [
      ...Array(3).fill({ title: "Sales", department: "Sales" }),
      ...Array(2).fill({ title: "Eng", department: "Eng" }),
    ];

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Go-to-market hiring signal");
  });

  test("Thin/tentative regression: low confidence returns tentative", () => {
    const jobs = Array(10).fill({ title: "Sales", department: "Sales" });

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: lowConfidence,
      companyMatchConfidence: highConfidence,
    });

    expect(result).toBe("Tentative hiring signal");
  });

  test("Thin/tentative regression: low company match returns tentative", () => {
    const jobs = Array(10).fill({ title: "Sales", department: "Sales" });

    const result = deriveApprovedWatchlistLabel({
      jobs: jobs as any,
      watchlistReadConfidence: highConfidence,
      companyMatchConfidence: lowConfidence,
    });

    expect(result).toBe("Tentative hiring signal");
  });
});
