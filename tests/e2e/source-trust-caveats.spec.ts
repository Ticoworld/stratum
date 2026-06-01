import { test, expect } from "@playwright/test";
import {
  buildStratumLimitations,
  buildSourceScopeSummary,
} from "../../src/lib/briefs/presentation";
import type { StratumResult } from "../../src/lib/services/StratumInvestigator";
import type { ProviderAttemptSummary } from "../../src/lib/services/StratumInvestigator";

// ---------------------------------------------------------------------------
// Minimal StratumResult factory
// ---------------------------------------------------------------------------

function makeProviderSummary(
  source: ProviderAttemptSummary["source"],
  status: ProviderAttemptSummary["status"]
): ProviderAttemptSummary {
  return {
    source,
    status,
    jobsCount: 0,
    tokensTried: [],
    errorMessages: [],
    usedForBrief: status === "jobs_found",
    note: "",
  };
}

function makeResult(overrides: Partial<StratumResult>): StratumResult {
  const base: StratumResult = {
    companyName: "Acme Corp",
    jobs: [],
    proofRoles: [],
    providerAttempts: [],
    providerAttemptSummaries: [
      makeProviderSummary("GREENHOUSE", "jobs_found"),
      makeProviderSummary("LEVER", "not_attempted_after_match"),
      makeProviderSummary("ASHBY", "not_attempted_after_match"),
      makeProviderSummary("WORKABLE", "not_attempted_after_match"),
    ],
    proofRoleGrounding: "exact",
    proofRoleGroundingExplanation:
      "The read is grounded in 3 proof roles matched exactly by title.",
    hiringMix: [],
    functionalMix: [["Engineering", 10]],
    hiringVelocity: "Unknown",
    strategicVerdict: "Go-to-market hiring signal",
    engineeringVsSalesRatio: "-",
    keywordFindings: [],
    summary: "Test summary.",
    analyzedAt: new Date().toISOString(),
    analysisTimeMs: 100,
    apiSource: "GREENHOUSE",
    resultState: "supported_provider_matched_with_observed_openings",
    resultStateExplanation: "Stratum confirmed Greenhouse and observed current openings there.",
    companyMatchConfidence: "high",
    companyMatchExplanation:
      "The company match is direct and confirmed on the matched ATS source.",
    companyResolutionState: "direct_confirmed_match",
    companyResolutionExplanation:
      "The requested company name resolved directly to the matched ATS token.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation:
      "Stratum observed openings from Greenhouse only. This is one-provider, point-in-time evidence and not full company coverage.",
    watchlistReadConfidence: "high",
    watchlistReadExplanation:
      "Read confidence is high for this product because the match is direct, the role count is not thin, grounding is exact, and multiple proof roles expose provider timestamps.",
    resolutionKind: "direct",
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    providerFailures: 0,
    providerFailureExplanation:
      "No provider request failures were recorded during this search.",
    unsupportedSourcePattern: null,
    unsupportedSourcePatternExplanation: null,
    artifactOrigin: "saved",
  };

  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Section A: High-confidence Greenhouse-only successful brief
// ---------------------------------------------------------------------------

test.describe("A. High-confidence Greenhouse-only brief", () => {
  const result = makeResult({});

  test("T-SC-A1: source scope appears once and mentions Greenhouse", () => {
    const lims = buildStratumLimitations(result);
    const ghCount = lims.filter((l) => l.includes("Greenhouse")).length;
    expect(ghCount).toBe(1);
  });

  test("T-SC-A2: no hard-coded full-company duplicate", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("It is not a full company view"))).toBe(false);
  });

  test("T-SC-A3: no 'one matched provider is not full company coverage' duplicate", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.toLowerCase().includes("one matched provider is not full"))).toBe(false);
  });

  test("T-SC-A4: no high-confidence read explanation", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("Read confidence is high"))).toBe(false);
  });

  test("T-SC-A5: no exact proof grounding explanation", () => {
    const lims = buildStratumLimitations(result);
    // Grounding is "exact" — should not appear in caveats
    expect(lims.some((l) => l.includes("grounded in") && l.includes("matched exactly"))).toBe(false);
  });

  test("T-SC-A6: no timestamp/URL feed-gap caveat on high-confidence brief", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("provider timestamp"))).toBe(false);
    expect(lims.some((l) => l.includes("direct posting URL"))).toBe(false);
  });

  test("T-SC-A7: total caveat count is small (≤3) for a clean brief", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.length).toBeLessThanOrEqual(3);
  });

  test("T-SC-A8: source scope is the compact 'Greenhouse only.' form", () => {
    const scope = buildSourceScopeSummary(result);
    expect(scope).toBe("Greenhouse only.");
  });
});

// ---------------------------------------------------------------------------
// Section B: Greenhouse success + Ashby failure
// ---------------------------------------------------------------------------

test.describe("B. Greenhouse success + Ashby failure", () => {
  const result = makeResult({
    providerAttemptSummaries: [
      makeProviderSummary("GREENHOUSE", "jobs_found"),
      makeProviderSummary("ASHBY", "error"),
      makeProviderSummary("LEVER", "not_attempted_after_match"),
      makeProviderSummary("WORKABLE", "not_applicable"),
    ],
    providerFailures: 1,
    providerFailureExplanation:
      "1 provider request failed during this search: Ashby.",
    sourceCoverageExplanation:
      "Stratum used Greenhouse, but Ashby failed during the search. This remains narrow, one-provider evidence rather than full company coverage.",
  });

  test("T-SC-B1: Ashby appears at most once in all limitations", () => {
    const lims = buildStratumLimitations(result);
    const ashbyCount = lims.filter((l) => l.includes("Ashby")).length;
    expect(ashbyCount).toBeLessThanOrEqual(1);
  });

  test("T-SC-B2: provider failure not separately listed when resultState is observed openings", () => {
    const lims = buildStratumLimitations(result);
    // The result state is supported_provider_matched_with_observed_openings,
    // so the separate providerFailureExplanation should NOT appear.
    expect(lims.some((l) => l.includes("1 provider request failed during this search"))).toBe(false);
  });

  test("T-SC-B3: source scope summary names the failed provider", () => {
    const scope = buildSourceScopeSummary(result);
    expect(scope).toContain("Ashby");
    expect(scope).toContain("Greenhouse");
  });

  test("T-SC-B4: source scope summary is a single sentence block (not fragmented)", () => {
    const scope = buildSourceScopeSummary(result);
    // Should not mention "one provider" or "not full coverage" as separate fragments
    expect(scope).not.toContain("one-provider");
    expect(scope).not.toContain("not full company coverage");
  });

  test("T-SC-B5: no separate 'Provider failures occurred on Ashby' line", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.startsWith("Provider failures occurred on"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section C: Medium-confidence alias match
// ---------------------------------------------------------------------------

test.describe("C. Medium-confidence alias match", () => {
  const result = makeResult({
    companyMatchConfidence: "medium",
    companyMatchExplanation:
      "The company match depends on a known alias rather than a direct token match.",
    watchlistReadConfidence: "medium",
    watchlistReadExplanation:
      "Read confidence is medium because the brief is only partially grounded in the displayed proof roles.",
    proofRoleGrounding: "partial",
    proofRoleGroundingExplanation:
      "The read is partially grounded: 2 of 3 roles matched by title. Proof roles are from the observed board.",
  });

  test("T-SC-C1: company match warning appears (not high confidence)", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("known alias"))).toBe(true);
  });

  test("T-SC-C2: medium-confidence read explanation appears", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("Read confidence is medium"))).toBe(true);
  });

  test("T-SC-C3: source scope appears exactly once", () => {
    const lims = buildStratumLimitations(result);
    const sourceScopeCount = lims.filter((l) => l.includes("Greenhouse")).length;
    expect(sourceScopeCount).toBe(1);
  });

  test("T-SC-C4: partial proof grounding explanation does NOT appear (medium confidence already explains it)", () => {
    // Grounding is "partial" — not "fallback" — so grounding explanation should be omitted
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("partially grounded: 2 of 3"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section D: Zero observed openings
// ---------------------------------------------------------------------------

test.describe("D. Zero observed openings", () => {
  const result = makeResult({
    resultState: "supported_provider_matched_with_zero_observed_openings",
    apiSource: "GREENHOUSE",
    providerAttemptSummaries: [makeProviderSummary("GREENHOUSE", "zero_jobs")],
    watchlistReadConfidence: "none",
    watchlistReadExplanation:
      "No watchlist read is shown because the matched provider exposed zero current openings.",
  });

  test("T-SC-D1: zero-openings caveat remains", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("Zero observed openings"))).toBe(true);
  });

  test("T-SC-D2: source scope reflects zero-openings state", () => {
    const scope = buildSourceScopeSummary(result);
    expect(scope).toContain("No openings observed from Greenhouse");
  });

  test("T-SC-D3: zero-openings language says does-not-mean, not 'is not the same as'", () => {
    const lims = buildStratumLimitations(result);
    const zeroLine = lims.find((l) => l.includes("Zero observed openings"));
    expect(zeroLine).toBeDefined();
    expect(zeroLine).toContain("does not mean");
  });
});

// ---------------------------------------------------------------------------
// Section E: No provider found
// ---------------------------------------------------------------------------

test.describe("E. No provider found", () => {
  const result = makeResult({
    resultState: "no_matched_provider_found",
    apiSource: null,
    providerAttemptSummaries: [
      makeProviderSummary("GREENHOUSE", "not_found"),
      makeProviderSummary("ASHBY", "not_found"),
    ],
    watchlistReadConfidence: "none",
    watchlistReadExplanation:
      "No watchlist read is shown because Stratum did not confirm a supported provider for this search.",
    companyMatchConfidence: "none",
    companyMatchExplanation:
      "Stratum could not confirm a supported ATS match for this search.",
  });

  test("T-SC-E1: no-provider caveat remains", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("No supported ATS match does not mean"))).toBe(true);
  });

  test("T-SC-E2: source scope reflects no-provider state", () => {
    const scope = buildSourceScopeSummary(result);
    expect(scope).toBe("No supported ATS source matched.");
  });

  test("T-SC-E3: company match explanation appears (confidence none → not high)", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("could not confirm a supported ATS match"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section F: Fallback proof grounding
// ---------------------------------------------------------------------------

test.describe("F. Fallback proof grounding", () => {
  const result = makeResult({
    proofRoleGrounding: "fallback",
    proofRoleGroundingExplanation:
      "Proof roles are distributed across the top hiring mix buckets to represent the board's actual spread.",
    watchlistReadConfidence: "medium",
    watchlistReadExplanation:
      "Read confidence is medium because the role pattern is visible but still limited to one matched provider.",
  });

  test("T-SC-F1: fallback grounding explanation appears", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("top hiring mix buckets"))).toBe(true);
  });

  test("T-SC-F2: medium confidence explanation also appears", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("Read confidence is medium"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section G: buildSourceScopeSummary direct tests
// ---------------------------------------------------------------------------

test.describe("G. buildSourceScopeSummary direct tests", () => {

  test("T-SC-G1: query-specified source produces compact label", () => {
    const result = makeResult({
      sourceInputMode: "supported_source_input",
      requestedSourceHint: "GREENHOUSE",
      providerAttemptSummaries: [
        makeProviderSummary("GREENHOUSE", "jobs_found"),
        makeProviderSummary("LEVER", "not_applicable"),
        makeProviderSummary("ASHBY", "not_applicable"),
      ],
    });
    const scope = buildSourceScopeSummary(result);
    expect(scope).toContain("query-specified");
    expect(scope).toContain("Greenhouse");
  });

  test("T-SC-G2: provider_failure state produces failure message", () => {
    const result = makeResult({
      resultState: "provider_failure",
      apiSource: null,
    });
    const scope = buildSourceScopeSummary(result);
    expect(scope).toContain("Provider fetch failed");
  });

  test("T-SC-G3: unsupported pattern produces appropriate message", () => {
    const result = makeResult({
      resultState: "unsupported_ats_or_source_pattern",
      apiSource: null,
    });
    const scope = buildSourceScopeSummary(result);
    expect(scope).toContain("Unsupported");
  });

  test("T-SC-G4: Ashby failure mentioned in source scope for partial-failure brief", () => {
    const result = makeResult({
      providerAttemptSummaries: [
        makeProviderSummary("GREENHOUSE", "jobs_found"),
        makeProviderSummary("ASHBY", "error"),
        makeProviderSummary("LEVER", "not_attempted_after_match"),
        makeProviderSummary("WORKABLE", "not_applicable"),
      ],
    });
    const scope = buildSourceScopeSummary(result);
    expect(scope).toContain("Ashby");
    expect(scope).toContain("failed");
  });

  test("T-SC-G5: clean brief without failures is just provider name + 'only.'", () => {
    const scope = buildSourceScopeSummary(makeResult({}));
    expect(scope).toBe("Greenhouse only.");
  });

  test("T-SC-G6: zero-openings brief produces 'No openings observed' message", () => {
    const scope = buildSourceScopeSummary(makeResult({
      resultState: "supported_provider_matched_with_zero_observed_openings",
    }));
    expect(scope).toContain("No openings observed from Greenhouse");
  });
});

// ---------------------------------------------------------------------------
// Section H: Feed-gap caveats gated on weak evidence
// ---------------------------------------------------------------------------

test.describe("H. Feed-gap caveats only on weak evidence", () => {
  const proofRolesNoTimestamp = [
    { title: "Engineer", department: "Eng", location: "SF", source: "GREENHOUSE" as const,
      roleId: null, roleIdType: null, requisitionId: null, jobUrl: "http://example.com",
      applyUrl: null, sourceTimestamp: null, sourceTimestampType: null,
      observedAt: new Date().toISOString() },
  ];
  const proofRolesNoUrl = [
    { title: "Engineer", department: "Eng", location: "SF", source: "GREENHOUSE" as const,
      roleId: null, roleIdType: null, requisitionId: null, jobUrl: null,
      applyUrl: null, sourceTimestamp: "2025-01-01", sourceTimestampType: "published_at" as const,
      observedAt: new Date().toISOString() },
  ];

  test("T-SC-H1: timestamp caveat NOT shown on high-confidence brief", () => {
    const lims = buildStratumLimitations(makeResult({ proofRoles: proofRolesNoTimestamp }));
    expect(lims.some((l) => l.includes("provider timestamp"))).toBe(false);
  });

  test("T-SC-H2: URL caveat NOT shown on high-confidence brief", () => {
    const lims = buildStratumLimitations(makeResult({ proofRoles: proofRolesNoUrl }));
    expect(lims.some((l) => l.includes("direct posting URL"))).toBe(false);
  });

  test("T-SC-H3: timestamp caveat shown when watchlistReadConfidence is low", () => {
    const lims = buildStratumLimitations(makeResult({
      proofRoles: proofRolesNoTimestamp,
      watchlistReadConfidence: "low",
      watchlistReadExplanation: "Read confidence is low.",
    }));
    expect(lims.some((l) => l.includes("provider timestamp"))).toBe(true);
  });

  test("T-SC-H4: URL caveat shown when proofRoleGrounding is fallback", () => {
    const lims = buildStratumLimitations(makeResult({
      proofRoles: proofRolesNoUrl,
      proofRoleGrounding: "fallback",
      proofRoleGroundingExplanation: "Proof roles selected by bucket coverage.",
    }));
    expect(lims.some((l) => l.includes("direct posting URL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section I: Complete provider failure (all providers failed)
// ---------------------------------------------------------------------------

test.describe("I. Complete provider failure", () => {
  const result = makeResult({
    resultState: "provider_failure",
    apiSource: null,
    providerAttemptSummaries: [
      makeProviderSummary("GREENHOUSE", "error"),
      makeProviderSummary("ASHBY", "error"),
    ],
    providerFailures: 2,
    providerFailureExplanation:
      "2 provider requests failed during this search: Greenhouse and Ashby.",
    watchlistReadConfidence: "none",
  });

  test("T-SC-I1: provider failure explanation appears for complete failure", () => {
    const lims = buildStratumLimitations(result);
    expect(lims.some((l) => l.includes("2 provider requests failed"))).toBe(true);
  });

  test("T-SC-I2: source scope correctly reflects provider failure", () => {
    const scope = buildSourceScopeSummary(result);
    expect(scope).toContain("Provider fetch failed");
  });
});
