import type { StratumResultState } from "@/lib/services/StratumInvestigator";
import type {
  EvidenceQuality,
  SignalClarity,
  ChangeSignificance,
  ChangeDirection,
  WatchlistConfidenceLevel,
  WatchlistProofGrounding,
} from "@/lib/signals/watchlistTaxonomy";

// ---------------------------------------------------------------------------
// Phase 6D-2: Signal Verdict
//
// A single top-level decision label for every brief. Answers the question the
// user actually has: "What should I do with this signal right now?"
//
// Verdict priority order (first match wins):
//   1. verify_source — the source itself cannot be trusted
//   2. ignore        — data exists but nothing is actionable
//   3. wait          — signal exists but too weak or ambiguous to act on
//   4. act           — strong, directional, concentrated signal (strict criteria)
//   5. watch         — reliable signal, no action threshold met yet (default)
// ---------------------------------------------------------------------------

export type SignalVerdict = "act" | "watch" | "wait" | "verify_source" | "ignore";
export type SignalVerdictAlertPriority = "immediate" | "digest" | "none" | "source_issue";

export interface SignalVerdictResult {
  verdict: SignalVerdict;
  headline: string;
  reason: string;
  alertPriority: SignalVerdictAlertPriority;
}

export interface SignalVerdictArgs {
  evidenceQuality: EvidenceQuality;
  signalClarity: SignalClarity;
  changeSignificance: ChangeSignificance;
  changeDirection: ChangeDirection;
  companyMatchConfidence: WatchlistConfidenceLevel;
  watchlistReadConfidence: WatchlistConfidenceLevel;
  proofRoleGrounding: WatchlistProofGrounding;
  isDirectSupportedSource?: boolean;
  resultState: StratumResultState;
  jobsObservedCount: number;
}

// Directions that qualify for ACT. Geography shift and replacement churn are
// meaningful but not clear enough for immediate action — they stay WATCH.
const ACTABLE_DIRECTIONS = new Set<ChangeDirection>(["expansion", "contraction", "mix_shift"]);

export function deriveSignalVerdict(args: SignalVerdictArgs): SignalVerdictResult {
  const {
    evidenceQuality,
    signalClarity,
    changeSignificance,
    changeDirection,
    companyMatchConfidence,
    watchlistReadConfidence,
    proofRoleGrounding,
    isDirectSupportedSource = false,
    resultState,
    jobsObservedCount,
  } = args;

  // -------------------------------------------------------------------------
  // 1. VERIFY SOURCE
  //
  // The source itself cannot be trusted. Signal content is irrelevant.
  //
  // Partial-failure note: "provider_failure" only fires when ALL providers
  // failed and no jobs were returned. If Greenhouse succeeded (jobs.length > 0)
  // and Ashby failed, deriveResultState() returns
  // "supported_provider_matched_with_observed_openings" — that case never
  // reaches here. Do not add a providerFailures > 0 check; it would incorrectly
  // flag partial-success runs.
  // -------------------------------------------------------------------------

  if (resultState === "provider_failure") {
    return {
      verdict: "verify_source",
      headline: "Source needs verification",
      reason:
        "The ATS provider for this company failed during fetch. Data may be absent rather than zero.",
      alertPriority: "source_issue",
    };
  }

  if (resultState === "unsupported_ats_or_source_pattern") {
    return {
      verdict: "verify_source",
      headline: "Source needs verification",
      reason:
        "This company's hiring source is not supported. The signal cannot be read.",
      alertPriority: "source_issue",
    };
  }

  if (companyMatchConfidence === "none") {
    return {
      verdict: "verify_source",
      headline: "Source needs verification",
      reason: "No supported ATS match was confirmed for this company.",
      alertPriority: "source_issue",
    };
  }

  // Low match confidence only escalates to verify_source when read confidence
  // is also low or absent. Low match + medium read stays a data-quality issue
  // that is correctly handled by evidenceQuality → wait below.
  if (
    companyMatchConfidence === "low" &&
    (watchlistReadConfidence === "none" || watchlistReadConfidence === "low")
  ) {
    return {
      verdict: "verify_source",
      headline: "Source needs verification",
      reason: "The company match is too ambiguous to support a reliable read.",
      alertPriority: "source_issue",
    };
  }

  // -------------------------------------------------------------------------
  // 2. IGNORE
  //
  // Nothing actionable. No tracking value.
  // -------------------------------------------------------------------------

  if (resultState === "no_matched_provider_found") {
    return {
      verdict: "ignore",
      headline: "No signal",
      reason: "No supported ATS was matched for this company.",
      alertPriority: "none",
    };
  }

  if (
    resultState === "supported_provider_matched_with_zero_observed_openings" &&
    evidenceQuality === "weak"
  ) {
    return {
      verdict: "ignore",
      headline: "No signal",
      reason: "The matched ATS showed no open roles.",
      alertPriority: "none",
    };
  }

  // 1–2 roles with weak evidence is noise, not signal.
  if (jobsObservedCount <= 2 && evidenceQuality === "weak") {
    return {
      verdict: "ignore",
      headline: "No signal",
      reason: "Too few roles observed to form a view.",
      alertPriority: "none",
    };
  }

  if (proofRoleGrounding === "none" && watchlistReadConfidence === "none") {
    return {
      verdict: "ignore",
      headline: "No signal",
      reason: "No roles could be grounded to a strategic read.",
      alertPriority: "none",
    };
  }

  // Proof-role grounding affects the examples shown to humans, but it should
  // not down-rank a healthy direct-source first scan with enough jobs to form
  // a baseline.
  if (
    isDirectSupportedSource &&
    resultState === "supported_provider_matched_with_observed_openings" &&
    jobsObservedCount >= 10 &&
    changeSignificance === "baseline" &&
    (companyMatchConfidence === "high" || companyMatchConfidence === "medium")
  ) {
    return {
      verdict: "watch",
      headline: "Worth watching",
      reason: buildWatchReason(args),
      alertPriority: "digest",
    };
  }

  // -------------------------------------------------------------------------
  // 3. WAIT
  //
  // Signal exists but evidence is too weak or strategic read is too unclear
  // to act or even watch actively. Monitor silently.
  // -------------------------------------------------------------------------

  if (evidenceQuality === "weak") {
    return {
      verdict: "wait",
      headline: "Not enough to act on yet",
      reason:
        "Signal exists but evidence quality is too low to draw a conclusion. Monitor for a stronger read.",
      alertPriority: "none",
    };
  }

  if (signalClarity === "thin" || signalClarity === "tentative") {
    return {
      verdict: "wait",
      headline: "Not enough to act on yet",
      reason: "The strategic read is too sparse or uncertain to be actionable.",
      alertPriority: "none",
    };
  }

  // Limited comparison with non-strong evidence → not enough signal history.
  // Strong evidence can carry a limited comparison forward to watch.
  if (changeSignificance === "limited_comparison" && evidenceQuality !== "strong") {
    return {
      verdict: "wait",
      headline: "Not enough to act on yet",
      reason: "The comparison is unreliable and evidence is insufficient to act on.",
      alertPriority: "none",
    };
  }

  // -------------------------------------------------------------------------
  // 4. ACT
  //
  // All five conditions must hold. Intentionally strict.
  //   - Strong evidence (moderate is insufficient)
  //   - Concentrated clarity (broad signals remain WATCH)
  //   - Meaningful, directional change (expansion / contraction / mix_shift)
  //   - Reliable company match (high or medium)
  //
  // Broad, mixed, and multi_location signals with meaningful change fall
  // through to WATCH — not ACT — in this phase.
  // -------------------------------------------------------------------------

  if (
    evidenceQuality === "strong" &&
    signalClarity === "concentrated" &&
    changeSignificance === "meaningful_change" &&
    ACTABLE_DIRECTIONS.has(changeDirection) &&
    (companyMatchConfidence === "high" || companyMatchConfidence === "medium")
  ) {
    return {
      verdict: "act",
      headline: "Signal — act now",
      reason: buildActReason(changeDirection),
      alertPriority: "immediate",
    };
  }

  // -------------------------------------------------------------------------
  // 5. WATCH (default)
  //
  // Covers: first baseline, minor movement, broad / mixed / multi_location
  // signals with strong or moderate evidence, non-actable directions
  // (replacement_churn, geography_shift), and any remaining case that passed
  // all prior gates.
  // -------------------------------------------------------------------------

  return {
    verdict: "watch",
    headline: "Worth watching",
    reason: buildWatchReason(args),
    alertPriority: "digest",
  };
}

function buildActReason(direction: ChangeDirection): string {
  switch (direction) {
    case "expansion":
      return "Meaningful hiring expansion in a clear strategic area.";
    case "contraction":
      return "Meaningful hiring contraction — potential displacement signal.";
    case "mix_shift":
      return "Strategic mix shift in a clear area — hiring priorities are realigning.";
    default:
      return "Meaningful change in a clear strategic area.";
  }
}

function buildWatchReason(args: SignalVerdictArgs): string {
  const { changeSignificance, changeDirection, signalClarity, evidenceQuality } = args;

  if (changeSignificance === "baseline") {
    return "First scan complete. No previous scan to compare yet.";
  }

  if (changeSignificance === "minor_change") {
    return "Minor movement only. Nothing material changed.";
  }

  if (changeDirection === "replacement_churn") {
    return "Hiring churn observed. No clear growth or contraction signal yet.";
  }

  if (changeDirection === "geography_shift") {
    return "Geographic shift with no clear headcount change. Monitor for strategic direction.";
  }

  if (
    signalClarity === "broad" ||
    signalClarity === "mixed" ||
    signalClarity === "multi_location"
  ) {
    return "Strong evidence with broad hiring activity. No concentrated strategic pivot yet.";
  }

  if (changeSignificance === "limited_comparison") {
    return "Strong evidence but comparison history is limited. A clearer picture will emerge.";
  }

  if (evidenceQuality === "moderate") {
    return "Moderate evidence with a clear read. Not strong enough to act on yet.";
  }

  return "Signal is clear but not yet at action threshold. Continue monitoring.";
}
