import { fetchWithRetry } from "@/lib/api/fetchWithRetry";
import type { ProviderFetchResult, ProviderRawJob } from "@/lib/providers/ats/types";

const ASHBY_BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyJobRaw {
  id?: string;
  title?: string;
  location?: string;
  department?: string;
  employmentType?: string;
  workplaceType?: string;
  applyUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  address?: {
    city?: string;
    locality?: string;
    region?: string;
    country?: string;
  };
}

function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getLocation(job: AshbyJobRaw): string {
  return (
    (job.location ?? "").trim() ||
    [job.address?.city, job.address?.locality, job.address?.region, job.address?.country]
      .filter(Boolean)
      .join(", ") ||
    "Remote"
  );
}

function toRawJob(job: AshbyJobRaw, index: number): ProviderRawJob {
  return {
    providerJobId: job.id ?? null,
    providerRequisitionId: null,
    jobUrl: job.applyUrl ?? null,
    title: (job.title ?? "").trim() || "Unknown",
    department: (job.department ?? "").trim() || "General",
    location: getLocation(job),
    employmentType: job.employmentType?.trim() || null,
    workplaceType: job.workplaceType?.trim() || null,
    postedAt: toIsoDate(job.publishedAt),
    updatedAt: toIsoDate(job.updatedAt ?? job.publishedAt),
    rawRecordPath: `jobs[${index}]`,
  };
}

export async function fetchAshbySnapshot(providerToken: string): Promise<ProviderFetchResult> {
  const requestUrl = `${ASHBY_BASE}/${encodeURIComponent(providerToken)}`;
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetchWithRetry(requestUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          kind: "not_found",
          provider: "ASHBY",
          providerToken,
          requestUrl,
          httpStatus: 404,
          fetchedAt,
        };
      }

      return {
        kind: "error",
        provider: "ASHBY",
        providerToken,
        requestUrl,
        httpStatus: response.status,
        fetchedAt,
        errorCode: "ASHBY_HTTP_ERROR",
        errorMessage: `Ashby returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as { jobs?: AshbyJobRaw[] };
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

    return {
      kind: "success",
      provider: "ASHBY",
      providerToken,
      requestUrl,
      httpStatus: response.status,
      fetchedAt,
      payload,
      rawJobs: jobs.map((job, index) => toRawJob(job, index)),
    };
  } catch (error) {
    return {
      kind: "error",
      provider: "ASHBY",
      providerToken,
      requestUrl,
      httpStatus: null,
      fetchedAt,
      errorCode: "ASHBY_FETCH_ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown Ashby fetch error",
    };
  }
}
