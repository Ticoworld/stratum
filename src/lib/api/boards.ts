/**
 * Job Board API - Greenhouse, Lever, Ashby, Workable
 * Fetches open roles from company job boards and preserves the strongest
 * publicly available evidence for each role, plus fetch-state metadata.
 */

import { fetchWithRetry } from "./fetchWithRetry";
import { fetchFromAshby } from "./ashby";
import { fetchFromWorkable } from "./workable";
import { humanizeIdentityToken } from "../watchlists/identity";

export type JobBoardSource = "GREENHOUSE" | "LEVER" | "ASHBY" | "WORKABLE";
export type JobSourceTimestampType = "published_at" | "updated_at" | "created_at";
export type CompanyResolutionKind = "direct" | "alias" | "fallback";
export type FetchAttemptStatus =
  | "jobs_found"
  | "zero_jobs"
  | "not_found"
  | "error"
  | "not_applicable"
  | "not_attempted_after_match";
export type SourceInputMode = "company_name" | "supported_source_input" | "unsupported_source_input";
export type UnsupportedSourcePattern =
  | "WORKDAY"
  | "SMARTRECRUITERS"
  | "JOBVITE"
  | "RECRUITEE"
  | "ICIMS"
  | "TEAMTAILOR"
  | "PERSONIO"
  | "BAMBOOHR"
  | "COMEET";

export interface Job {
  title: string;
  location: string | null;
  department: string | null;
  source: JobBoardSource;
  roleId: string | null;
  roleIdType: string | null;
  requisitionId: string | null;
  jobUrl: string | null;
  applyUrl: string | null;
  sourceTimestamp: string | null;
  sourceTimestampType: JobSourceTimestampType | null;
  observedAt: string;
}

export interface FetchAttempt {
  token: string;
  source: JobBoardSource;
  status: FetchAttemptStatus;
  jobsCount: number;
  errorMessage?: string;
}

export interface SourceCandidateMatch {
  source: JobBoardSource;
  token: string;
  jobsCount: number;
  resolutionKind: CompanyResolutionKind;
  matchedAs: string | null;
}

export interface SupportedSourceHint {
  source: JobBoardSource;
  token: string;
  rawInput: string;
}

const GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards";
const LEVER_BASE = "https://api.lever.co/v0/postings";

/**
 * Company name -> board token aliases.
 * Rebrands, subsidiaries, and common name mismatches.
 */
const BOARD_ALIASES: Record<string, string> = {
  grok: "xai",
  xai: "xai",
  "x.ai": "xai",
  twitter: "x",
  x: "x",
};

/**
 * When primary token 404s, try these alternates.
 */
const FALLBACK_TOKENS: Record<string, string[]> = {
  twitter: ["x"],
};

/**
 * Display name for resolved token.
 */
const RESOLVED_DISPLAY: Record<string, string> = {
  x: "X",
  xai: "X.AI",
};

const UNSUPPORTED_SOURCE_PATTERNS: Array<{
  label: UnsupportedSourcePattern;
  pattern: RegExp;
}> = [
  { label: "WORKDAY", pattern: /myworkdayjobs|workdayjobs|workday/i },
  { label: "SMARTRECRUITERS", pattern: /smartrecruiters/i },
  { label: "JOBVITE", pattern: /jobvite/i },
  { label: "RECRUITEE", pattern: /recruitee/i },
  { label: "ICIMS", pattern: /icims/i },
  { label: "TEAMTAILOR", pattern: /teamtailor/i },
  { label: "PERSONIO", pattern: /personio/i },
  { label: "BAMBOOHR", pattern: /bamboohr/i },
  { label: "COMEET", pattern: /comeet/i },
];

function toRawBoardToken(companyName: string): string {
  return companyName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "");
}

function toBoardToken(companyName: string): string {
  const raw = toRawBoardToken(companyName);
  return BOARD_ALIASES[raw] ?? raw;
}

function toDisplayName(token: string): string {
  if (RESOLVED_DISPLAY[token]) return RESOLVED_DISPLAY[token];

  const normalized = humanizeIdentityToken(token);
  if (normalized) return normalized;

  return token
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseIsoDateOrNull(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;

  try {
    const date = typeof value === "number" ? new Date(value) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

const SUPPORTED_SOURCE_PATTERNS: Array<{
  source: JobBoardSource;
  pattern: RegExp;
}> = [
  {
    source: "GREENHOUSE",
    pattern: /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9][a-z0-9._-]*)/i,
  },
  {
    source: "LEVER",
    pattern: /jobs\.lever\.co\/([a-z0-9][a-z0-9._-]*)/i,
  },
  {
    source: "LEVER",
    pattern: /api\.lever\.co\/v0\/postings\/([a-z0-9][a-z0-9._-]*)/i,
  },
  {
    source: "ASHBY",
    pattern: /(?:jobs\.)?ashbyhq\.com\/([a-z0-9][a-z0-9._-]*)/i,
  },
  {
    source: "WORKABLE",
    pattern: /apply\.workable\.com\/([a-z0-9][a-z0-9._-]*)/i,
  },
];

function isLikelySourceInput(value: string): boolean {
  return /https?:\/\/|www\.|\/|\.com|\.io|\.jobs|\.app|\.co|\.hr|\.careers|careers\.|jobs\./i.test(value);
}

function detectSupportedSourceHint(companyName: string): SupportedSourceHint | null {
  const value = companyName.trim();
  if (!value || !isLikelySourceInput(value)) return null;

  for (const candidate of SUPPORTED_SOURCE_PATTERNS) {
    const match = value.match(candidate.pattern);
    const token = toRawBoardToken(match?.[1] ?? "");
    if (!match || !token) continue;

    return {
      source: candidate.source,
      token,
      rawInput: value,
    };
  }

  return null;
}

function detectUnsupportedSourcePattern(companyName: string): UnsupportedSourcePattern | null {
  const value = companyName.trim();
  if (!value || !isLikelySourceInput(value)) return null;

  for (const candidate of UNSUPPORTED_SOURCE_PATTERNS) {
    if (candidate.pattern.test(value)) return candidate.label;
  }

  return null;
}

function getResolutionKind(
  requestedToken: string,
  normalizedToken: string,
  resolvedToken: string
): CompanyResolutionKind {
  if (resolvedToken !== normalizedToken) return "fallback";
  if (normalizedToken !== requestedToken) return "alias";
  return "direct";
}

function getMatchedAs(
  requestedToken: string,
  normalizedToken: string,
  resolvedToken: string,
  sourceInputMode: SourceInputMode
): string | undefined {
  if (sourceInputMode === "supported_source_input") return toDisplayName(resolvedToken);
  if (resolvedToken !== requestedToken) return toDisplayName(resolvedToken);
  if (normalizedToken !== requestedToken) return toDisplayName(normalizedToken);
  return undefined;
}

/**
 * Fetches jobs from Greenhouse API.
 */
async function fetchFromGreenhouse(boardToken: string): Promise<Job[]> {
  const url = `${GREENHOUSE_BASE}/${boardToken}/jobs?content=true`;
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("NOT_FOUND");
    throw new Error(`Greenhouse: ${res.status}`);
  }

  const data = await res.json();
  const jobs = data.jobs ?? [];
  const observedAt = new Date().toISOString();

  return jobs.map(
    (j: {
      id?: number;
      internal_job_id?: number | null;
      title?: string;
      location?: { name?: string };
      departments?: { id?: number; name?: string }[];
      updated_at?: string;
      requisition_id?: string | null;
      absolute_url?: string;
    }) => {
      const sourceTimestamp = parseIsoDateOrNull(j.updated_at);
      return {
        title: normalizeText(j.title) ?? "Unknown",
        location: normalizeText(j.location?.name),
        department: normalizeText(j.departments?.[0]?.name),
        source: "GREENHOUSE" as const,
        roleId:
          typeof j.id === "number"
            ? String(j.id)
            : typeof j.internal_job_id === "number"
              ? String(j.internal_job_id)
              : null,
        roleIdType:
          typeof j.id === "number"
            ? "posting_id"
            : typeof j.internal_job_id === "number"
              ? "internal_job_id"
              : null,
        requisitionId: normalizeText(j.requisition_id),
        jobUrl: normalizeText(j.absolute_url),
        applyUrl: normalizeText(j.absolute_url),
        sourceTimestamp,
        sourceTimestampType: sourceTimestamp ? "updated_at" : null,
        observedAt,
      };
    }
  );
}

/**
 * Fetches jobs from Lever API.
 */
async function fetchFromLever(siteToken: string): Promise<Job[]> {
  const url = `${LEVER_BASE}/${siteToken}?mode=json`;
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("NOT_FOUND");
    throw new Error(`Lever: ${res.status}`);
  }

  const jobs = await res.json();
  if (!Array.isArray(jobs)) return [];

  const observedAt = new Date().toISOString();

  return jobs.map(
    (j: {
      id?: string;
      text?: string;
      categories?: {
        location?: string;
        department?: string;
      };
      hostedUrl?: string;
      applyUrl?: string;
      updatedAt?: number;
      workplaceType?: string;
    }) => {
      const sourceTimestamp = parseIsoDateOrNull(j.updatedAt);
      const roleId = normalizeText(j.id);

      return {
        title: normalizeText(j.text) ?? "Unknown",
        location:
          normalizeText(j.categories?.location) ??
          (normalizeText(j.workplaceType)?.toLowerCase() === "remote" ? "Remote" : null),
        department: normalizeText(j.categories?.department),
        source: "LEVER" as const,
        roleId,
        roleIdType: roleId ? "posting_id" : null,
        requisitionId: null,
        jobUrl: normalizeText(j.hostedUrl),
        applyUrl: normalizeText(j.applyUrl),
        sourceTimestamp,
        sourceTimestampType: sourceTimestamp ? "updated_at" : null,
        observedAt,
      };
    }
  );
}

/**
 * Priority hint: try this source first for this company. If it fails or returns 0 jobs,
 * continue to other sources.
 */
const COMPANY_MAP: Record<string, JobBoardSource> = {
  notion: "ASHBY",
  linear: "ASHBY",
  raycast: "ASHBY",
  ramp: "ASHBY",
  deel: "ASHBY",
  retool: "ASHBY",
  vanta: "ASHBY",
  remote: "ASHBY",
  brex: "ASHBY",
  vercel: "GREENHOUSE",
  perplexity: "ASHBY",
  duolingo: "ASHBY",
  jobgether: "WORKABLE",
  supportyourapp: "WORKABLE",
  advisacare: "WORKABLE",
  ryanair: "WORKABLE",
  typeform: "GREENHOUSE",
  bolt: "GREENHOUSE",
  stripe: "GREENHOUSE",
  airbnb: "GREENHOUSE",
};

export interface FetchCompanyJobsResult {
  jobs: Job[];
  source: JobBoardSource | null;
  requestedToken: string;
  normalizedToken: string;
  resolvedToken?: string;
  matchedAs?: string;
  resolutionKind: CompanyResolutionKind | null;
  attempts: FetchAttempt[];
  candidateMatches: SourceCandidateMatch[];
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
}

const ALL_SOURCES: JobBoardSource[] = ["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"];

type SourceOutcome =
  | { status: "jobs_found"; jobs: Job[]; source: JobBoardSource; token: string }
  | { status: "zero_jobs"; jobs: Job[]; source: JobBoardSource; token: string }
  | { status: "not_found"; jobs: Job[]; source: JobBoardSource; token: string }
  | { status: "error"; jobs: Job[]; source: JobBoardSource; token: string; errorMessage: string };

async function tryFetchOutcome(token: string, source: JobBoardSource): Promise<SourceOutcome> {
  try {
    let jobs: Job[];

    switch (source) {
      case "GREENHOUSE":
        jobs = await fetchFromGreenhouse(token);
        break;
      case "LEVER":
        jobs = await fetchFromLever(token);
        break;
      case "ASHBY":
        jobs = await fetchFromAshby(token);
        break;
      case "WORKABLE":
        jobs = await fetchFromWorkable(token);
        break;
    }

    return {
      status: jobs.length > 0 ? "jobs_found" : "zero_jobs",
      jobs,
      source,
      token,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { status: "not_found", jobs: [], source, token };
    }

    return {
      status: "error",
      jobs: [],
      source,
      token,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function getSourceOrder(token: string): JobBoardSource[] {
  const primary = COMPANY_MAP[token];
  if (!primary) return [...ALL_SOURCES];
  return [primary, ...ALL_SOURCES.filter((source) => source !== primary)];
}

function buildNotApplicableAttempts(token: string, requestedSourceHint: JobBoardSource | null): FetchAttempt[] {
  return ALL_SOURCES.filter((source) => source !== requestedSourceHint).map((source) => ({
    token,
    source,
    status: "not_applicable" as const,
    jobsCount: 0,
  }));
}

function buildNotAttemptedAfterMatchAttempts(args: {
  attempts: FetchAttempt[];
  matchedSource: JobBoardSource;
  token: string;
}): FetchAttempt[] {
  const { attempts, matchedSource, token } = args;

  return ALL_SOURCES.filter(
    (source) => source !== matchedSource && !attempts.some((attempt) => attempt.source === source)
  ).map((source) => ({
    token,
    source,
    status: "not_attempted_after_match" as const,
    jobsCount: 0,
  }));
}

function buildE2ENoMatchOverride(companyName: string): FetchCompanyJobsResult | null {
  if (process.env.STRATUM_E2E_MODE !== "1") {
    return null;
  }

  const expectedQuery = process.env.STRATUM_E2E_NO_MATCH_QUERY?.trim();
  if (!expectedQuery || companyName.trim() !== expectedQuery) {
    return null;
  }

  const token = toRawBoardToken(companyName);

  return {
    jobs: [],
    source: null,
    requestedToken: token,
    normalizedToken: token,
    resolutionKind: null,
    attempts: ALL_SOURCES.map((source) => ({
      token,
      source,
      status: "not_found" as const,
      jobsCount: 0,
    })),
    candidateMatches: [],
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    unsupportedSourcePattern: null,
  };
}

function buildE2EProviderFailureOverride(companyName: string): FetchCompanyJobsResult | null {
  if (process.env.STRATUM_E2E_MODE !== "1") {
    return null;
  }

  const expectedQuery = process.env.STRATUM_E2E_PROVIDER_FAILURE_QUERY?.trim();
  if (!expectedQuery || companyName.trim() !== expectedQuery) {
    return null;
  }

  const token = toRawBoardToken(companyName);

  return {
    jobs: [],
    source: null,
    requestedToken: token,
    normalizedToken: token,
    resolutionKind: null,
    attempts: [
      {
        token,
        source: "GREENHOUSE",
        status: "error" as const,
        jobsCount: 0,
        errorMessage: "Greenhouse: 500",
      },
      {
        token,
        source: "LEVER",
        status: "not_found" as const,
        jobsCount: 0,
      },
      {
        token,
        source: "ASHBY",
        status: "not_found" as const,
        jobsCount: 0,
      },
      {
        token,
        source: "WORKABLE",
        status: "not_found" as const,
        jobsCount: 0,
      },
    ],
    candidateMatches: [],
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    unsupportedSourcePattern: null,
  };
}

function buildE2EMultiCandidateOverride(companyName: string): FetchCompanyJobsResult | null {
  if (process.env.STRATUM_E2E_MODE !== "1") {
    return null;
  }

  const expectedQuery = "Phase11 Multi Candidate Fixture";
  if (companyName.trim() !== expectedQuery) {
    return null;
  }

  const token = toRawBoardToken(companyName) || "notion";

  return {
    jobs: [
      {
        title: "Platform Engineer",
        location: "Remote",
        department: "Engineering",
        source: "ASHBY",
        roleId: "ashby-001",
        roleIdType: "posting_id",
        requisitionId: null,
        jobUrl: `https://jobs.ashbyhq.com/${token}/platform-engineer`,
        applyUrl: `https://jobs.ashbyhq.com/${token}/platform-engineer`,
        sourceTimestamp: new Date().toISOString(),
        sourceTimestampType: "updated_at",
        observedAt: new Date().toISOString(),
      },
    ],
    source: "ASHBY",
    requestedToken: token,
    normalizedToken: token,
    resolvedToken: token,
    matchedAs: "Notion",
    resolutionKind: "direct",
    attempts: [
      {
        token,
        source: "ASHBY",
        status: "jobs_found",
        jobsCount: 1,
      },
      {
        token,
        source: "GREENHOUSE",
        status: "jobs_found",
        jobsCount: 1,
      },
      {
        token,
        source: "LEVER",
        status: "not_found",
        jobsCount: 0,
      },
      {
        token,
        source: "WORKABLE",
        status: "zero_jobs",
        jobsCount: 0,
      },
    ],
    candidateMatches: [
      {
        source: "ASHBY",
        token,
        jobsCount: 1,
        resolutionKind: "direct",
        matchedAs: "Notion",
      },
      {
        source: "GREENHOUSE",
        token,
        jobsCount: 1,
        resolutionKind: "direct",
        matchedAs: "Notion",
      },
    ],
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    unsupportedSourcePattern: null,
  };
}

/**
 * Fetches company jobs and preserves enough metadata to distinguish:
 * jobs found, zero-role matches, provider failures, unsupported source hints,
 * and no-supported-provider matches.
 */
export async function fetchCompanyJobs(companyName: string): Promise<FetchCompanyJobsResult> {
  const e2eMultiCandidateOverride = buildE2EMultiCandidateOverride(companyName);
  if (e2eMultiCandidateOverride) {
    return e2eMultiCandidateOverride;
  }

  const supportedSourceHint = detectSupportedSourceHint(companyName);
  const requestedToken = supportedSourceHint ? supportedSourceHint.token : toRawBoardToken(companyName);
  const normalizedToken = toBoardToken(supportedSourceHint?.token ?? companyName);
  const unsupportedSourcePattern = supportedSourceHint ? null : detectUnsupportedSourcePattern(companyName);
  const sourceInputMode: SourceInputMode = supportedSourceHint
    ? "supported_source_input"
    : unsupportedSourcePattern
      ? "unsupported_source_input"
      : "company_name";

  if (!normalizedToken) {
      return {
        jobs: [],
        source: null,
        requestedToken,
        normalizedToken,
        resolutionKind: null,
        attempts: [],
        candidateMatches: [],
        sourceInputMode,
        requestedSourceHint: supportedSourceHint?.source ?? null,
        unsupportedSourcePattern,
    };
  }

  if (unsupportedSourcePattern) {
      return {
        jobs: [],
        source: null,
        requestedToken,
        normalizedToken,
        resolutionKind: null,
        attempts: buildNotApplicableAttempts(normalizedToken, null),
        candidateMatches: [],
        sourceInputMode,
        requestedSourceHint: null,
        unsupportedSourcePattern,
      };
  }

  const e2eNoMatchOverride = buildE2ENoMatchOverride(companyName);
  if (e2eNoMatchOverride) {
    return e2eNoMatchOverride;
  }

  const e2eProviderFailureOverride = buildE2EProviderFailureOverride(companyName);
  if (e2eProviderFailureOverride) {
    return e2eProviderFailureOverride;
  }

  const primarySource = COMPANY_MAP[normalizedToken];
  const sourceOrder = supportedSourceHint ? [supportedSourceHint.source] : getSourceOrder(normalizedToken);
  const tokensToTry = [normalizedToken, ...(FALLBACK_TOKENS[normalizedToken] ?? [])];
  const attempts: FetchAttempt[] = [];
  let zeroMatch: { source: JobBoardSource; token: string } | null = null;
  const candidateMatches: SourceCandidateMatch[] = [];
  let primaryMatch:
    | {
        jobs: Job[];
        source: JobBoardSource;
        token: string;
        matchedAs: string | undefined;
        resolutionKind: CompanyResolutionKind;
      }
    | null = null;

  for (const token of tokensToTry) {
    for (const source of sourceOrder) {
      const outcome = await tryFetchOutcome(token, source);

      attempts.push({
        token,
        source,
        status: outcome.status,
        jobsCount: outcome.jobs.length,
        errorMessage: outcome.status === "error" ? outcome.errorMessage : undefined,
      });

      if (outcome.status === "jobs_found" || outcome.status === "zero_jobs") {
        const resolutionKind = getResolutionKind(requestedToken, normalizedToken, token);
        const matchedAs = getMatchedAs(requestedToken, normalizedToken, token, sourceInputMode);
        candidateMatches.push({
          source,
          token,
          jobsCount: outcome.jobs.length,
          resolutionKind,
          matchedAs: matchedAs ?? null,
        });

        if (outcome.status === "jobs_found" && !primaryMatch) {
          primaryMatch = {
            jobs: outcome.jobs,
            source,
            token,
            matchedAs,
            resolutionKind,
          };
        }

        if (outcome.status === "jobs_found" && primarySource && source !== primarySource) {
          console.warn(
            `[Stratum:COMPANY_MAP] Primary source ${primarySource} failed, returned 0 jobs, or did not match for "${companyName}" (token: ${normalizedToken}). Fallback ${source} succeeded. Consider updating COMPANY_MAP.`
          );
        }
      }

      if (outcome.status === "zero_jobs" && !zeroMatch) {
        zeroMatch = { source, token };
      }
    }
  }

  if (primaryMatch) {
    const trailingAttempts =
      sourceInputMode === "supported_source_input"
        ? buildNotApplicableAttempts(normalizedToken, supportedSourceHint?.source ?? null)
        : [];

    return {
      jobs: primaryMatch.jobs,
      source: primaryMatch.source,
      requestedToken,
      normalizedToken,
      resolvedToken: primaryMatch.token,
      matchedAs: primaryMatch.matchedAs,
      resolutionKind: primaryMatch.resolutionKind,
      attempts: [...attempts, ...trailingAttempts],
      candidateMatches,
      sourceInputMode,
      requestedSourceHint: supportedSourceHint?.source ?? null,
      unsupportedSourcePattern,
    };
  }

  if (zeroMatch) {
    const trailingAttempts =
      sourceInputMode === "supported_source_input"
        ? buildNotApplicableAttempts(normalizedToken, supportedSourceHint?.source ?? null)
        : [];

    return {
      jobs: [],
      source: zeroMatch.source,
      requestedToken,
      normalizedToken,
      resolvedToken: zeroMatch.token,
      matchedAs: getMatchedAs(requestedToken, normalizedToken, zeroMatch.token, sourceInputMode),
      resolutionKind: getResolutionKind(requestedToken, normalizedToken, zeroMatch.token),
      attempts: [...attempts, ...trailingAttempts],
      candidateMatches,
      sourceInputMode,
      requestedSourceHint: supportedSourceHint?.source ?? null,
      unsupportedSourcePattern,
    };
  }

  const trailingAttempts =
    sourceInputMode === "supported_source_input"
      ? buildNotApplicableAttempts(normalizedToken, supportedSourceHint?.source ?? null)
      : [];

  return {
    jobs: [],
    source: null,
    requestedToken,
    normalizedToken,
    resolutionKind: null,
    attempts: [...attempts, ...trailingAttempts],
    candidateMatches,
    sourceInputMode,
    requestedSourceHint: supportedSourceHint?.source ?? null,
    unsupportedSourcePattern,
  };
}
