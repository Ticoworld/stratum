function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeComparableValue(value: string): string {
  return value.trim().toLowerCase();
}

function isUrlLike(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    /(^|[./-])www\./i.test(value) ||
    /\.(com|io|co|jobs|app|careers|hr)(\/|$)/i.test(value)
  );
}

function extractHostAndPath(value: string): { host: string; path: string | null } | null {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./i, "");
    const path = url.pathname.replace(/\/+$/, "");
    return {
      host,
      path: path && path !== "/" ? path : null,
    };
  } catch {
    return null;
  }
}

function getPathSegments(path: string | null): string[] {
  if (!path) return [];

  return path
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .map((segment) => segment.replace(/\.[A-Za-z0-9]+$/i, ""))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

const GENERIC_HOST_SEGMENTS = new Set([
  "apply",
  "app",
  "boards",
  "careers",
  "hire",
  "jobs",
  "portal",
  "team",
  "www",
]);

const GENERIC_PATH_SEGMENTS = new Set([
  "apply",
  "board",
  "boards",
  "careers",
  "company",
  "jobs",
  "job",
  "open-roles",
  "openings",
  "positions",
  "roles",
  "search",
]);

const GENERIC_LOCALE_SEGMENT = /^[a-z]{2}(?:-[a-z]{2})?$/i;
const TRAILING_LEGAL_SUFFIXES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /([a-z0-9])incorporated$/i, replacement: "$1 Incorporated" },
  { pattern: /([a-z0-9])corporation$/i, replacement: "$1 Corporation" },
  { pattern: /([a-z0-9])limited$/i, replacement: "$1 Limited" },
  { pattern: /([a-z0-9])holdings$/i, replacement: "$1 Holdings" },
  { pattern: /([a-z0-9])partners$/i, replacement: "$1 Partners" },
  { pattern: /([a-z0-9])group$/i, replacement: "$1 Group" },
  { pattern: /([a-z0-9])inc$/i, replacement: "$1 Inc" },
  { pattern: /([a-z0-9])llc$/i, replacement: "$1 LLC" },
  { pattern: /([a-z0-9])ltd$/i, replacement: "$1 Ltd" },
  { pattern: /([a-z0-9])corp$/i, replacement: "$1 Corp" },
  { pattern: /([a-z0-9])plc$/i, replacement: "$1 PLC" },
  { pattern: /([a-z0-9])gmbh$/i, replacement: "$1 GmbH" },
  { pattern: /([a-z0-9])sarl$/i, replacement: "$1 SARL" },
  { pattern: /([a-z0-9])bv$/i, replacement: "$1 BV" },
  { pattern: /([a-z0-9])ag$/i, replacement: "$1 AG" },
  { pattern: /([a-z0-9])sa$/i, replacement: "$1 SA" },
];

function titleCaseWord(word: string): string {
  if (!word) return word;
  if (word.includes(".")) {
    const dotSegments = word.split(".").filter(Boolean);
    if (dotSegments.every((segment) => /^[A-Za-z0-9&]{1,5}$/.test(segment))) {
      return dotSegments.map((segment) => segment.toUpperCase()).join(".");
    }
  }
  if (/^[A-Z0-9&]{2,5}$/.test(word)) return word;
  if (/^[a-z0-9&]{2,5}$/.test(word) && /[0-9]/.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function splitTrailingLegalSuffix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\s_-]/.test(trimmed)) return trimmed;

  for (const candidate of TRAILING_LEGAL_SUFFIXES) {
    if (!candidate.pattern.test(trimmed)) continue;
    return trimmed.replace(candidate.pattern, candidate.replacement);
  }

  return trimmed;
}

function cleanLabelToken(value: string): string {
  return splitTrailingLegalSuffix(value)
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
}

function isSupportableReadableLabel(value: string): boolean {
  const cleaned = cleanLabelToken(value);
  if (!cleaned) return false;
  if (/[/?#=&%:@]/.test(value)) return false;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (words.some((word) => word.length > 28)) return false;

  const alphaCharacters = cleaned.replace(/[^A-Za-z]/g, "").length;
  const numericCharacters = cleaned.replace(/\D/g, "").length;
  if (alphaCharacters < 2) return false;
  if (numericCharacters > Math.max(4, alphaCharacters)) return false;

  return true;
}

function humanizeLabel(value: string): string | null {
  if (!isSupportableReadableLabel(value)) return null;

  const cleaned = cleanLabelToken(value);
  if (!cleaned) return null;

  return cleaned
    .split(/\s+/)
    .map((word) => titleCaseWord(word))
    .join(" ");
}

function isLikelyOpaqueSlug(value: string): boolean {
  const cleaned = cleanLabelToken(value).replace(/\s+/g, "");
  if (!cleaned) return true;
  if (/^[a-f0-9]{6,}$/i.test(cleaned)) return true;
  if (/^[0-9]+$/.test(cleaned)) return true;
  return false;
}

function detectProviderFromHost(host: string): string | null {
  if (/(^|\.)greenhouse\.io$/i.test(host)) return "Greenhouse";
  if (/(^|\.)lever\.co$/i.test(host)) return "Lever";
  if (/(^|\.)ashbyhq\.com$/i.test(host)) return "Ashby";
  if (/(^|\.)workable\.com$/i.test(host)) return "Workable";
  if (/myworkdayjobs|workdayjobs/i.test(host)) return "Workday";
  if (/(^|\.)smartrecruiters\.com$/i.test(host)) return "SmartRecruiters";
  if (/(^|\.)jobvite\.com$/i.test(host)) return "Jobvite";
  if (/(^|\.)recruitee\.com$/i.test(host)) return "Recruitee";
  if (/(^|\.)icims\.com$/i.test(host)) return "iCIMS";
  if (/(^|\.)teamtailor\.com$/i.test(host)) return "Teamtailor";
  if (/(^|\.)personio\.(de|com)$/i.test(host)) return "Personio";
  if (/(^|\.)bamboohr\.com$/i.test(host)) return "BambooHR";
  if (/(^|\.)comeet\.(co|com)$/i.test(host)) return "Comeet";
  return null;
}

function deriveLabelFromHost(host: string): string | null {
  const segments = host.split(".").filter(Boolean);
  if (segments.length < 2) return null;

  const candidate = segments[0]?.toLowerCase();
  if (!candidate || GENERIC_HOST_SEGMENTS.has(candidate)) return null;
  return humanizeLabel(candidate);
}

function deriveLabelFromPath(path: string | null): string | null {
  const segments = getPathSegments(path);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (GENERIC_PATH_SEGMENTS.has(candidate.toLowerCase())) continue;
    if (GENERIC_LOCALE_SEGMENT.test(candidate)) continue;
    if (/[0-9]/.test(candidate)) continue;
    if (isLikelyOpaqueSlug(candidate)) continue;

    const label = humanizeLabel(candidate);
    if (label) return label;
  }

  return null;
}

function extractSupportedSourceToken(host: string, path: string | null): string | null {
  const segments = getPathSegments(path);

  if (/(?:^|\.)boards\.greenhouse\.io$|(?:^|\.)job-boards\.greenhouse\.io$/i.test(host)) {
    return segments[0] ?? null;
  }

  if (/(?:^|\.)jobs\.lever\.co$/i.test(host)) {
    return segments[0] ?? null;
  }

  if (/(?:^|\.)api\.lever\.co$/i.test(host)) {
    return segments[0]?.toLowerCase() === "v0" && segments[1]?.toLowerCase() === "postings" ? segments[2] ?? null : null;
  }

  if (/(?:^|\.)jobs\.ashbyhq\.com$|(?:^|\.)ashbyhq\.com$/i.test(host)) {
    return segments[0] ?? null;
  }

  if (/(?:^|\.)apply\.workable\.com$/i.test(host)) {
    return segments[0] ?? null;
  }

  return null;
}

function derivePrimaryLabelFromSource(host: string, path: string | null): string | null {
  const supportedSourceToken = extractSupportedSourceToken(host, path);
  if (supportedSourceToken && !isLikelyOpaqueSlug(supportedSourceToken)) {
    const supportedLabel = humanizeLabel(supportedSourceToken);
    if (supportedLabel) return supportedLabel;
  }

  return deriveLabelFromHost(host) ?? deriveLabelFromPath(path);
}

export function humanizeIdentityToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized || isUrlLike(normalized)) return null;
  return humanizeLabel(normalized);
}

function buildComparableMetadata(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalizeComparableValue(normalized) : null;
}

export interface WatchlistTargetIdentity {
  primary: string;
  secondary: string | null;
  tertiary: string | null;
  sourceHost: string | null;
  sourcePath: string | null;
  sourceProvider: string | null;
  uncertain: boolean;
}

export function formatWatchlistTargetIdentity(
  requestedQuery: string,
  matchedCompanyName?: string | null
): WatchlistTargetIdentity {
  const requested = normalizeWhitespace(requestedQuery);
  const rawMatched = matchedCompanyName ? normalizeWhitespace(matchedCompanyName) : "";
  const parsed = requested && isUrlLike(requested) ? extractHostAndPath(requested) : null;
  const sourceProvider = parsed ? detectProviderFromHost(parsed.host) : null;
  const sourceHost = parsed?.host ?? null;
  const sourcePath = parsed?.path ?? null;
  const matched = humanizeIdentityToken(rawMatched);

  if (matched) {
    const normalizedPrimary = buildComparableMetadata(matched);
    const normalizedHost = buildComparableMetadata(sourceHost);
    const tertiary =
      sourcePath && humanizeLabel(sourcePath) !== matched ? sourcePath : null;

    return {
      primary: matched,
      secondary:
        sourceHost && normalizedHost !== normalizedPrimary
          ? sourceHost
          : sourceProvider && buildComparableMetadata(sourceProvider) !== normalizedPrimary
            ? sourceProvider
            : null,
      tertiary,
      sourceHost,
      sourcePath,
      sourceProvider,
      uncertain: false,
    };
  }

  if (!requested) {
    return {
      primary: "Unresolved target",
      secondary: "No source available yet",
      tertiary: null,
      sourceHost: null,
      sourcePath: null,
      sourceProvider: null,
      uncertain: true,
    };
  }

  if (parsed) {
    const derivedPrimary = derivePrimaryLabelFromSource(parsed.host, parsed.path);
    if (derivedPrimary) {
      return {
        primary: derivedPrimary,
        secondary: parsed.host,
        tertiary: parsed.path && humanizeLabel(parsed.path) !== derivedPrimary ? parsed.path : null,
        sourceHost,
        sourcePath,
        sourceProvider,
        uncertain: false,
      };
    }

    return {
      primary: parsed.host,
      secondary: sourceProvider,
      tertiary: parsed.path,
      sourceHost,
      sourcePath,
      sourceProvider,
      uncertain: true,
    };
  }

  const readableRequested = humanizeLabel(requested);
  if (readableRequested) {
    return {
      primary: readableRequested,
      secondary: null,
      tertiary: null,
      sourceHost: null,
      sourcePath: null,
      sourceProvider: null,
      uncertain: false,
    };
  }

  return {
    primary: "Unresolved target",
    secondary: requested,
    tertiary: null,
    sourceHost: null,
    sourcePath: null,
    sourceProvider: null,
    uncertain: true,
  };
}

export function getNormalizedTrackedTargetName(
  requestedQuery: string,
  matchedCompanyName?: string | null
): string | null {
  const identity = formatWatchlistTargetIdentity(requestedQuery, matchedCompanyName);
  if (identity.primary !== "Unresolved target") return identity.primary;

  const fallback = normalizeWhitespace(matchedCompanyName ?? requestedQuery ?? "");
  return fallback || null;
}
