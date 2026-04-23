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

export interface WatchlistDisplayIdentity {
  primary: string;
  meta: string | null;
  uncertain: boolean;
  sourceGrounding: WatchlistSourceGrounding;
}

export interface WatchlistTrackingState {
  headline: string;
  supportingText: string | null;
  sourceLabel: string;
}

function normalizeComparableValue(value: string): string {
  return value.trim().toLowerCase();
}

function shouldHideIdentityMetaValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  return /^\/|https?:\/\/|www\.|[/?#=&]/i.test(trimmed);
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
      return "Matched source found";
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
  return args.fallback ?? "No signal yet";
}

export function formatWatchlistStateSupportingText(args: {
  headline?: string | null | undefined;
  resultState: StratumResultState | string | null | undefined;
  confidence: ConfidenceLevel | string | null | undefined;
}): string | null {
  const resultStateLabel = args.resultState
    ? formatAttemptResultStateLabel(args.resultState as StratumResultState)
    : null;
  const dedupedResultState =
    resultStateLabel &&
    args.headline &&
    normalizeComparableValue(resultStateLabel) === normalizeComparableValue(args.headline)
      ? null
      : resultStateLabel;
  const parts = formatWatchlistMetadataLine([
    dedupedResultState,
    formatWatchlistConfidenceLabel(args.confidence),
  ]);

  return parts;
}

export function formatWatchlistStateBasisLabel(
  value: StratumMonitoringStateBasis | null | undefined
): string {
  switch (value) {
    case "saved_brief":
      return "First snapshot saved";
    case "latest_attempt_only":
      return "First snapshot pending";
    default:
      return "No snapshot yet";
  }
}

export function formatWatchlistTrackingState(args: {
  latestBriefId?: string | null | undefined;
  latestResultState?: StratumResultState | string | null | undefined;
  latestAtsSourceUsed?: JobBoardSource | string | null | undefined;
  isChecking?: boolean;
}): WatchlistTrackingState {
  const sourceLabel = args.latestAtsSourceUsed
    ? formatSourceLabel(args.latestAtsSourceUsed as JobBoardSource)
    : "No supported source found";
  const hasKnownSource = Boolean(args.latestAtsSourceUsed);

  if (args.isChecking) {
    return {
      headline: "Checking now",
      supportingText: hasKnownSource
        ? `Checking ${sourceLabel}.`
        : "Waiting on a supported source.",
      sourceLabel,
    };
  }

  if (args.latestBriefId) {
    return {
      headline: "Saved brief ready",
      supportingText: hasKnownSource
        ? `Latest brief is ready for ${sourceLabel}.`
        : "Latest brief is ready.",
      sourceLabel,
    };
  }

  switch (args.latestResultState) {
    case "supported_provider_matched_with_observed_openings":
      return {
        headline: "Matched source found",
        supportingText: `Open roles observed via ${sourceLabel}.`,
        sourceLabel,
      };
    case "supported_provider_matched_with_zero_observed_openings":
      return {
        headline: "Matched source found",
        supportingText: `No open roles observed via ${sourceLabel}.`,
        sourceLabel,
      };
    case "provider_failure":
      return {
        headline: "Check failed",
        supportingText: hasKnownSource
          ? `The last check failed for ${sourceLabel}.`
          : "The last check failed before a source was confirmed.",
        sourceLabel,
      };
    case "unsupported_ats_or_source_pattern":
    case "no_matched_provider_found":
      return {
        headline: "No supported source found",
        supportingText: hasKnownSource
          ? `Using ${sourceLabel}.`
          : "Stratum has not confirmed a supported source yet.",
        sourceLabel,
      };
    case "ambiguous_company_match":
      return {
        headline: "Company match unclear",
        supportingText: hasKnownSource
          ? `Using ${sourceLabel}.`
          : "The match is still unclear.",
        sourceLabel,
      };
    default:
      return {
        headline: hasKnownSource ? "Matched source found" : "No supported source found",
        supportingText: hasKnownSource
          ? `First check pending for ${sourceLabel}.`
          : "No supported source confirmed.",
        sourceLabel,
      };
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

  const primary = providerLabel ?? identity.sourceHost ?? "Source not identified";
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

export function buildWatchlistDisplayIdentity(args: {
  requestedQuery: string;
  matchedCompanyName?: string | null;
  atsSourceUsed?: JobBoardSource | string | null;
}): WatchlistDisplayIdentity {
  const identity = formatWatchlistTargetIdentity(args.requestedQuery, args.matchedCompanyName);
  const sourceGrounding = buildWatchlistSourceGrounding(args);
  const displayedMetaValues = [
    identity.secondary,
    shouldHideIdentityMetaValue(identity.tertiary) ? null : identity.tertiary,
  ];
  const meta = formatWatchlistMetadataLine(displayedMetaValues);
  const normalizedPrimary = normalizeComparableValue(identity.primary);
  const normalizedMeta = new Set(
    displayedMetaValues
      .map((value) => value?.trim())
      .filter(Boolean)
      .map((value) => normalizeComparableValue(value!))
  );

  const filteredSourceSecondary =
    sourceGrounding.secondary &&
    !normalizedMeta.has(normalizeComparableValue(sourceGrounding.secondary)) &&
    normalizeComparableValue(sourceGrounding.secondary) !== normalizedPrimary
      ? sourceGrounding.secondary
      : null;
  const filteredSourceTertiary =
    sourceGrounding.tertiary &&
    !normalizedMeta.has(normalizeComparableValue(sourceGrounding.tertiary)) &&
    normalizeComparableValue(sourceGrounding.tertiary) !== normalizedPrimary
      ? sourceGrounding.tertiary
      : null;

  return {
    primary: identity.primary,
    meta,
    uncertain: identity.uncertain,
    sourceGrounding: {
      primary: sourceGrounding.primary,
      secondary: filteredSourceSecondary,
      tertiary: filteredSourceTertiary,
    },
  };
}
