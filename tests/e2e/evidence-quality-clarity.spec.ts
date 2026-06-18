import { test, expect } from "@playwright/test";
import {
  deriveEvidenceQuality,
  deriveSignalClarity,
  type WatchlistConfidenceLevel,
  type WatchlistProofGrounding,
} from "../../src/lib/signals/watchlistTaxonomy";

// ---------------------------------------------------------------------------
// deriveEvidenceQuality
// ---------------------------------------------------------------------------

test.describe("deriveEvidenceQuality", () => {
  const strongBase = {
    jobsCount: 10,
    companyMatchConfidence: "high" as WatchlistConfidenceLevel,
    watchlistReadConfidence: "high" as WatchlistConfidenceLevel,
    proofRoleGrounding: "exact" as WatchlistProofGrounding,
  };

  // --- Weak blockers ---

  test("T-J1: jobsCount <= 2 alone is weak", () => {
    expect(deriveEvidenceQuality({ ...strongBase, jobsCount: 2 })).toBe("weak");
    expect(deriveEvidenceQuality({ ...strongBase, jobsCount: 0 })).toBe("weak");
    expect(deriveEvidenceQuality({ ...strongBase, jobsCount: 1 })).toBe("weak");
  });

  test("T-J2: companyMatchConfidence low is weak", () => {
    expect(deriveEvidenceQuality({ ...strongBase, companyMatchConfidence: "low" })).toBe("weak");
  });

  test("T-J3: companyMatchConfidence none is weak", () => {
    expect(deriveEvidenceQuality({ ...strongBase, companyMatchConfidence: "none" })).toBe("weak");
  });

  test("T-J4: watchlistReadConfidence low is weak", () => {
    expect(deriveEvidenceQuality({ ...strongBase, watchlistReadConfidence: "low" })).toBe("weak");
  });

  test("T-J5: watchlistReadConfidence none is weak", () => {
    expect(deriveEvidenceQuality({ ...strongBase, watchlistReadConfidence: "none" })).toBe("weak");
  });

  test("T-J6: proofRoleGrounding fallback is weak", () => {
    expect(deriveEvidenceQuality({ ...strongBase, proofRoleGrounding: "fallback" })).toBe("weak");
  });

  test("T-J7: proofRoleGrounding none is weak", () => {
    expect(deriveEvidenceQuality({ ...strongBase, proofRoleGrounding: "none" })).toBe("weak");
  });

  // --- Moderate caveats ---

  test("T-E1: jobsCount 3 is moderate (above weak threshold, below strong)", () => {
    expect(deriveEvidenceQuality({ ...strongBase, jobsCount: 3 })).toBe("moderate");
  });

  test("T-E2: jobsCount 4 is moderate", () => {
    expect(deriveEvidenceQuality({ ...strongBase, jobsCount: 4 })).toBe("moderate");
  });

  test("T-E3: watchlistReadConfidence medium is moderate", () => {
    expect(deriveEvidenceQuality({ ...strongBase, watchlistReadConfidence: "medium" })).toBe("moderate");
  });

  test("T-E4: proofRoleGrounding partial is moderate", () => {
    expect(deriveEvidenceQuality({ ...strongBase, proofRoleGrounding: "partial" })).toBe("moderate");
  });

  // --- Strong ---

  test("T-F1: all clean inputs are strong", () => {
    expect(deriveEvidenceQuality(strongBase)).toBe("strong");
  });

  test("T-F2: high volume with high confidence and exact grounding is strong", () => {
    expect(deriveEvidenceQuality({ ...strongBase, jobsCount: 50 })).toBe("strong");
  });

  // --- Stripe-style (T-A, T-B) ---

  test("T-A: Stripe-style 474 jobs with high confidence and exact grounding is strong evidence", () => {
    // The broad label is NOT an input to deriveEvidenceQuality.
    // Broad signal shape must not degrade evidence quality.
    expect(
      deriveEvidenceQuality({
        jobsCount: 474,
        companyMatchConfidence: "high",
        watchlistReadConfidence: "high",
        proofRoleGrounding: "exact",
      })
    ).toBe("strong");
  });

  test("T-B: giant board (200+ roles) with clean signals is strong evidence regardless of label", () => {
    expect(
      deriveEvidenceQuality({
        jobsCount: 250,
        companyMatchConfidence: "high",
        watchlistReadConfidence: "high",
        proofRoleGrounding: "exact",
      })
    ).toBe("strong");
  });

  // --- Low company match (T-D) ---

  test("T-D: many roles but low company match confidence is weak evidence", () => {
    expect(
      deriveEvidenceQuality({
        jobsCount: 50,
        companyMatchConfidence: "low",
        watchlistReadConfidence: "high",
        proofRoleGrounding: "exact",
      })
    ).toBe("weak");
  });

  // --- Boundary: jobsCount 5 is the strong threshold ---

  test("boundary: jobsCount 5 with high confidence is strong", () => {
    expect(deriveEvidenceQuality({ ...strongBase, jobsCount: 5 })).toBe("strong");
  });

  // --- Companyatch confidence medium stays strong (not a caveat) ---

  test("companyMatchConfidence medium does not degrade from strong", () => {
    expect(deriveEvidenceQuality({ ...strongBase, companyMatchConfidence: "medium" })).toBe("strong");
  });
});

// ---------------------------------------------------------------------------
// deriveSignalClarity
// ---------------------------------------------------------------------------

test.describe("deriveSignalClarity", () => {
  // --- T-I: all 13 labels map to expected clarity ---

  test("T-I1: Product and engineering buildout signal is concentrated", () => {
    expect(deriveSignalClarity("Product and engineering buildout signal")).toBe("concentrated");
  });

  test("T-I2: Go-to-market hiring signal is concentrated", () => {
    expect(deriveSignalClarity("Go-to-market hiring signal")).toBe("concentrated");
  });

  test("T-I3: Platform and infrastructure signal is concentrated", () => {
    expect(deriveSignalClarity("Platform and infrastructure signal")).toBe("concentrated");
  });

  test("T-I4: Security and compliance signal is concentrated", () => {
    expect(deriveSignalClarity("Security and compliance signal")).toBe("concentrated");
  });

  test("T-I5: Data and AI signal is concentrated", () => {
    expect(deriveSignalClarity("Data and AI signal")).toBe("concentrated");
  });

  test("T-I6: Leadership hiring signal is concentrated", () => {
    expect(deriveSignalClarity("Leadership hiring signal")).toBe("concentrated");
  });

  test("T-I7: Multi-location hiring signal is multi_location", () => {
    expect(deriveSignalClarity("Multi-location hiring signal")).toBe("multi_location");
  });

  test("T-I8: Broad platform and GTM hiring signal is broad", () => {
    expect(deriveSignalClarity("Broad platform and GTM hiring signal")).toBe("broad");
  });

  test("T-I9: Broad multi-function hiring signal is broad", () => {
    expect(deriveSignalClarity("Broad multi-function hiring signal")).toBe("broad");
  });

  test("T-I10: Mixed hiring signal is mixed", () => {
    expect(deriveSignalClarity("Mixed hiring signal")).toBe("mixed");
  });

  test("T-I11: Limited hiring signal is thin", () => {
    expect(deriveSignalClarity("Limited hiring signal")).toBe("thin");
  });

  test("T-I12: Thin hiring signal is thin", () => {
    expect(deriveSignalClarity("Thin hiring signal")).toBe("thin");
  });

  test("T-I13: Tentative hiring signal is tentative", () => {
    expect(deriveSignalClarity("Tentative hiring signal")).toBe("tentative");
  });

  // --- Stripe-style (T-A): broad label is broad clarity, not a data defect ---

  test("T-A: Stripe label produces broad clarity (not a data-quality problem)", () => {
    expect(deriveSignalClarity("Broad platform and GTM hiring signal")).toBe("broad");
  });

  // --- Thin board (T-C) ---

  test("T-C: thin board label is thin clarity", () => {
    expect(deriveSignalClarity("Thin hiring signal")).toBe("thin");
  });
});

// ---------------------------------------------------------------------------
// Joint scenarios: evidence quality + signal clarity are independent
// ---------------------------------------------------------------------------

test.describe("Evidence Quality and Signal Clarity are independent dimensions", () => {
  test("T-A joint: Stripe has strong evidence AND broad clarity — not moderate evidence", () => {
    const quality = deriveEvidenceQuality({
      jobsCount: 474,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
    });
    const clarity = deriveSignalClarity("Broad platform and GTM hiring signal");

    expect(quality).toBe("strong");
    expect(clarity).toBe("broad");
  });

  test("T-C joint: thin board is weak evidence AND thin clarity", () => {
    const quality = deriveEvidenceQuality({
      jobsCount: 1,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
    });
    const clarity = deriveSignalClarity("Thin hiring signal");

    expect(quality).toBe("weak");
    expect(clarity).toBe("thin");
  });

  test("T-E joint: partial grounding is moderate evidence with concentrated clarity", () => {
    const quality = deriveEvidenceQuality({
      jobsCount: 8,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "partial",
    });
    const clarity = deriveSignalClarity("Go-to-market hiring signal");

    expect(quality).toBe("moderate");
    expect(clarity).toBe("concentrated");
  });

  test("T-F joint: strong concentrated board is strong evidence AND concentrated clarity", () => {
    const quality = deriveEvidenceQuality({
      jobsCount: 15,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
    });
    const clarity = deriveSignalClarity("Go-to-market hiring signal");

    expect(quality).toBe("strong");
    expect(clarity).toBe("concentrated");
  });

  test("T-G: broad label does not pollute evidence quality — strong evidence can coexist with broad clarity", () => {
    const quality = deriveEvidenceQuality({
      jobsCount: 100,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
    });
    const clarity = deriveSignalClarity("Broad multi-function hiring signal");

    // Evidence is strong because the data is trustworthy.
    expect(quality).toBe("strong");
    // Clarity is broad because the read is diffuse.
    expect(clarity).toBe("broad");
    // They are independent — strong evidence does not imply concentrated clarity.
    expect(quality).not.toBe(clarity);
  });

  test("mixed signal with strong evidence stays strong evidence", () => {
    const quality = deriveEvidenceQuality({
      jobsCount: 20,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
    });
    const clarity = deriveSignalClarity("Mixed hiring signal");

    expect(quality).toBe("strong");
    expect(clarity).toBe("mixed");
  });

  test("multi-location board with strong evidence is strong evidence and multi_location clarity", () => {
    const quality = deriveEvidenceQuality({
      jobsCount: 12,
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
    });
    const clarity = deriveSignalClarity("Multi-location hiring signal");

    expect(quality).toBe("strong");
    expect(clarity).toBe("multi_location");
  });
});
