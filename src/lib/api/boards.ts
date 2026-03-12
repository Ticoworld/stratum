import { fetchProviderSnapshot } from "@/lib/providers/ats/fetchProviderSnapshot";
import { getMatchedAs } from "@/lib/providers/ats/resolveCompany";
import type { AtsProvider } from "@/lib/providers/ats/types";

export interface Job {
  title: string;
  location: string;
  department: string;
  updated_at: string;
}
export type JobBoardSource = AtsProvider;

export interface FetchCompanyJobsResult {
  jobs: Job[];
  source: JobBoardSource | null;
  /** Token we actually queried (when we used alias or fallback). */
  resolvedToken?: string;
  /** Display name for "Matched as: X" when resolvedToken differs from user input. */
  matchedAs?: string;
}

function toLegacyJob(job: {
  title: string;
  location?: string | null;
  department?: string | null;
  updatedAt?: string | null;
}): Job {
  return {
    title: job.title,
    location: job.location?.trim() || "Remote",
    department: job.department?.trim() || "General",
    updated_at: job.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Fetches company jobs. COMPANY_MAP is a priority hint (try that source first).
 * If primary fails or returns 0 jobs, we try all other sources. Returns first
 * result with jobs; if all fail or return 0 jobs, returns empty. Logs a warning
 * when primary failed but a fallback succeeded (so COMPANY_MAP can be updated).
 */
export async function fetchCompanyJobs(companyName: string): Promise<FetchCompanyJobsResult> {
  const selection = await fetchProviderSnapshot(companyName);
  if (!selection) return { jobs: [], source: null };

  return {
    jobs: selection.snapshot.rawJobs.map(toLegacyJob),
    source: selection.snapshot.provider,
    resolvedToken: selection.snapshot.providerToken,
    matchedAs: getMatchedAs(companyName, selection.snapshot.providerToken),
  };
}
