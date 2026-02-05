/**
 * Job Board API - Greenhouse & Lever
 * Fetches open jobs from company job boards for corporate strategy analysis
 * Includes robust retry logic for network resilience
 */

export interface Job {
  title: string;
  location: string;
  department: string;
  updated_at: string;
}

const GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards";
const LEVER_BASE = "https://api.lever.co/v0/postings";
const FETCH_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;

/**
 * Checks if an error is retryable (network blip, timeout, etc.)
 */
function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = (err.message || "").toLowerCase();
    return (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("failed") ||
      msg.includes("load")
    );
  }
  if (err instanceof Error) {
    const msg = (err.message || "").toLowerCase();
    const code = (err as NodeJS.ErrnoException).code || "";
    return (
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      msg.includes("aborted") ||
      msg.includes("timeout")
    );
  }
  return false;
}

/**
 * Wraps fetch with retry logic. Retries on ENOTFOUND/Timeout/network failures.
 * Waits 1s between attempts. Max 3 attempts. Throws after final failure.
 */
async function fetchWithRetry(
  url: string,
  init?: Omit<RequestInit, "signal">
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      lastError = e;
      if (isRetryableError(e) && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw lastError;
      }
    }
  }
  throw lastError;
}

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
 * When primary token 404s, try these alternates.
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

export type JobBoardSource = "GREENHOUSE" | "LEVER";

export interface FetchCompanyJobsResult {
  jobs: Job[];
  source: JobBoardSource | null;
  /** Token we actually queried (when we used alias or fallback). */
  resolvedToken?: string;
  /** Display name for "Matched as: X" when resolvedToken differs from user input. */
  matchedAs?: string;
}

async function tryFetchJobs(token: string): Promise<{ jobs: Job[]; source: JobBoardSource } | null> {
  try {
    const jobs = await fetchFromGreenhouse(token);
    return { jobs, source: "GREENHOUSE" };
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      try {
        const jobs = await fetchFromLever(token);
        return { jobs, source: "LEVER" };
      } catch {
        return null;
      }
    }
    throw e;
  }
}

/**
 * Fetches company jobs from Greenhouse, falls back to Lever on 404.
 * Tries fallback tokens when primary 404s (e.g. facebook → meta).
 * Returns jobs, source, and matchedAs when resolved via alias/fallback.
 */
export async function fetchCompanyJobs(companyName: string): Promise<FetchCompanyJobsResult> {
  const token = toBoardToken(companyName);
  if (!token) return { jobs: [], source: null };

  const tokensToTry = [token, ...(FALLBACK_TOKENS[token] ?? [])];

  for (const t of tokensToTry) {
    const result = await tryFetchJobs(t);
    if (result) {
      const matchedAs =
        t !== token && result.jobs.length > 0
          ? toDisplayName(t)
          : undefined;
      return {
        jobs: result.jobs,
        source: result.source,
        resolvedToken: t,
        matchedAs,
      };
    }
  }

  return { jobs: [], source: null };
}
