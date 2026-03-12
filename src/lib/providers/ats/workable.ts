import { fetchWithRetry } from "@/lib/api/fetchWithRetry";
import type { ProviderFetchResult, ProviderRawJob } from "@/lib/providers/ats/types";

const WORKABLE_BASE = "https://apply.workable.com/api/v1/widget/accounts";

interface WorkableJobRaw {
  shortcode?: string;
  title?: string;
  url?: string;
  city?: string;
  country?: string;
  department?: string;
  employment_type?: string;
  created_at?: string;
}

function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toRawJob(job: WorkableJobRaw, index: number): ProviderRawJob {
  const location = [job.city?.trim(), job.country?.trim()].filter(Boolean).join(", ");

  return {
    providerJobId: job.shortcode ?? null,
    providerRequisitionId: null,
    jobUrl: job.url ?? null,
    title: (job.title ?? "").trim() || "Unknown",
    department: (job.department ?? "").trim() || "General",
    location: location || "Remote",
    employmentType: job.employment_type?.trim() || null,
    workplaceType: null,
    postedAt: toIsoDate(job.created_at),
    updatedAt: toIsoDate(job.created_at),
    rawRecordPath: `jobs[${index}]`,
  };
}

export async function fetchWorkableSnapshot(
  providerToken: string
): Promise<ProviderFetchResult> {
  const requestUrl = `${WORKABLE_BASE}/${encodeURIComponent(providerToken)}`;
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetchWithRetry(requestUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          kind: "not_found",
          provider: "WORKABLE",
          providerToken,
          requestUrl,
          httpStatus: 404,
          fetchedAt,
        };
      }

      return {
        kind: "error",
        provider: "WORKABLE",
        providerToken,
        requestUrl,
        httpStatus: response.status,
        fetchedAt,
        errorCode: "WORKABLE_HTTP_ERROR",
        errorMessage: `Workable returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as { jobs?: WorkableJobRaw[] };
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

    return {
      kind: "success",
      provider: "WORKABLE",
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
      provider: "WORKABLE",
      providerToken,
      requestUrl,
      httpStatus: null,
      fetchedAt,
      errorCode: "WORKABLE_FETCH_ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown Workable fetch error",
    };
  }
}
