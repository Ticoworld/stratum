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

export function buildStratumLimitations(result: StratumResult): string[] {
  const providerSummaries = Array.isArray(result.providerAttemptSummaries) ? result.providerAttemptSummaries : [];
  const failedSources = providerSummaries
    .filter((summary) => summary.status === "error")
    .map((summary) => summary.source);
  const notAttemptedAfterMatch = providerSummaries
    .filter((summary) => summary.status === "not_attempted_after_match")
    .map((summary) => summary.source);
  const notApplicableSources = providerSummaries
    .filter((summary) => summary.status === "not_applicable")
    .map((summary) => summary.source);
  const limitations = [
    result.sourceCoverageExplanation,
    result.watchlistReadExplanation,
    "Stratum reflects supported ATS openings only. It is not a full company view.",
    "One matched provider is not full company coverage.",
  ];

  if (result.companyMatchConfidence !== "high") {
    limitations.unshift(result.companyMatchExplanation);
  }

  if (result.companyResolutionExplanation && result.companyResolutionExplanation !== result.companyMatchExplanation) {
    limitations.push(result.companyResolutionExplanation);
  }

  if (result.proofRoleGrounding !== "none") {
    limitations.push(result.proofRoleGroundingExplanation);
  }

  if (result.resultState === "supported_provider_matched_with_zero_observed_openings") {
    limitations.push("Zero observed openings on one matched provider is not the same as saying the company is not hiring.");
  }

  if (result.resultState === "no_matched_provider_found") {
    limitations.push("No supported ATS match is not evidence that the company has no openings.");
  }

  if (result.providerFailures > 0) {
    limitations.push(result.providerFailureExplanation);
  }

  if (notAttemptedAfterMatch.length > 0) {
    limitations.push(
      `${formatSourceList(notAttemptedAfterMatch)} ${notAttemptedAfterMatch.length === 1 ? "was" : "were"} not attempted after the first provider returned openings, so source coverage remains narrow.`
    );
  }

  if (notApplicableSources.length > 0 && result.requestedSourceHint) {
    limitations.push(
      `This query specified ${formatSourceLabel(result.requestedSourceHint)} directly, so ${formatSourceList(notApplicableSources)} ${notApplicableSources.length === 1 ? "was" : "were"} not attempted.`
    );
  }

  if (failedSources.length > 0) {
    limitations.push(`Provider failures occurred on ${formatSourceList(failedSources)} during this search.`);
  }

  if (result.unsupportedSourcePatternExplanation) {
    limitations.push(result.unsupportedSourcePatternExplanation);
  }

  if (result.proofRoles.some((role) => !role.sourceTimestamp)) {
    limitations.push("Some displayed proof roles do not expose a provider timestamp in the source feed.");
  }

  if (result.proofRoles.some((role) => !role.jobUrl && !role.applyUrl)) {
    limitations.push("Some displayed proof roles do not expose a direct posting URL in the source feed.");
  }

  return limitations;
}
