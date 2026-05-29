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
    expect(result.evidenceQuality).toBe("weak");
    expect(result.blockers.some(b => b.toLowerCase().includes("insufficient evidence") || b.toLowerCase().includes("thin"))).toBe(true);
  });

  test("2. Low confidence is internal-only", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      watchlistReadConfidence: "low",
    });
    expect(result.publicUse).toBe("internal_only");
    expect(result.currentSignal).toBe("weak");
    expect(result.evidenceQuality).toBe("weak");
    expect(result.blockers.some(b => b.toLowerCase().includes("confidence"))).toBe(true);
  });

  test("3. First baseline with mixed clarity is cautious baseline", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      hasComparison: false,
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
      label: "Mixed hiring signal",
    });
    // Mixed label means strong evidence (data is trustworthy) but mixed signal clarity.
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("mixed");
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
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("concentrated");
    expect(result.changeSignificance).toBe("baseline");
    expect(result.changeDirection).toBe("baseline");
    expect(result.publicUse).toBe("strong_baseline");
  });

  test("5. Changed brief with meaningful full-board delta is strong update", () => {
    const result = deriveBriefPublicReadiness(defaultArgs);
    expect(result.currentSignal).toBe("strong");
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("concentrated");
    expect(result.changeSignificance).toBe("meaningful_change");
    expect(result.publicUse).toBe("strong_update");
  });

  test("6. Missing full-job comparison data is limited comparison", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      comparisonStrength: "weak",
    });
    expect(result.evidenceQuality).toBe("strong");
    expect(result.changeSignificance).toBe("limited_comparison");
    expect(result.changeDirection).toBe("limited");
    expect(result.publicUse).toBe("cautious_baseline");
    expect(result.reasons.some(r => r.toLowerCase().includes("legacy") || r.toLowerCase().includes("incomplete") || r.toLowerCase().includes("limited"))).toBe(true);
  });

  test("7. High volume but mixed clarity is cautious", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      label: "Mixed hiring signal",
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
    });
    // Mixed label = strong evidence (data is trustworthy), mixed signal clarity
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("mixed");
    expect(result.publicUse).toBe("cautious_update");
  });

  test("8. Strong signal but minor change is cautious update", () => {
    const minorChange = deriveBriefPublicReadiness({
      ...defaultArgs,
      hasSignificantChange: false,
      significanceDrivers: [],
    });
    expect(minorChange.currentSignal).toBe("strong");
    expect(minorChange.evidenceQuality).toBe("strong");
    expect(minorChange.signalClarity).toBe("concentrated");
    expect(minorChange.changeSignificance).toBe("minor_change");
    expect(minorChange.publicUse).toBe("cautious_update");

    // Moderate evidence (medium confidence) with meaningful change is also cautious update
    const mediumConf = deriveBriefPublicReadiness({
      ...defaultArgs,
      watchlistReadConfidence: "medium",
    });
    expect(mediumConf.evidenceQuality).toBe("moderate");
    expect(mediumConf.signalClarity).toBe("concentrated");
    expect(mediumConf.changeSignificance).toBe("meaningful_change");
    expect(mediumConf.publicUse).toBe("cautious_update");
  });

  test("9. Strong signal with contraction is demoted to cautious update", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      changeDirection: "contraction",
    });
    expect(result.currentSignal).toBe("strong");
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("concentrated");
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
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("concentrated");
    expect(result.changeSignificance).toBe("meaningful_change");
    expect(result.changeDirection).toBe("replacement_churn");
    expect(result.publicUse).toBe("cautious_update");
  });

  // --- Phase 6C-1C new tests ---

  test("11. Stripe-style: strong evidence + broad signal + minor movement = cautious_update", () => {
    const result = deriveBriefPublicReadiness({
      jobsCount: 474,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
      label: "Broad platform and GTM hiring signal",
      hasComparison: true,
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
      comparisonStrength: "standard",
      changeDirection: "minor_movement",
    });
    // Evidence is strong — the data is trustworthy
    expect(result.evidenceQuality).toBe("strong");
    // Signal is broad — the strategic read is wide, not concentrated
    expect(result.signalClarity).toBe("broad");
    // Public use is cautious because signal is broad, not because evidence is weak
    expect(result.publicUse).toBe("cautious_update");
    // Reasons mention broad/non-concentrated signal
    expect(result.reasons.some(r => r.toLowerCase().includes("broad") || r.toLowerCase().includes("non-concentrated"))).toBe(true);
    // No blockers — data quality is fine
    expect(result.blockers).toHaveLength(0);
  });

  test("12. Stripe-style: strong evidence + broad signal + first baseline = cautious_baseline", () => {
    const result = deriveBriefPublicReadiness({
      jobsCount: 474,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
      label: "Broad platform and GTM hiring signal",
      hasComparison: false,
      hasMaterialChange: false,
      hasSignificantChange: false,
      significanceDrivers: [],
      comparisonStrength: "unavailable",
      changeDirection: "baseline",
    });
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("broad");
    expect(result.publicUse).toBe("cautious_baseline");
    expect(result.blockers).toHaveLength(0);
  });

  test("13. Broad board with meaningful expansion does NOT produce strong_update", () => {
    const result = deriveBriefPublicReadiness({
      jobsCount: 200,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
      label: "Broad platform and GTM hiring signal",
      hasComparison: true,
      hasMaterialChange: true,
      hasSignificantChange: true,
      significanceDrivers: ["count"],
      comparisonStrength: "standard",
      changeDirection: "expansion",
    });
    expect(result.evidenceQuality).toBe("strong");
    expect(result.signalClarity).toBe("broad");
    // Strong evidence but broad signal must stay cautious, not strong_update
    expect(result.publicUse).toBe("cautious_update");
    expect(result.publicUse).not.toBe("strong_update");
  });

  test("14. Partial grounding is moderate evidence with concentrated clarity", () => {
    const result = deriveBriefPublicReadiness({
      ...defaultArgs,
      proofRoleGrounding: "partial",
    });
    expect(result.evidenceQuality).toBe("moderate");
    expect(result.signalClarity).toBe("concentrated");
    expect(result.publicUse).toBe("cautious_update");
    expect(result.reasons.some(r => r.toLowerCase().includes("partially grounded") || r.toLowerCase().includes("partial"))).toBe(true);
  });
});
