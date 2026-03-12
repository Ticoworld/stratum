import { fetchWithRetry } from "@/lib/api/fetchWithRetry";
import type { ProviderFetchResult, ProviderRawJob } from "@/lib/providers/ats/types";

const LEVER_BASE = "https://api.lever.co/v0/postings";

interface LeverJobRaw {
  id?: string;
  hostedUrl?: string;
  text?: string;
  categories?: {
    location?: string;
    department?: string;
    commitment?: string;
    team?: string;
  };
  workplaceType?: string;
  createdAt?: number;
  updatedAt?: number;
}

function toIsoDate(value: number | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toRawJob(job: LeverJobRaw, index: number): ProviderRawJob {
  return {
    providerJobId: job.id ?? null,
    providerRequisitionId: null,
    jobUrl: job.hostedUrl ?? null,
    title: (job.text ?? "").trim() || "Unknown",
    department:
      (job.categories?.department ?? job.categories?.team ?? "").trim() || "General",
    location: (job.categories?.location ?? "").trim() || "Remote",
    employmentType: job.categories?.commitment?.trim() || null,
    workplaceType: job.workplaceType?.trim() || null,
    postedAt: toIsoDate(job.createdAt),
    updatedAt: toIsoDate(job.updatedAt),
    rawRecordPath: `jobs[${index}]`,
  };
}

export async function fetchLeverSnapshot(providerToken: string): Promise<ProviderFetchResult> {
  const requestUrl = `${LEVER_BASE}/${providerToken}?mode=json`;
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetchWithRetry(requestUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          kind: "not_found",
          provider: "LEVER",
          providerToken,
          requestUrl,
          httpStatus: 404,
          fetchedAt,
        };
      }

      return {
        kind: "error",
        provider: "LEVER",
        providerToken,
        requestUrl,
        httpStatus: response.status,
        fetchedAt,
        errorCode: "LEVER_HTTP_ERROR",
        errorMessage: `Lever returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as unknown;
    const jobs = Array.isArray(payload) ? (payload as LeverJobRaw[]) : [];

    return {
      kind: "success",
      provider: "LEVER",
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
      provider: "LEVER",
      providerToken,
      requestUrl,
      httpStatus: null,
      fetchedAt,
      errorCode: "LEVER_FETCH_ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown Lever fetch error",
    };
  }
}
