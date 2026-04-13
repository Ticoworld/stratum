function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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

function titleCaseWord(word: string): string {
  if (!word) return word;
  if (/^[A-Z0-9&]{2,5}$/.test(word)) return word;
  if (/^[a-z0-9&]{2,5}$/.test(word) && /[0-9]/.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function cleanLabelToken(value: string): string {
  return value
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

function detectProviderFromHost(host: string): string | null {
  if (/(^|\.)greenhouse\.io$/i.test(host)) return "Greenhouse";
  if (/(^|\.)lever\.co$/i.test(host)) return "Lever";
  if (/(^|\.)ashbyhq\.com$/i.test(host)) return "Ashby";
  if (/(^|\.)workable\.com$/i.test(host)) return "Workable";
  return null;
}

function deriveLabelFromHost(host: string): string | null {
  const segments = host.split(".").filter(Boolean);
  if (segments.length < 3) return null;

  const candidate = segments[0]?.toLowerCase();
  if (!candidate || GENERIC_HOST_SEGMENTS.has(candidate)) return null;
  return humanizeLabel(candidate);
}

function deriveLabelFromPath(path: string | null): string | null {
  if (!path) return null;

  const segments = path
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

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (GENERIC_PATH_SEGMENTS.has(candidate.toLowerCase())) continue;

    const label = humanizeLabel(candidate);
    if (label) return label;
  }

  return null;
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
  const matched = matchedCompanyName ? normalizeWhitespace(matchedCompanyName) : "";
  const parsed = requested && isUrlLike(requested) ? extractHostAndPath(requested) : null;
  const sourceProvider = parsed ? detectProviderFromHost(parsed.host) : null;
  const sourceHost = parsed?.host ?? null;
  const sourcePath = parsed?.path ?? null;

  if (matched) {
    return {
      primary: matched,
      secondary: sourceHost,
      tertiary: sourcePath,
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
    const derivedPrimary = deriveLabelFromPath(parsed.path) ?? deriveLabelFromHost(parsed.host);
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
