import { test, expect } from "@playwright/test";
import { deriveBriefPublicReadiness, type ApprovedWatchlistLabel } from "../../src/lib/signals/watchlistTaxonomy";

test.describe("Public Readiness Gate Logic", () => {
  const defaultArgs = {
    jobsCount: 10,
    watchlistReadConfidence: "high" as const,
    companyMatchConfidence: "high" as const,
    proofRoleGrounding: "exact" as const,
    label: "Go-to-market hiring signal" as ApprovedWatchlistLabel,
    hasComparison: true,
    hasMaterialChange: true,
    hasSignificantChange: true,
    significanceDrivers: ["count" as const],
    comparisonStrength: "standard" as const,
  };

  test("1. Thin evidence is internal-only (0-2 roles)", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      jobsCount: 2,
    });
    expect(result.level).toBe("internal_only");
    expect(result.blockers.some(b => b.toLowerCase().includes("insufficient evidence") || b.toLowerCase().includes("thin"))).toBe(true);
  });

  test("2. Low confidence is internal-only", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      watchlistReadConfidence: "low",
    });
    expect(result.level).toBe("internal_only");
    expect(result.blockers.some(b => b.toLowerCase().includes("confidence"))).toBe(true);
  });

  test("3. First baseline with mixed evidence is not strong (cautious)", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      hasComparison: false,
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
      label: "Mixed hiring signal",
    });
    expect(result.level).not.toBe("strong");
    expect(result.level).toBe("cautious"); // Mixed signals with good volume but no history
  });

  test("4. First baseline with decent volume and clear concentration is cautious by default", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      hasComparison: false,
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
    });
    expect(result.level).toBe("cautious");
    expect(result.reasons.some(r => r.toLowerCase().includes("baseline"))).toBe(true);
  });

  test("5. Changed brief with meaningful full-board delta can be strong", () => {
    const result = deriveBriefPublicReadiness(defaultArgs);
    expect(result.level).toBe("strong");
  });

  test("6. Missing full-job comparison data prevents strong", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      comparisonStrength: "weak",
    });
    expect(result.level).toBe("cautious");
    expect(result.reasons.some(r => r.toLowerCase().includes("legacy") || r.toLowerCase().includes("incomplete") || r.toLowerCase().includes("limited"))).toBe(true);
  });

  test("7. High volume but mixed evidence is not automatically strong", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      label: "Mixed hiring signal",
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
    });
    expect(result.level).toBe("cautious");
  });

  test("8. Strong requires evidence quality plus pattern or change", () => {
    // Good volume but moderate confidence
    const mediumConf = deriveBriefPublicReadiness({
      ...defaultArgs,
      watchlistReadConfidence: "medium",
    });
    expect(mediumConf.level).toBe("cautious");

    // Good confidence but moderate volume (3-4 roles)
    const lowVol = deriveBriefPublicReadiness({
      ...defaultArgs,
      jobsCount: 4,
    });
    expect(lowVol.level).toBe("cautious");
  });
});
