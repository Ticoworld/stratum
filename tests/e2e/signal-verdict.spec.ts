import { test, expect } from "@playwright/test";
import {
  deriveSignalVerdict,
  type SignalVerdictArgs,
} from "../../src/lib/signals/signalVerdict";

// ---------------------------------------------------------------------------
// Baseline args — strong evidence, concentrated baseline, reliable source.
// Each test overrides only the field(s) under test.
// ---------------------------------------------------------------------------

const strongBase: SignalVerdictArgs = {
  evidenceQuality: "strong",
  signalClarity: "concentrated",
  changeSignificance: "baseline",
  changeDirection: "baseline",
  companyMatchConfidence: "high",
  watchlistReadConfidence: "high",
  proofRoleGrounding: "exact",
  resultState: "supported_provider_matched_with_observed_openings",
  jobsObservedCount: 15,
};

// ---------------------------------------------------------------------------
// VERIFY SOURCE
// ---------------------------------------------------------------------------

test.describe("verify_source", () => {
  test("T-VS1: provider_failure resultState → verify_source", () => {
    const result = deriveSignalVerdict({ ...strongBase, resultState: "provider_failure" });
    expect(result.verdict).toBe("verify_source");
    expect(result.alertPriority).toBe("source_issue");
  });

  test("T-VS2: unsupported_ats_or_source_pattern resultState → verify_source", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      resultState: "unsupported_ats_or_source_pattern",
    });
    expect(result.verdict).toBe("verify_source");
    expect(result.alertPriority).toBe("source_issue");
  });

  test("T-VS3: companyMatchConfidence none → verify_source", () => {
    const result = deriveSignalVerdict({ ...strongBase, companyMatchConfidence: "none" });
    expect(result.verdict).toBe("verify_source");
    expect(result.alertPriority).toBe("source_issue");
  });

  test("T-VS4: companyMatchConfidence low + watchlistReadConfidence low → verify_source", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      companyMatchConfidence: "low",
      watchlistReadConfidence: "low",
      evidenceQuality: "weak",
    });
    expect(result.verdict).toBe("verify_source");
    expect(result.alertPriority).toBe("source_issue");
  });

  test("T-VS5: companyMatchConfidence low + watchlistReadConfidence none → verify_source", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      companyMatchConfidence: "low",
      watchlistReadConfidence: "none",
      evidenceQuality: "weak",
    });
    expect(result.verdict).toBe("verify_source");
    expect(result.alertPriority).toBe("source_issue");
  });

  test("T-VS6: verify_source takes priority over act (low match + meaningful concentrated expansion)", () => {
    // Even with a "perfect" signal shape, a bad source wins.
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
      companyMatchConfidence: "low",
      watchlistReadConfidence: "low",
      evidenceQuality: "weak",
    });
    expect(result.verdict).toBe("verify_source");
  });

  test("T-VS7: companyMatchConfidence low + watchlistReadConfidence medium → NOT verify_source (falls to wait)", () => {
    // Low match + medium read is a data-quality issue only, not a source problem.
    const result = deriveSignalVerdict({
      ...strongBase,
      companyMatchConfidence: "low",
      watchlistReadConfidence: "medium",
      evidenceQuality: "weak",
    });
    // evidenceQuality is weak so it hits wait, not verify_source
    expect(result.verdict).toBe("wait");
  });

  test("T-VS8: partial provider failure (other provider succeeded) → NOT verify_source", () => {
    // If one provider succeeded, resultState is "supported_provider_matched_with_observed_openings".
    // The partial Ashby failure is not visible to verdict — correct behavior.
    const result = deriveSignalVerdict({
      ...strongBase,
      resultState: "supported_provider_matched_with_observed_openings",
    });
    expect(result.verdict).not.toBe("verify_source");
  });
});

// ---------------------------------------------------------------------------
// IGNORE
// ---------------------------------------------------------------------------

test.describe("ignore", () => {
  test("T-IG1: no_matched_provider_found → ignore", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      resultState: "no_matched_provider_found",
    });
    expect(result.verdict).toBe("ignore");
    expect(result.alertPriority).toBe("none");
  });

  test("T-IG2: zero observed openings + weak evidence → ignore", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      resultState: "supported_provider_matched_with_zero_observed_openings",
      evidenceQuality: "weak",
      jobsObservedCount: 0,
    });
    expect(result.verdict).toBe("ignore");
  });

  test("T-IG3: jobsObservedCount 1 + weak evidence → ignore", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      jobsObservedCount: 1,
      evidenceQuality: "weak",
    });
    expect(result.verdict).toBe("ignore");
  });

  test("T-IG4: jobsObservedCount 2 + weak evidence → ignore", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      jobsObservedCount: 2,
      evidenceQuality: "weak",
    });
    expect(result.verdict).toBe("ignore");
  });

  test("T-IG5: proofRoleGrounding none + watchlistReadConfidence none → ignore", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      proofRoleGrounding: "none",
      watchlistReadConfidence: "none",
      evidenceQuality: "weak",
    });
    expect(result.verdict).toBe("ignore");
  });

  test("T-IG6: ignore takes priority over wait (1 job, weak evidence → ignore, not wait)", () => {
    // Ensure the ordering is correct: ignore fires before the weak-evidence wait gate.
    const result = deriveSignalVerdict({
      ...strongBase,
      jobsObservedCount: 1,
      evidenceQuality: "weak",
    });
    expect(result.verdict).toBe("ignore");
    expect(result.verdict).not.toBe("wait");
  });

  test("T-IG7: jobsObservedCount 3 + weak evidence → NOT ignore (falls to wait)", () => {
    // 3 jobs with weak evidence is borderline — wait, not ignore.
    const result = deriveSignalVerdict({
      ...strongBase,
      jobsObservedCount: 3,
      evidenceQuality: "weak",
      companyMatchConfidence: "medium",
      watchlistReadConfidence: "medium",
      proofRoleGrounding: "partial",
    });
    expect(result.verdict).toBe("wait");
  });
});

// ---------------------------------------------------------------------------
// WAIT
// ---------------------------------------------------------------------------

test.describe("wait", () => {
  test("T-WT1: evidenceQuality weak (not caught by ignore) → wait", () => {
    // jobsCount 3 means not caught by ignore (≤2 gate); falls to wait.
    const result = deriveSignalVerdict({
      ...strongBase,
      jobsObservedCount: 3,
      evidenceQuality: "weak",
      companyMatchConfidence: "medium",
      watchlistReadConfidence: "medium",
      proofRoleGrounding: "partial",
    });
    expect(result.verdict).toBe("wait");
    expect(result.alertPriority).toBe("none");
  });

  test("T-WT2: signalClarity thin → wait", () => {
    const result = deriveSignalVerdict({ ...strongBase, signalClarity: "thin" });
    expect(result.verdict).toBe("wait");
    expect(result.alertPriority).toBe("none");
  });

  test("T-WT3: signalClarity tentative → wait", () => {
    const result = deriveSignalVerdict({ ...strongBase, signalClarity: "tentative" });
    expect(result.verdict).toBe("wait");
    expect(result.alertPriority).toBe("none");
  });

  test("T-WT4: limited_comparison + moderate evidence → wait", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "limited_comparison",
      changeDirection: "limited",
      evidenceQuality: "moderate",
    });
    expect(result.verdict).toBe("wait");
  });

  test("T-WT5: limited_comparison + weak evidence → wait", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "limited_comparison",
      changeDirection: "limited",
      evidenceQuality: "weak",
      jobsObservedCount: 5,
      companyMatchConfidence: "medium",
      watchlistReadConfidence: "medium",
      proofRoleGrounding: "partial",
    });
    expect(result.verdict).toBe("wait");
  });

  test("T-WT6: thin clarity + strong evidence → wait (clarity wins over evidence)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      signalClarity: "thin",
      evidenceQuality: "strong",
    });
    expect(result.verdict).toBe("wait");
  });

  test("T-WT7: meaningful_change + weak evidence → wait, not act", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
      evidenceQuality: "weak",
      jobsObservedCount: 5,
      companyMatchConfidence: "medium",
      watchlistReadConfidence: "medium",
      proofRoleGrounding: "partial",
    });
    expect(result.verdict).toBe("wait");
  });

  test("T-WT8: meaningful_change + thin clarity → wait, not act", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
      signalClarity: "thin",
    });
    expect(result.verdict).toBe("wait");
  });
});

// ---------------------------------------------------------------------------
// ACT
// ---------------------------------------------------------------------------

test.describe("act", () => {
  test("T-ACT1: strong + concentrated + meaningful expansion + high match → act", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
    });
    expect(result.verdict).toBe("act");
    expect(result.alertPriority).toBe("immediate");
    expect(result.headline).toBe("Signal — act now");
    expect(result.reason).toContain("expansion");
  });

  test("T-ACT2: strong + concentrated + meaningful contraction + high match → act", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "contraction",
    });
    expect(result.verdict).toBe("act");
    expect(result.alertPriority).toBe("immediate");
    expect(result.reason).toContain("contraction");
  });

  test("T-ACT3: strong + concentrated + meaningful mix_shift + high match → act", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "mix_shift",
    });
    expect(result.verdict).toBe("act");
    expect(result.reason).toContain("mix shift");
  });

  test("T-ACT4: medium company match still produces act (medium is reliable enough)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
      companyMatchConfidence: "medium",
    });
    expect(result.verdict).toBe("act");
  });

  test("T-ACT5: broad signal + meaningful expansion → NOT act (stays watch)", () => {
    // Broad signals are explicitly excluded from ACT in this phase.
    const result = deriveSignalVerdict({
      ...strongBase,
      signalClarity: "broad",
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
    });
    expect(result.verdict).toBe("watch");
    expect(result.verdict).not.toBe("act");
  });

  test("T-ACT6: mixed signal + meaningful expansion → NOT act (stays watch)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      signalClarity: "mixed",
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
    });
    expect(result.verdict).toBe("watch");
  });

  test("T-ACT7: moderate evidence + concentrated + meaningful expansion → NOT act (stays watch)", () => {
    // ACT requires strong evidence; moderate evidence stays watch.
    const result = deriveSignalVerdict({
      ...strongBase,
      evidenceQuality: "moderate",
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
    });
    expect(result.verdict).toBe("watch");
    expect(result.verdict).not.toBe("act");
  });

  test("T-ACT8: replacement_churn with strong evidence → NOT act (stays watch)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "replacement_churn",
    });
    expect(result.verdict).toBe("watch");
  });

  test("T-ACT9: geography_shift with strong evidence → NOT act (stays watch)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "geography_shift",
    });
    expect(result.verdict).toBe("watch");
  });
});

// ---------------------------------------------------------------------------
// WATCH
// ---------------------------------------------------------------------------

test.describe("watch", () => {
  test("T-WCH1: strong + baseline → watch (Stripe-style first read)", () => {
    const result = deriveSignalVerdict({ ...strongBase });
    expect(result.verdict).toBe("watch");
    expect(result.alertPriority).toBe("digest");
    expect(result.headline).toBe("Worth watching");
  });

  test("T-WCH2: strong + minor_change → watch", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "minor_change",
      changeDirection: "minor_movement",
    });
    expect(result.verdict).toBe("watch");
  });

  test("T-WCH3: strong + broad + baseline → watch (Stripe exact scenario)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      signalClarity: "broad",
      jobsObservedCount: 474,
    });
    expect(result.verdict).toBe("watch");
  });

  test("T-WCH4: strong + broad + meaningful expansion → watch (broad stays watch)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      signalClarity: "broad",
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
    });
    expect(result.verdict).toBe("watch");
  });

  test("T-WCH5: moderate evidence + concentrated + baseline → watch", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      evidenceQuality: "moderate",
    });
    expect(result.verdict).toBe("watch");
  });

  test("T-WCH6: strong evidence + limited_comparison → watch (strong evidence carries it)", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "limited_comparison",
      changeDirection: "limited",
    });
    expect(result.verdict).toBe("watch");
  });

  test("T-WCH7: replacement_churn reason is churn-specific", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "replacement_churn",
    });
    expect(result.verdict).toBe("watch");
    expect(result.reason.toLowerCase()).toContain("churn");
  });

  test("T-WCH8: geography_shift reason is geography-specific", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "geography_shift",
    });
    expect(result.verdict).toBe("watch");
    expect(result.reason.toLowerCase()).toContain("geographic");
  });

  test("T-WCH9: multi_location signal with strong evidence → watch", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      signalClarity: "multi_location",
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
    });
    expect(result.verdict).toBe("watch");
  });
});

// ---------------------------------------------------------------------------
// Named scenario tests
// ---------------------------------------------------------------------------

test.describe("Named scenarios", () => {
  test("Stripe: 474 roles, strong evidence, broad baseline → watch", () => {
    const result = deriveSignalVerdict({
      evidenceQuality: "strong",
      signalClarity: "broad",
      changeSignificance: "baseline",
      changeDirection: "baseline",
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
      resultState: "supported_provider_matched_with_observed_openings",
      jobsObservedCount: 474,
    });
    expect(result.verdict).toBe("watch");
    expect(result.alertPriority).toBe("digest");
  });

  test("Concentrated expansion: strong evidence, concentrated, meaningful expansion → act", () => {
    const result = deriveSignalVerdict({
      evidenceQuality: "strong",
      signalClarity: "concentrated",
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
      resultState: "supported_provider_matched_with_observed_openings",
      jobsObservedCount: 20,
    });
    expect(result.verdict).toBe("act");
    expect(result.alertPriority).toBe("immediate");
  });

  test("OpenAI-style low confidence: low match + low read → verify_source", () => {
    const result = deriveSignalVerdict({
      evidenceQuality: "weak",
      signalClarity: "concentrated",
      changeSignificance: "baseline",
      changeDirection: "baseline",
      companyMatchConfidence: "low",
      watchlistReadConfidence: "low",
      proofRoleGrounding: "fallback",
      resultState: "ambiguous_company_match",
      jobsObservedCount: 10,
    });
    expect(result.verdict).toBe("verify_source");
    expect(result.alertPriority).toBe("source_issue");
  });

  test("Thin board (1 role): ignore", () => {
    const result = deriveSignalVerdict({
      evidenceQuality: "weak",
      signalClarity: "thin",
      changeSignificance: "baseline",
      changeDirection: "baseline",
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
      resultState: "supported_provider_matched_with_observed_openings",
      jobsObservedCount: 1,
    });
    expect(result.verdict).toBe("ignore");
  });

  test("Thin board (2 roles): ignore", () => {
    const result = deriveSignalVerdict({
      evidenceQuality: "weak",
      signalClarity: "thin",
      changeSignificance: "baseline",
      changeDirection: "baseline",
      companyMatchConfidence: "high",
      watchlistReadConfidence: "high",
      proofRoleGrounding: "exact",
      resultState: "supported_provider_matched_with_observed_openings",
      jobsObservedCount: 2,
    });
    expect(result.verdict).toBe("ignore");
  });
});

// ---------------------------------------------------------------------------
// Alert priority correctness
// ---------------------------------------------------------------------------

test.describe("alertPriority", () => {
  test("act → immediate", () => {
    const result = deriveSignalVerdict({
      ...strongBase,
      changeSignificance: "meaningful_change",
      changeDirection: "expansion",
    });
    expect(result.alertPriority).toBe("immediate");
  });

  test("watch → digest", () => {
    const result = deriveSignalVerdict({ ...strongBase });
    expect(result.alertPriority).toBe("digest");
  });

  test("wait → none", () => {
    const result = deriveSignalVerdict({ ...strongBase, evidenceQuality: "weak", jobsObservedCount: 5, companyMatchConfidence: "medium", watchlistReadConfidence: "medium", proofRoleGrounding: "partial" });
    expect(result.alertPriority).toBe("none");
  });

  test("verify_source → source_issue", () => {
    const result = deriveSignalVerdict({ ...strongBase, resultState: "provider_failure" });
    expect(result.alertPriority).toBe("source_issue");
  });

  test("ignore → none", () => {
    const result = deriveSignalVerdict({ ...strongBase, resultState: "no_matched_provider_found" });
    expect(result.alertPriority).toBe("none");
  });
});
