import type { StratumResult } from "@/lib/services/StratumInvestigator";
import type { JobBoardSource } from "@/lib/api/boards";
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";

export function formatSourceLabel(source?: JobBoardSource | null): string {
  switch (source) {
    case "GREENHOUSE":
      return "Greenhouse";
    case "LEVER":
      return "Lever";
    case "ASHBY":
      return "Ashby";
    case "WORKABLE":
      return "Workable";
    default:
      return "No supported ATS source matched";
  }
}

export function getMatchedCompanyName(result: StratumResult): string {
  const persistedMatch = result.matchedCompanyName?.trim();
  const requestedName = result.companyName.trim();
  const matchedName = result.matchedAs?.trim();
  const normalizedTargetName = getNormalizedTrackedTargetName(
    requestedName,
    persistedMatch || matchedName || null
  );

  return (
    normalizedTargetName ??
    persistedMatch ??
    matchedName ??
    requestedName
  );
}

function formatSourceList(sources: JobBoardSource[]): string {
  const labels = Array.from(new Set(sources)).map((source) => formatSourceLabel(source));

  if (labels.length === 0) return "supported providers";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Phase 6G-2: Compact source scope summary
//
// Produces one concise sentence that covers:
//   - which provider was used (or why none was used)
//   - whether the query specified the provider directly
//   - which providers failed (when relevant)
//
// Replaces the combination of sourceCoverageExplanation + the two hard-coded
// "one provider only" / "not full company coverage" strings that used to
// repeat the same fact multiple times.
// ---------------------------------------------------------------------------

export function buildSourceScopeSummary(result: StratumResult): string {
  const providerSummaries = Array.isArray(result.providerAttemptSummaries)
    ? result.providerAttemptSummaries
    : [];

  const failedSources = providerSummaries
    .filter((s) => s.status === "error")
    .map((s) => s.source);

  const sourceLabel = result.apiSource ? formatSourceLabel(result.apiSource) : null;
  const querySpecified =
    result.sourceInputMode === "supported_source_input" && !!result.requestedSourceHint;

  switch (result.resultState) {
    case "supported_provider_matched_with_observed_openings":
    case "ambiguous_company_match": {
      if (!sourceLabel) return "Source data available from one matched provider.";

      if (querySpecified && failedSources.length > 0) {
        return `${sourceLabel} only, query-specified. ${formatSourceList(failedSources)} failed during this scan.`;
      }
      if (querySpecified) {
        return `${sourceLabel} only, query-specified.`;
      }
      if (failedSources.length > 0) {
        return `${sourceLabel} only. ${formatSourceList(failedSources)} failed during this scan.`;
      }
      return `${sourceLabel} only.`;
    }

    case "supported_provider_matched_with_zero_observed_openings": {
      const label = sourceLabel ?? "matched provider";
      if (querySpecified) {
        return `No openings observed from ${label} (query-specified).`;
      }
      return `No openings observed from ${label}.`;
    }

    case "provider_failure":
      return "Provider fetch failed. Source data is unavailable.";

    case "no_matched_provider_found":
      return "No supported ATS source matched.";

    case "unsupported_ats_or_source_pattern":
      return "Unsupported ATS or source pattern — no data read.";
  }
}

export function buildStratumLimitations(result: StratumResult): string[] {
  // Source scope — stated once, clearly.
  const limitations: string[] = [buildSourceScopeSummary(result)];

  // Company match confidence — only when weak; critical signal-quality flag.
  if (result.companyMatchConfidence !== "high") {
    limitations.unshift(result.companyMatchExplanation);
  }

  // Company resolution detail — only when it adds information beyond match confidence.
  if (
    result.companyResolutionExplanation &&
    result.companyResolutionExplanation !== result.companyMatchExplanation
  ) {
    limitations.push(result.companyResolutionExplanation);
  }

  // Read confidence — only for medium/low; the Confidence chip already covers high.
  if (
    result.watchlistReadConfidence === "low" ||
    result.watchlistReadConfidence === "medium"
  ) {
    limitations.push(result.watchlistReadExplanation);
  }

  // Proof grounding — only for fallback; exact/partial are shown via the chip.
  if (result.proofRoleGrounding === "fallback") {
    limitations.push(result.proofRoleGroundingExplanation);
  }

  // Zero-openings caveat — must keep; prevents misreading absence as no-hiring.
  if (result.resultState === "supported_provider_matched_with_zero_observed_openings") {
    limitations.push("Zero observed openings does not mean the company is not hiring.");
  }

  // No-provider caveat — must keep; prevents misreading no-match as no-hiring.
  if (result.resultState === "no_matched_provider_found") {
    limitations.push("No supported ATS match does not mean the company has no openings.");
  }

  // Provider failure — only for complete fetch failures. Partial failures (e.g. Greenhouse
  // success + Ashby error) are already named in buildSourceScopeSummary above.
  if (result.providerFailures > 0 && result.resultState === "provider_failure") {
    limitations.push(result.providerFailureExplanation);
  }

  // Unsupported source pattern — unique context, no duplicate.
  if (result.unsupportedSourcePatternExplanation) {
    limitations.push(result.unsupportedSourcePatternExplanation);
  }

  // Feed-gap caveats — only when evidence is weak enough that gaps in the feed
  // actually matter. High-confidence briefs do not need these.
  const evidenceIsWeak =
    result.watchlistReadConfidence === "low" || result.proofRoleGrounding === "fallback";

  if (
    evidenceIsWeak &&
    result.proofRoles.some((role) => !role.sourceTimestamp)
  ) {
    limitations.push(
      "Some displayed proof roles do not expose a provider timestamp in the source feed."
    );
  }

  if (
    evidenceIsWeak &&
    result.proofRoles.some((role) => !role.jobUrl && !role.applyUrl)
  ) {
    limitations.push(
      "Some displayed proof roles do not expose a direct posting URL in the source feed."
    );
  }

  return limitations;
}
