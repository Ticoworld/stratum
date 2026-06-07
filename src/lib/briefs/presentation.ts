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

const LEADABLE_HIRING_BUCKETS = new Set([
  "Sales",
  "Engineering",
  "Operations",
  "Product",
  "Finance",
  "Marketing",
  "Leadership",
]);

export function formatHiringPatternDisplay(hiringMix: [string, number][]): string {
  const ranked = hiringMix.filter(([, count]) => count > 0);
  const [top, second] = ranked;

  if (!top || !LEADABLE_HIRING_BUCKETS.has(top[0])) return "No clear lead";
  if (!second) return `${top[0]}-led`;

  const total = ranked.reduce((sum, [, count]) => sum + count, 0);
  const leadGap = top[1] - second[1];
  const clearGap = Math.max(5, Math.ceil(total * 0.05));
  const clearRatio = second[1] > 0 ? top[1] / second[1] >= 1.25 : true;

  if (leadGap >= clearGap || clearRatio) return `${top[0]}-led`;
  return "Mixed";
}

export function buildSourceScopeSummary(result: StratumResult): string {
  const sourceLabel = result.apiSource ? formatSourceLabel(result.apiSource) : null;

  switch (result.resultState) {
    case "supported_provider_matched_with_observed_openings":
    case "ambiguous_company_match":
      return sourceLabel
        ? `${sourceLabel} only. Not full company coverage.`
        : "One source only. Not full company coverage.";

    case "supported_provider_matched_with_zero_observed_openings":
      return "No jobs found in this source. The company may still have jobs elsewhere.";

    case "provider_failure":
      return "Source check failed. Verify the source before using this brief.";

    case "no_matched_provider_found":
      return "No supported source matched. The company may still have jobs elsewhere.";

    case "unsupported_ats_or_source_pattern":
      return "This source is not supported yet.";
  }
}

export function buildStratumLimitations(result: StratumResult): string[] {
  return [buildSourceScopeSummary(result)];
}
