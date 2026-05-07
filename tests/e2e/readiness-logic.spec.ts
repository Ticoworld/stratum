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
    changeDirection: "expansion" as const,
  };

  test("1. Thin evidence is internal-only (0-2 roles)", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      jobsCount: 2,
    });
    expect(result.publicUse).toBe("internal_only");
    expect(result.currentSignal).toBe("weak");
    expect(result.blockers.some(b => b.toLowerCase().includes("insufficient evidence") || b.toLowerCase().includes("thin"))).toBe(true);
  });

  test("2. Low confidence is internal-only", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      watchlistReadConfidence: "low",
    });
    expect(result.publicUse).toBe("internal_only");
    expect(result.currentSignal).toBe("weak");
    expect(result.blockers.some(b => b.toLowerCase().includes("confidence"))).toBe(true);
  });

  test("3. First baseline with mixed evidence is cautious baseline", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      hasComparison: false,
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
      label: "Mixed hiring signal",
    });
    expect(result.currentSignal).toBe("moderate");
    expect(result.changeSignificance).toBe("baseline");
    expect(result.changeDirection).toBe("baseline");
    expect(result.publicUse).toBe("cautious_baseline"); 
  });

  test("4. First baseline with decent volume and clear concentration is strong baseline", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      hasComparison: false,
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
    });
    expect(result.currentSignal).toBe("strong");
    expect(result.changeSignificance).toBe("baseline");
    expect(result.changeDirection).toBe("baseline");
    expect(result.publicUse).toBe("strong_baseline");
  });

  test("5. Changed brief with meaningful full-board delta is strong update", () => {
    const result = deriveBriefPublicReadiness(defaultArgs);
    expect(result.currentSignal).toBe("strong");
    expect(result.changeSignificance).toBe("meaningful_change");
    expect(result.publicUse).toBe("strong_update");
  });

  test("6. Missing full-job comparison data is limited comparison", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      comparisonStrength: "weak",
    });
    expect(result.changeSignificance).toBe("limited_comparison");
    expect(result.changeDirection).toBe("limited");
    expect(result.publicUse).toBe("cautious_baseline");
    expect(result.reasons.some(r => r.toLowerCase().includes("legacy") || r.toLowerCase().includes("incomplete") || r.toLowerCase().includes("limited"))).toBe(true);
  });

  test("7. High volume but mixed evidence is cautious", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      label: "Mixed hiring signal",
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
    });
    expect(result.currentSignal).toBe("moderate");
    expect(result.publicUse).toBe("cautious_update");
  });

  test("8. Strong signal but minor change is cautious update", () => {
    const minorChange = deriveBriefPublicReadiness({
      ...defaultArgs,
      hasSignificantChange: false,
      significanceDrivers: [],
    });
    expect(minorChange.currentSignal).toBe("strong");
    expect(minorChange.changeSignificance).toBe("minor_change");
    expect(minorChange.publicUse).toBe("cautious_update");

    // Moderate signal with meaningful change is also cautious update
    const mediumConf = deriveBriefPublicReadiness({
      ...defaultArgs,
      watchlistReadConfidence: "medium",
    });
    expect(mediumConf.currentSignal).toBe("moderate");
    expect(mediumConf.changeSignificance).toBe("meaningful_change");
    expect(mediumConf.publicUse).toBe("cautious_update");
  });

  test("9. Strong signal with contraction is demoted to cautious update", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      changeDirection: "contraction",
    });
    expect(result.currentSignal).toBe("strong");
    expect(result.changeSignificance).toBe("meaningful_change");
    expect(result.changeDirection).toBe("contraction");
    expect(result.publicUse).toBe("cautious_update"); // instead of strong_update
  });

  test("10. Strong signal with replacement churn is demoted to cautious update", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      changeDirection: "replacement_churn",
    });
    expect(result.currentSignal).toBe("strong");
    expect(result.changeSignificance).toBe("meaningful_change");
    expect(result.changeDirection).toBe("replacement_churn");
    expect(result.publicUse).toBe("cautious_update");
  });
});
