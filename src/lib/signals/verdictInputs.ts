// ---------------------------------------------------------------------------
// Phase 6E-2: Centralised verdict-input derivation
//
// Shared by the brief page (render-time fallback) and the notification
// candidate capture path (persisted verdict at diff-available time).
// Both callers need the same SignalVerdictArgs — this avoids duplication
// and ensures any future change to the derivation is applied consistently.
// ---------------------------------------------------------------------------

import {
  deriveBriefPublicReadiness,
  type ApprovedWatchlistLabel,
  type ChangeDirection,
  type WatchlistConfidenceLevel,
  type WatchlistProofGrounding,
} from "@/lib/signals/watchlistTaxonomy";
import type { StratumResultState } from "@/lib/services/StratumInvestigator";
import type { SignalVerdictArgs } from "@/lib/signals/signalVerdict";

/** Subset of brief fields needed to compute verdict inputs. */
export interface BriefVerdictFields {
  jobsObservedCount: number;
  watchlistReadLabel: string;
  watchlistReadConfidence: string;
  companyMatchConfidence: string;
  proofRoleGrounding: string;
  resultState: string;
  sourceInputMode?: string | null;
  resolutionKind?: string | null;
}

/**
 * Comparison context from a WatchlistEntryDiff.
 * Optional — when null (no comparison yet), baseline defaults are used.
 */
export interface DiffContextForVerdict {
  comparisonAvailable: boolean;
  hasMaterialChange: boolean;
  hasSignificantChange: boolean;
  significanceDrivers: Array<"count" | "roles" | "mix" | "geography">;
  comparisonStrength: "standard" | "weak" | "unavailable";
  changeDirection: ChangeDirection;
}

/**
 * Derives the full set of SignalVerdictArgs from persisted brief fields
 * plus an optional diff context.
 *
 * When diff is null the comparison fields default to baseline values,
 * producing the same result that page.tsx produces for a standalone brief
 * with no watchlist comparison (changeSignificance = "baseline",
 * changeDirection = "baseline").
 */
export function deriveVerdictArgs(
  brief: BriefVerdictFields,
  diff: DiffContextForVerdict | null
): SignalVerdictArgs {
  const readiness = deriveBriefPublicReadiness({
    jobsCount: brief.jobsObservedCount,
    watchlistReadConfidence: brief.watchlistReadConfidence as WatchlistConfidenceLevel,
    companyMatchConfidence: brief.companyMatchConfidence as WatchlistConfidenceLevel,
    proofRoleGrounding: brief.proofRoleGrounding as WatchlistProofGrounding,
    label: brief.watchlistReadLabel as ApprovedWatchlistLabel,
    hasComparison: diff?.comparisonAvailable ?? false,
    hasMaterialChange: diff?.hasMaterialChange ?? false,
    hasSignificantChange: diff?.hasSignificantChange ?? false,
    significanceDrivers: diff?.significanceDrivers ?? [],
    comparisonStrength: diff?.comparisonStrength ?? "unavailable",
    changeDirection: diff?.changeDirection ?? "baseline",
  });

  return {
    evidenceQuality: readiness.evidenceQuality,
    signalClarity: readiness.signalClarity,
    changeSignificance: readiness.changeSignificance,
    changeDirection: readiness.changeDirection,
    companyMatchConfidence: brief.companyMatchConfidence as WatchlistConfidenceLevel,
    watchlistReadConfidence: brief.watchlistReadConfidence as WatchlistConfidenceLevel,
    proofRoleGrounding: brief.proofRoleGrounding as WatchlistProofGrounding,
    resultState: brief.resultState as StratumResultState,
    jobsObservedCount: brief.jobsObservedCount,
    isDirectSupportedSource:
      brief.sourceInputMode === "supported_source_input" && brief.resolutionKind === "direct",
  };
}
