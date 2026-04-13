import type { JobBoardSource } from "@/lib/api/boards";
import type {
  ConfidenceLevel,
  SourceCoverageCompleteness,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";
import { formatSourceLabel } from "@/lib/briefs/presentation";
import { formatWatchlistTargetIdentity } from "@/lib/watchlists/identity";
import type { StratumMonitoringStateBasis } from "@/lib/watchlists/monitoringEvents";
import { formatAttemptResultStateLabel } from "@/lib/watchlists/monitoringEvents";

export interface WatchlistSourceGrounding {
  primary: string;
  secondary: string | null;
  tertiary: string | null;
}

function normalizeComparableValue(value: string): string {
  return value.trim().toLowerCase();
}

export function formatWatchlistMetadataLine(
  values: Array<string | null | undefined>,
  separator = " / "
): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;

    const normalized = normalizeComparableValue(trimmed);
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    parts.push(trimmed);
  }

  return parts.length > 0 ? parts.join(separator) : null;
}

export function formatWatchlistDateTime(
  value: string | null | undefined,
  fallback = "Unknown"
): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatWatchlistConfidenceLabel(
  value: ConfidenceLevel | string | null | undefined
): string | null {
  switch (value) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    case "none":
      return "No confidence score";
    default:
      return null;
  }
}

export function formatWatchlistCoverageLabel(
  value: SourceCoverageCompleteness | null | undefined
): string {
  switch (value) {
    case "single_matched_provider_only":
      return "One matched provider only";
    case "matched_provider_zero_observed_roles":
      return "Matched provider, zero observed roles";
    case "unsupported_source_pattern":
      return "Unsupported source pattern";
    case "inconclusive_due_to_provider_failure":
      return "Inconclusive because of provider failure";
    case "no_supported_provider_match":
      return "No supported provider match";
    default:
      return "No saved brief yet";
  }
}

export function formatWatchlistStateHeadline(args: {
  watchlistReadLabel: string | null | undefined;
  resultState: StratumResultState | string | null | undefined;
  fallback?: string;
}): string {
  const watchlistReadLabel = args.watchlistReadLabel?.trim();
  if (watchlistReadLabel) return watchlistReadLabel;
  if (args.resultState) return formatAttemptResultStateLabel(args.resultState as StratumResultState);
  return args.fallback ?? "No current state";
}

export function formatWatchlistStateSupportingText(args: {
  resultState: StratumResultState | string | null | undefined;
  confidence: ConfidenceLevel | string | null | undefined;
}): string | null {
  const parts = formatWatchlistMetadataLine([
    args.resultState ? formatAttemptResultStateLabel(args.resultState as StratumResultState) : null,
    formatWatchlistConfidenceLabel(args.confidence),
  ]);

  return parts;
}

export function formatWatchlistStateBasisLabel(
  value: StratumMonitoringStateBasis | null | undefined
): string {
  switch (value) {
    case "saved_brief":
      return "Based on latest saved brief";
    case "latest_attempt_only":
      return "Based on latest attempt";
    default:
      return "No monitoring record";
  }
}

export function buildWatchlistSourceGrounding(args: {
  requestedQuery: string;
  matchedCompanyName?: string | null;
  atsSourceUsed?: JobBoardSource | string | null;
}): WatchlistSourceGrounding {
  const identity = formatWatchlistTargetIdentity(args.requestedQuery, args.matchedCompanyName);
  const providerLabel = args.atsSourceUsed
    ? formatSourceLabel(args.atsSourceUsed as JobBoardSource)
    : identity.sourceProvider;

  const primary = providerLabel ?? identity.sourceHost ?? "Source not grounded yet";
  const secondary =
    identity.sourceHost &&
    providerLabel &&
    identity.sourceHost.toLowerCase() !== providerLabel.toLowerCase()
      ? identity.sourceHost
      : identity.sourcePath;
  const tertiary =
    secondary === identity.sourcePath || !identity.sourcePath || identity.sourcePath === secondary
      ? null
      : identity.sourcePath;

  return {
    primary,
    secondary,
    tertiary,
  };
}
