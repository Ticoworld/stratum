import { formatSourceLabel } from "@/lib/briefs/presentation";
import type { Job, JobBoardSource } from "@/lib/api/boards";
import type { StratumBriefSnapshot } from "@/db/schema/stratumBriefs";
import type {
  ConfidenceLevel,
  ProofRoleGrounding,
  SourceCoverageCompleteness,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";

export interface WatchlistEntryBriefHistoryItem {
  id: string;
  queriedCompanyName: string;
  matchedCompanyName: string;
  atsSourceUsed: JobBoardSource | null;
  resultState: StratumResultState;
  companyMatchConfidence: ConfidenceLevel;
  sourceCoverageCompleteness: SourceCoverageCompleteness;
  watchlistReadLabel: string;
  watchlistReadSummary: string;
  watchlistReadConfidence: ConfidenceLevel;
  proofRoleGrounding: ProofRoleGrounding;
  jobsObservedCount: number;
  proofRolesSnapshot: Job[];
  createdAt: string;
  updatedAt: string;
}

export type WatchlistEntryDiffCategory =
  | "result_state_changed"
  | "matched_company_changed"
  | "ats_source_changed"
  | "watchlist_read_label_changed"
  | "watchlist_read_confidence_changed"
  | "source_coverage_changed"
  | "proof_role_grounding_changed"
  | "open_roles_observed_changed"
  | "proof_roles_changed";

export interface WatchlistEntryDiffChange {
  category: WatchlistEntryDiffCategory;
  label: string;
  detail: string;
}

export interface WatchlistEntryDiff {
  comparisonAvailable: boolean;
  comparisonStrength: "standard" | "weak" | "unavailable";
  comparisonNotes: string[];
  summary: string;
  changes: WatchlistEntryDiffChange[];
  hasMaterialChange: boolean;
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function formatResultStateLabel(value: StratumResultState): string {
  switch (value) {
    case "supported_provider_matched_with_observed_openings":
      return "Observed openings";
    case "supported_provider_matched_with_zero_observed_openings":
      return "Matched provider, zero openings";
    case "unsupported_ats_or_source_pattern":
      return "Unsupported source pattern";
    case "ambiguous_company_match":
      return "Ambiguous company match";
    case "provider_failure":
      return "Provider failure";
    case "no_matched_provider_found":
      return "No supported match";
  }
}

function formatConfidenceLabel(value: ConfidenceLevel): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
      return "None";
  }
}

function formatCoverageLabel(value: SourceCoverageCompleteness): string {
  switch (value) {
    case "single_matched_provider_only":
      return "One matched provider only";
    case "matched_provider_zero_observed_roles":
      return "Matched provider, zero roles";
    case "unsupported_source_pattern":
      return "Unsupported ATS/source pattern";
    case "inconclusive_due_to_provider_failure":
      return "Inconclusive because of provider failure";
    case "no_supported_provider_match":
      return "No supported provider match";
  }
}

function formatProofGroundingLabel(value: ProofRoleGrounding): string {
  switch (value) {
    case "exact":
      return "Exact";
    case "partial":
      return "Partial";
    case "fallback":
      return "Fallback";
    case "none":
      return "None";
  }
}

function formatSourceDisplay(source: JobBoardSource | null): string {
  return source ? formatSourceLabel(source) : "No supported ATS source matched";
}

function buildRoleSignature(role: Job): string {
  return [
    normalizeText(role.title),
    normalizeText(role.department),
    normalizeText(role.location),
    normalizeText(role.source),
  ].join("::");
}

function buildRoleLabel(role: Job): string {
  const details = [role.department?.trim(), role.location?.trim()].filter(Boolean);
  return details.length > 0 ? `${role.title} (${details.join(", ")})` : role.title;
}

function buildUniqueProofRoleMap(roles: Job[]): Map<string, string> {
  const uniqueRoles = new Map<string, string>();

  for (const role of roles) {
    const signature = buildRoleSignature(role);
    if (!signature || uniqueRoles.has(signature)) continue;
    uniqueRoles.set(signature, buildRoleLabel(role));
  }

  return uniqueRoles;
}

function formatNameList(values: string[], maxItems = 3): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];

  const visible = values.slice(0, maxItems);
  const remaining = values.length - visible.length;
  const joined =
    visible.length === 2
      ? `${visible[0]} and ${visible[1]}`
      : `${visible.slice(0, -1).join(", ")}, and ${visible[visible.length - 1]}`;

  return remaining > 0 ? `${joined}, plus ${remaining} more` : joined;
}

function buildComparisonNotes(
  latest: WatchlistEntryBriefHistoryItem,
  previous: WatchlistEntryBriefHistoryItem
): string[] {
  const notes: string[] = [];

  if (normalizeText(latest.matchedCompanyName) !== normalizeText(previous.matchedCompanyName)) {
    notes.push("the matched company changed between the two saved briefs");
  }

  if (latest.atsSourceUsed !== previous.atsSourceUsed) {
    notes.push("the briefs rely on different ATS sources");
  }

  if (
    CONFIDENCE_RANK[latest.companyMatchConfidence] <= CONFIDENCE_RANK.low ||
    CONFIDENCE_RANK[previous.companyMatchConfidence] <= CONFIDENCE_RANK.low
  ) {
    notes.push("at least one of the compared briefs has weak company-match confidence");
  }

  return notes;
}

export function toWatchlistEntryBriefHistoryItem(
  snapshot: StratumBriefSnapshot
): WatchlistEntryBriefHistoryItem {
  return {
    id: snapshot.id,
    queriedCompanyName: snapshot.queriedCompanyName,
    matchedCompanyName: snapshot.matchedCompanyName,
    atsSourceUsed: snapshot.atsSourceUsed,
    resultState: snapshot.resultState,
    companyMatchConfidence: snapshot.companyMatchConfidence,
    sourceCoverageCompleteness: snapshot.sourceCoverageCompleteness,
    watchlistReadLabel: snapshot.watchlistReadLabel,
    watchlistReadSummary: snapshot.watchlistReadSummary,
    watchlistReadConfidence: snapshot.watchlistReadConfidence,
    proofRoleGrounding: snapshot.proofRoleGrounding,
    jobsObservedCount: snapshot.jobsObservedCount,
    proofRolesSnapshot: snapshot.proofRolesSnapshot,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

export function buildWatchlistEntryDiff(
  latest: WatchlistEntryBriefHistoryItem | null,
  previous: WatchlistEntryBriefHistoryItem | null
): WatchlistEntryDiff {
  if (!latest || !previous) {
    return {
      comparisonAvailable: false,
      comparisonStrength: "unavailable",
      comparisonNotes: [],
      summary: "No comparison available yet. This tracked entry has only one saved brief.",
      changes: [],
      hasMaterialChange: false,
    };
  }

  const changes: WatchlistEntryDiffChange[] = [];

  if (latest.resultState !== previous.resultState) {
    changes.push({
      category: "result_state_changed",
      label: "Result state changed",
      detail: `Result state changed from ${formatResultStateLabel(previous.resultState)} to ${formatResultStateLabel(latest.resultState)}.`,
    });
  }

  if (normalizeText(latest.matchedCompanyName) !== normalizeText(previous.matchedCompanyName)) {
    changes.push({
      category: "matched_company_changed",
      label: "Matched company changed",
      detail: `Matched company changed from ${previous.matchedCompanyName} to ${latest.matchedCompanyName}.`,
    });
  }

  if (latest.atsSourceUsed !== previous.atsSourceUsed) {
    changes.push({
      category: "ats_source_changed",
      label: "ATS source changed",
      detail: `ATS source changed from ${formatSourceDisplay(previous.atsSourceUsed)} to ${formatSourceDisplay(latest.atsSourceUsed)}.`,
    });
  }

  if (normalizeText(latest.watchlistReadLabel) !== normalizeText(previous.watchlistReadLabel)) {
    changes.push({
      category: "watchlist_read_label_changed",
      label: "Watchlist read changed",
      detail: `Watchlist read changed from "${previous.watchlistReadLabel}" to "${latest.watchlistReadLabel}".`,
    });
  }

  if (latest.watchlistReadConfidence !== previous.watchlistReadConfidence) {
    const direction =
      CONFIDENCE_RANK[latest.watchlistReadConfidence] > CONFIDENCE_RANK[previous.watchlistReadConfidence]
        ? "strengthened"
        : "weakened";

    changes.push({
      category: "watchlist_read_confidence_changed",
      label: "Read confidence changed",
      detail: `Read confidence ${direction} from ${formatConfidenceLabel(previous.watchlistReadConfidence)} to ${formatConfidenceLabel(latest.watchlistReadConfidence)}.`,
    });
  }

  if (latest.sourceCoverageCompleteness !== previous.sourceCoverageCompleteness) {
    changes.push({
      category: "source_coverage_changed",
      label: "Source coverage changed",
      detail: `Source coverage changed from ${formatCoverageLabel(previous.sourceCoverageCompleteness)} to ${formatCoverageLabel(latest.sourceCoverageCompleteness)}.`,
    });
  }

  if (latest.proofRoleGrounding !== previous.proofRoleGrounding) {
    changes.push({
      category: "proof_role_grounding_changed",
      label: "Proof-role grounding changed",
      detail: `Proof-role grounding changed from ${formatProofGroundingLabel(previous.proofRoleGrounding)} to ${formatProofGroundingLabel(latest.proofRoleGrounding)}.`,
    });
  }

  if (latest.jobsObservedCount !== previous.jobsObservedCount) {
    const evidenceDirection =
      latest.jobsObservedCount > previous.jobsObservedCount ? "expanded" : "shrank";

    changes.push({
      category: "open_roles_observed_changed",
      label: "Observed role count changed",
      detail: `Role evidence ${evidenceDirection} from ${previous.jobsObservedCount} observed openings to ${latest.jobsObservedCount}.`,
    });
  }

  const latestRoles = buildUniqueProofRoleMap(latest.proofRolesSnapshot);
  const previousRoles = buildUniqueProofRoleMap(previous.proofRolesSnapshot);
  const addedRoles = Array.from(latestRoles.entries())
    .filter(([signature]) => !previousRoles.has(signature))
    .map(([, label]) => label);
  const removedRoles = Array.from(previousRoles.entries())
    .filter(([signature]) => !latestRoles.has(signature))
    .map(([, label]) => label);

  if (addedRoles.length > 0 || removedRoles.length > 0) {
    const detailParts: string[] = [];

    if (addedRoles.length > 0) {
      detailParts.push(`added ${formatNameList(addedRoles)}`);
    }

    if (removedRoles.length > 0) {
      detailParts.push(`removed ${formatNameList(removedRoles)}`);
    }

    changes.push({
      category: "proof_roles_changed",
      label: "Displayed proof roles changed",
      detail: `Displayed proof-role evidence changed: ${detailParts.join("; ")}.`,
    });
  }

  const comparisonNotes = buildComparisonNotes(latest, previous);
  const summary =
    changes.length > 0
      ? changes.map((change) => change.detail).join(" ")
      : "No material change observed between the latest two saved briefs.";

  return {
    comparisonAvailable: true,
    comparisonStrength: comparisonNotes.length > 0 ? "weak" : "standard",
    comparisonNotes:
      comparisonNotes.length > 0
        ? [`Comparison is weak because ${formatNameList(comparisonNotes, comparisonNotes.length)}.`]
        : [],
    summary,
    changes,
    hasMaterialChange: changes.length > 0,
  };
}
