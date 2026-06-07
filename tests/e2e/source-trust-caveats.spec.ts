import { test, expect } from "@playwright/test";
import {
  buildSourceScopeSummary,
  buildStratumLimitations,
} from "../../src/lib/briefs/presentation";
import type { StratumResult } from "../../src/lib/services/StratumInvestigator";
import type { ProviderAttemptSummary } from "../../src/lib/services/StratumInvestigator";

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
      makeProviderSummary("ASHBY", "jobs_found"),
      makeProviderSummary("GREENHOUSE", "not_attempted_after_match"),
    ],
    proofRoleGrounding: "partial",
    proofRoleGroundingExplanation:
      "The read is partially grounded: 2 of 3 roles matched by title. Proof roles are from the observed board.",
    hiringMix: [],
    functionalMix: [["Sales", 50], ["Engineering", 32]],
    hiringVelocity: "Unknown",
    strategicVerdict: "Go-to-market hiring signal",
    engineeringVsSalesRatio: "-",
    keywordFindings: [],
    summary: "Test summary.",
    analyzedAt: new Date().toISOString(),
    analysisTimeMs: 100,
    apiSource: "ASHBY",
    resultState: "supported_provider_matched_with_observed_openings",
    resultStateExplanation: "Stratum confirmed Ashby and observed current openings there.",
    companyMatchConfidence: "high",
    companyMatchExplanation:
      "The company match is direct and confirmed on the matched ATS source.",
    companyResolutionState: "direct_confirmed_match",
    companyResolutionExplanation:
      "The requested company name resolved directly to the matched ATS token.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation:
      "Stratum observed openings from Ashby only. This is one-provider evidence.",
    watchlistReadConfidence: "medium",
    watchlistReadExplanation:
      "Read confidence is medium because the brief is only partially grounded in the displayed proof roles.",
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

test.describe("public source and trust copy", () => {
  test("observed openings use source-only coverage wording", () => {
    const scope = buildSourceScopeSummary(makeResult({}));
    expect(scope).toBe("Ashby only. Not full company coverage.");
  });

  test("normal limitations omit internal match and proof mechanics", () => {
    const limitations = buildStratumLimitations(makeResult({}));
    const copy = limitations.join(" ");

    expect(copy).toContain("Ashby only. Not full company coverage.");
    expect(copy).not.toContain("matched ATS token");
    expect(copy).not.toContain("partially grounded");
    expect(copy).not.toContain("Read confidence");
    expect(copy).not.toContain("displayed proof roles");
  });

  test("zero-job matched source uses plain elsewhere caveat", () => {
    const scope = buildSourceScopeSummary(
      makeResult({
        resultState: "supported_provider_matched_with_zero_observed_openings",
      })
    );

    expect(scope).toBe("No jobs found in this source. The company may still have jobs elsewhere.");
  });

  test("unsupported source uses unsupported wording", () => {
    const scope = buildSourceScopeSummary(
      makeResult({
        resultState: "unsupported_ats_or_source_pattern",
        apiSource: null,
      })
    );

    expect(scope).toBe("This source is not supported yet.");
  });

  test("no matched provider does not imply no hiring", () => {
    const scope = buildSourceScopeSummary(
      makeResult({
        resultState: "no_matched_provider_found",
        apiSource: null,
      })
    );

    expect(scope).toBe("No supported source matched. The company may still have jobs elsewhere.");
  });
});
