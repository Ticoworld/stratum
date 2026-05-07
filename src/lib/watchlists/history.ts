import { formatSourceLabel } from "@/lib/briefs/presentation";
import type { Job, JobBoardSource } from "@/lib/api/boards";
import type { StratumBriefSnapshot } from "@/db/schema/stratumBriefs";
import {
  ConfidenceLevel,
  ProofRoleGrounding,
  SourceCoverageCompleteness,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";
import { type ChangeDirection, type DepartmentBreakdown } from "@/lib/signals/watchlistTaxonomy";
import { getNormalizedTrackedTargetName } from "@/lib/watchlists/identity";

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
  hiringMix: DepartmentBreakdown[];
  allJobsSnapshot: Job[];
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
  hasSignificantChange: boolean;
  significanceDrivers: Array<"count" | "roles" | "mix" | "geography">;
  changeDirection: ChangeDirection;
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
}

function normalizeLocation(value: string | null | undefined): string {
  const norm = normalizeText(value);
  if (norm === "remote us" || norm === "remote, us" || norm === "remote  us") return "remote";
  return norm;
}

function normalizeTitle(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/\bsr\b/g, "senior")
    .replace(/\beng\b/g, "engineering");
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
  // Prefer stable identifiers if the provider exposes them
  if (role.roleId) return `id::${role.source}::${role.roleId}`;
  if (role.jobUrl) return `url::${role.jobUrl}`;
  if (role.requisitionId) return `req::${role.source}::${role.requisitionId}`;

  // Fallback to normalized content-based signature
  return [
    "text",
    normalizeTitle(role.title),
    normalizeText(role.department),
    normalizeLocation(role.location),
    normalizeText(role.source),
  ].join("::");
}

function buildRoleLabel(role: Job): string {
  const details: string[] = [];
  if (role.department) details.push(role.department);
  if (role.location) details.push(role.location);
  
  const title = role.title || "Unknown Role";
  return details.length > 0 ? `${title} (${details.join(", ")})` : title;
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
  const matchedCompanyName =
    getNormalizedTrackedTargetName(snapshot.queriedCompanyName, snapshot.matchedCompanyName) ??
    snapshot.matchedCompanyName;

  return {
    id: snapshot.id,
    queriedCompanyName: snapshot.queriedCompanyName,
    matchedCompanyName,
    atsSourceUsed: snapshot.atsSourceUsed ?? null,
    resultState: snapshot.resultState,
    companyMatchConfidence: snapshot.companyMatchConfidence,
    sourceCoverageCompleteness: snapshot.sourceCoverageCompleteness,
    watchlistReadLabel: snapshot.watchlistReadLabel,
    watchlistReadSummary: snapshot.watchlistReadSummary,
    watchlistReadConfidence: snapshot.watchlistReadConfidence,
    proofRoleGrounding: snapshot.proofRoleGrounding,
    jobsObservedCount: snapshot.jobsObservedCount ?? 0,
    hiringMix: snapshot.resultSnapshot?.hiringMix ?? [],
    allJobsSnapshot: snapshot.resultSnapshot?.jobs ?? [],
    proofRolesSnapshot: snapshot.proofRolesSnapshot ?? [],
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
      hasSignificantChange: false,
      significanceDrivers: [],
      changeDirection: "baseline",
    };
  }

  const changes: WatchlistEntryDiffChange[] = [];
  let hasSignificantChange = false;
  const comparisonNotes: string[] = buildComparisonNotes(latest, previous);
  let comparisonStrength: "standard" | "weak" = comparisonNotes.length > 0 ? "weak" : "standard";

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

  const significanceDrivers: Array<"count" | "roles" | "mix" | "geography"> = [];

  if (latest.jobsObservedCount !== previous.jobsObservedCount) {
    const delta = Math.abs(latest.jobsObservedCount - previous.jobsObservedCount);
    const maxCount = Math.max(latest.jobsObservedCount, previous.jobsObservedCount);
    const percentChange = maxCount > 0 ? (delta / maxCount) : 0;
    
    let isSignificant = false;
    if (maxCount < 10) {
      isSignificant = delta >= 1;
    } else if (maxCount < 50) {
      isSignificant = delta >= 2 || percentChange >= 0.10;
    } else if (maxCount < 200) {
      // Large board: 50-199
      isSignificant = (delta >= 5 && percentChange >= 0.05) || percentChange >= 0.15;
    } else {
      // Giant board: 200+
      isSignificant = (delta >= 20 && percentChange >= 0.05) || percentChange >= 0.10;
    }

    if (isSignificant) {
      hasSignificantChange = true;
      significanceDrivers.push("count");
    }

    const evidenceDirection =
      latest.jobsObservedCount > previous.jobsObservedCount ? "expanded" : "shrank";

    changes.push({
      category: "open_roles_observed_changed",
      label: "Observed role count changed",
      detail: `Role evidence ${evidenceDirection} from ${previous.jobsObservedCount} observed openings to ${latest.jobsObservedCount}.`,
    });
  }

  // Functional Mix Changes
  const latestMix = new Map((latest.hiringMix || []).map((d) => [d.department, d.count]));
  const previousMix = new Map((previous.hiringMix || []).map((d) => [d.department, d.count]));
  const allDepts = new Set([...latestMix.keys(), ...previousMix.keys()]);
  const mixDiffs: string[] = [];

  const totalBoardSize = Math.max(latest.jobsObservedCount, previous.jobsObservedCount);
  
  const getTopTwoDepts = (mixMap: Map<string, number>) => {
    const sorted = Array.from(mixMap.entries()).sort((a, b) => b[1] - a[1]);
    return {
      topDept: sorted[0]?.[0] || "",
      topCount: sorted[0]?.[1] || 0,
      secondCount: sorted[1]?.[1] || 0
    };
  };
  const previousTop = getTopTwoDepts(previousMix);
  const latestTop = getTopTwoDepts(latestMix);

  for (const dept of allDepts) {
    const lCount = latestMix.get(dept) || 0;
    const pCount = previousMix.get(dept) || 0;
    const delta = Math.abs(lCount - pCount);
    const maxDeptCount = Math.max(lCount, pCount);
    const percentDeptChange = maxDeptCount > 0 ? (delta / maxDeptCount) : 0;
    const percentOfBoard = totalBoardSize > 0 ? (delta / totalBoardSize) : 0;

    if (lCount !== pCount && (totalBoardSize < 10 || lCount > 2 || pCount > 2)) {
      const dir = lCount > pCount ? "increased" : "decreased";
      mixDiffs.push(`${dept} openings ${dir} from ${pCount} to ${lCount}`);
      
      const isNewDominant = latestTop.topDept === dept && previousTop.topDept !== dept && latestTop.topCount > latestTop.secondCount;
      let isMixSignificant = false;

      if (totalBoardSize < 10) {
        isMixSignificant = delta >= 1;
      } else if (totalBoardSize < 50) {
        isMixSignificant = delta >= 3 && percentDeptChange >= 0.20 && (percentOfBoard >= 0.10 || isNewDominant);
      } else if (totalBoardSize < 200) {
        isMixSignificant = delta >= 5 && (percentOfBoard >= 0.07 || isNewDominant);
      } else {
        isMixSignificant = delta >= 20 && (percentOfBoard >= 0.05 || isNewDominant);
      }

      if (isMixSignificant) {
        hasSignificantChange = true;
        if (!significanceDrivers.includes("mix")) significanceDrivers.push("mix");
      }
    }
  }

  if (mixDiffs.length > 0) {
    changes.push({
      category: "watchlist_read_label_changed",
      label: "Hiring mix shifted",
      detail: `Visible hiring mix shifted: ${mixDiffs.join("; ")}.`,
    });
  }

  // Role-level Changes
  const latestAllJobs = latest.allJobsSnapshot || [];
  const previousAllJobs = previous.allJobsSnapshot || [];
  const useFullJobs = latestAllJobs.length > 0 && previousAllJobs.length > 0;
  
  if (!useFullJobs && (latest.jobsObservedCount > 0 || previous.jobsObservedCount > 0)) {
    comparisonNotes.push("Role-level comparison is limited because full observed job data is missing for at least one brief.");
    comparisonStrength = "weak";
  }

  const latestRolesSource = useFullJobs ? latestAllJobs : (latest.proofRolesSnapshot || []);
  const previousRolesSource = useFullJobs ? previousAllJobs : (previous.proofRolesSnapshot || []);

  const latestRoles = buildUniqueProofRoleMap(latestRolesSource);
  const previousRoles = buildUniqueProofRoleMap(previousRolesSource);
  const addedRoles = Array.from(latestRoles.entries())
    .filter(([signature]) => !previousRoles.has(signature))
    .map(([, label]) => label);
  const removedRoles = Array.from(previousRoles.entries())
    .filter(([signature]) => !latestRoles.has(signature))
    .map(([, label]) => label);

  if (addedRoles.length > 0 || removedRoles.length > 0) {
    const detailParts: string[] = [];
    const netChange = Math.abs(addedRoles.length - removedRoles.length);
    const totalRoles = Math.max(latestRoles.size, previousRoles.size);
    const churnRate = totalRoles > 0 ? (Math.max(addedRoles.length, removedRoles.length) / totalRoles) : 0;

    let isSignificant = false;
    if (totalRoles < 10) {
      isSignificant = netChange >= 1;
    } else if (totalRoles < 50) {
      isSignificant = netChange >= 2 || churnRate >= 0.10;
    } else if (totalRoles < 200) {
      isSignificant = (netChange >= 5 && churnRate >= 0.05) || churnRate >= 0.15;
    } else {
      isSignificant = (netChange >= 20 && churnRate >= 0.05) || churnRate >= 0.10;
    }

    // Replacement churn check: if added == removed and net is small, it's just churn
    // But if churn rate is high (>20%), it IS a significant event.
    if (addedRoles.length > 0 && removedRoles.length > 0 && netChange < 2 && totalRoles >= 10 && churnRate < 0.2) {
      isSignificant = false; 
    }

    if (isSignificant) {
      hasSignificantChange = true;
      if (!significanceDrivers.includes("roles")) significanceDrivers.push("roles");
    }

    if (addedRoles.length > 0) {
      detailParts.push(`added ${formatNameList(addedRoles)}`);
    }

    if (removedRoles.length > 0) {
      detailParts.push(`removed ${formatNameList(removedRoles)}`);
    }

    changes.push({
      category: "proof_roles_changed",
      label: useFullJobs ? "Observed roles changed" : "Displayed proof roles changed",
      detail: `${useFullJobs ? "Observed roles" : "Displayed proof-role evidence"} changed: ${detailParts.join("; ")}.`,
    });
  }

  // Geography Changes
  if (useFullJobs) {
    const latestLocs = new Set(latestAllJobs.map(j => normalizeLocation(j.location)).filter(Boolean));
    const previousLocs = new Set(previousAllJobs.map(j => normalizeLocation(j.location)).filter(Boolean));
    const addedLocs = [...latestLocs].filter(l => !previousLocs.has(l as string));
    const removedLocs = [...previousLocs].filter(l => !latestLocs.has(l as string));

    if (addedLocs.length > 0 || removedLocs.length > 0) {
      const geoParts: string[] = [];
      if (addedLocs.length > 0) geoParts.push(`new roles appeared in ${formatNameList(addedLocs as string[])}`);
      if (removedLocs.length > 0) geoParts.push(`roles are no longer visible in ${formatNameList(removedLocs as string[])}`);

      changes.push({
        category: "source_coverage_changed",
        label: "Geographic spread changed",
        detail: `Visible geography changed: ${geoParts.join("; ")}.`,
      });

      // Geography is significant if multiple locations change AND combined with role movement
      if (addedLocs.length + removedLocs.length >= 2 && significanceDrivers.length > 0) {
        hasSignificantChange = true;
        if (!significanceDrivers.includes("geography")) significanceDrivers.push("geography");
      }
    }
  }

  const summary =
    changes.length > 0
      ? changes.map((change) => change.detail).join(" ")
      : "No material change observed between the latest two saved briefs.";

  return {
    comparisonAvailable: true,
    comparisonStrength,
    comparisonNotes:
      comparisonNotes.length > 0
        ? [`Comparison is ${comparisonStrength} because ${formatNameList(comparisonNotes, comparisonNotes.length)}.`]
        : [],
    summary,
    changes,
    hasMaterialChange: changes.length > 0,
    hasSignificantChange,
    significanceDrivers,
    changeDirection: deriveChangeDirection({
      latestSnapshot: latestAllJobs,
      prevSnapshot: previousAllJobs,
      drivers: significanceDrivers,
      comparisonStrength,
      hasSignificantChange,
    }),
  };
}

function deriveChangeDirection(args: {
  latestSnapshot: Job[];
  prevSnapshot: Job[];
  drivers: Array<"count" | "roles" | "mix" | "geography">;
  comparisonStrength: "standard" | "weak";
  hasSignificantChange: boolean;
}): ChangeDirection {
  const { latestSnapshot, prevSnapshot, drivers, comparisonStrength, hasSignificantChange } = args;
  if (comparisonStrength === "weak") return "limited";
  if (!hasSignificantChange) return "minor_movement";

  if (drivers.includes("mix")) return "mix_shift";
  if (drivers.includes("geography")) return "geography_shift";

  const countDiff = latestSnapshot.length - prevSnapshot.length;

  if (countDiff > 0 && drivers.includes("count")) return "expansion";
  if (countDiff < 0 && drivers.includes("count")) return "contraction";

  const getSignature = (j: Job) => `${j.title}|${j.location}|${j.department}|${j.jobUrl || ""}`;
  const prevSigs = new Set(prevSnapshot.map(getSignature));
  const addedCount = latestSnapshot.filter(j => !prevSigs.has(getSignature(j))).length;

  if (addedCount > 0 && drivers.includes("roles")) return "replacement_churn";

  return "minor_movement";
}
