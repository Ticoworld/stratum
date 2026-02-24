/**
 * Job Board API - Greenhouse, Lever, Ashby, Workable
 * Fetches open jobs from company job boards for corporate strategy analysis
 */

import { fetchWithRetry } from "./fetchWithRetry";
import { fetchFromAshby } from "./ashby";
import { fetchFromWorkable } from "./workable";

export interface Job {
  title: string;
  location: string;
  department: string;
  updated_at: string;
}

const GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards";
const LEVER_BASE = "https://api.lever.co/v0/postings";

/**
 * Company name → Greenhouse/Lever board token aliases.
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
 * When primary token 404s, try these alternates (e.g. different ATS slug for same company).
 */
const FALLBACK_TOKENS: Record<string, string[]> = {
  twitter: ["x"],
};

/**
 * Display name for resolved token (for "Matched as: X" in UI).
 */
const RESOLVED_DISPLAY: Record<string, string> = {
  x: "X",
  xai: "X.AI",
};

/**
 * Normalizes company name to board token format (lowercase, no spaces).
 */
function toBoardToken(companyName: string): string {
  const raw = companyName.trim().toLowerCase().replace(/\s+/g, "");
  return BOARD_ALIASES[raw] ?? raw;
}

function toDisplayName(token: string): string {
  return RESOLVED_DISPLAY[token] ?? token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Fetches jobs from Greenhouse API (with retry)
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
  return jobs.map((j: { title?: string; location?: { name?: string }; departments?: { name?: string }[]; updated_at?: string }) => ({
    title: j.title ?? "Unknown",
    location: (j.location?.name ?? "").trim() || "Remote",
    department: (j.departments?.[0]?.name ?? "").trim() || "General",
    updated_at: j.updated_at ?? new Date().toISOString(),
  }));
}

/**
 * Fetches jobs from Lever API (with retry)
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

  return jobs.map((j: { text?: string; categories?: { location?: string; department?: string }; updatedAt?: number }) => ({
    title: j.text ?? "Unknown",
    location: (j.categories?.location ?? "").trim() || "Remote",
    department: (j.categories?.department ?? "").trim() || "General",
    updated_at: j.updatedAt ? new Date(j.updatedAt).toISOString() : new Date().toISOString(),
  }));
}

export type JobBoardSource = "GREENHOUSE" | "LEVER" | "ASHBY" | "WORKABLE";

/**
 * Priority hint: try this source first for this company. If it fails or returns 0 jobs,
 * we continue to other sources (self-healing when companies change ATS).
 */
const COMPANY_MAP: Record<string, JobBoardSource> = {
  // --- ASHBY (Confirmed; API-only—no Framer: they use their own Framer-built careers page) ---
  notion: "ASHBY",
  linear: "ASHBY",
  raycast: "ASHBY",
  ramp: "ASHBY",
  deel: "ASHBY",
  retool: "ASHBY",
  vanta: "ASHBY",
  remote: "ASHBY",
  brex: "ASHBY",
  vercel: "ASHBY",
  perplexity: "ASHBY",
  duolingo: "ASHBY",

  // --- WORKABLE (Verified Active) ---
  jobgether: "WORKABLE",
  supportyourapp: "WORKABLE",
  advisacare: "WORKABLE",
  ryanair: "WORKABLE",

  // --- GREENHOUSE (Overrides - these use Greenhouse) ---
  typeform: "GREENHOUSE",
  bolt: "GREENHOUSE",
  stripe: "GREENHOUSE",
  airbnb: "GREENHOUSE",
};

export interface FetchCompanyJobsResult {
  jobs: Job[];
  source: JobBoardSource | null;
  /** Token we actually queried (when we used alias or fallback). */
  resolvedToken?: string;
  /** Display name for "Matched as: X" when resolvedToken differs from user input. */
  matchedAs?: string;
}

const ALL_SOURCES: JobBoardSource[] = ["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"];

async function tryFetchFromSource(
  token: string,
  source: JobBoardSource
): Promise<{ jobs: Job[]; source: JobBoardSource } | null> {
  try {
    switch (source) {
      case "GREENHOUSE":
        return { jobs: await fetchFromGreenhouse(token), source: "GREENHOUSE" };
      case "LEVER":
        return { jobs: await fetchFromLever(token), source: "LEVER" };
      case "ASHBY":
        return { jobs: await fetchFromAshby(token), source: "ASHBY" };
      case "WORKABLE":
        return { jobs: await fetchFromWorkable(token), source: "WORKABLE" };
    }
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return null;
    throw e;
  }
  return null;
}

/** Priority order: if company is in COMPANY_MAP, try that source first, then the rest (no duplicate). */
function getSourceOrder(token: string): JobBoardSource[] {
  const primary = COMPANY_MAP[token];
  if (!primary) return [...ALL_SOURCES];
  return [primary, ...ALL_SOURCES.filter((s) => s !== primary)];
}

/** Try one source; return result only if jobs.length > 0; on error or 0 jobs return null. */
async function trySource(
  token: string,
  source: JobBoardSource
): Promise<{ jobs: Job[]; source: JobBoardSource } | null> {
  try {
    const r = await tryFetchFromSource(token, source);
    return r && r.jobs.length > 0 ? r : null;
  } catch {
    return null;
  }
}

/**
 * Fetches company jobs. COMPANY_MAP is a priority hint (try that source first).
 * If primary fails or returns 0 jobs, we try all other sources. Returns first
 * result with jobs; if all fail or return 0 jobs, returns empty. Logs a warning
 * when primary failed but a fallback succeeded (so COMPANY_MAP can be updated).
 */
export async function fetchCompanyJobs(companyName: string): Promise<FetchCompanyJobsResult> {
  const token = toBoardToken(companyName);
  if (!token) return { jobs: [], source: null };

  const primarySource = COMPANY_MAP[token];
  const sourceOrder = getSourceOrder(token);
  const tokensToTry = [token, ...(FALLBACK_TOKENS[token] ?? [])];

  for (const t of tokensToTry) {
    for (const source of sourceOrder) {
      const result = await trySource(t, source);
      if (result) {
        const matchedAs = t !== token ? toDisplayName(t) : undefined;
        if (primarySource && source !== primarySource) {
          console.warn(
            `[Stratum:COMPANY_MAP] Primary source ${primarySource} failed or returned 0 jobs for "${companyName}" (token: ${token}). Fallback ${source} succeeded. Consider updating COMPANY_MAP.`
          );
        }
        return {
          jobs: result.jobs,
          source: result.source,
          resolvedToken: t,
          matchedAs,
        };
      }
    }
  }

  return { jobs: [], source: null };
}
