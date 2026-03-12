import { fetchWithRetry } from "@/lib/api/fetchWithRetry";
import type { ProviderFetchResult, ProviderRawJob } from "@/lib/providers/ats/types";

const GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseJobRaw {
  id?: number | string;
  internal_job_id?: number | string;
  absolute_url?: string;
  title?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  metadata?: Array<{ name?: string; value?: string }>;
  updated_at?: string;
  first_published?: string;
}

function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function deriveWorkplaceType(job: GreenhouseJobRaw): string | null {
  const metadataValue = job.metadata?.find((item) =>
    (item.name ?? "").toLowerCase().includes("workplace")
  )?.value;

  return metadataValue?.trim() || null;
}

function toRawJob(job: GreenhouseJobRaw, index: number): ProviderRawJob {
  return {
    providerJobId: job.id != null ? String(job.id) : null,
    providerRequisitionId:
      job.internal_job_id != null ? String(job.internal_job_id) : null,
    jobUrl: job.absolute_url ?? null,
    title: (job.title ?? "").trim() || "Unknown",
    department:
      (job.departments?.[0]?.name ?? job.offices?.[0]?.name ?? "").trim() || "General",
    location: (job.location?.name ?? "").trim() || "Remote",
    workplaceType: deriveWorkplaceType(job),
    postedAt: toIsoDate(job.first_published),
    updatedAt: toIsoDate(job.updated_at),
    rawRecordPath: `jobs[${index}]`,
  };
}

export async function fetchGreenhouseSnapshot(
  providerToken: string
): Promise<ProviderFetchResult> {
  const requestUrl = `${GREENHOUSE_BASE}/${providerToken}/jobs?content=true`;
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetchWithRetry(requestUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          kind: "not_found",
          provider: "GREENHOUSE",
          providerToken,
          requestUrl,
          httpStatus: 404,
          fetchedAt,
        };
      }

      return {
        kind: "error",
        provider: "GREENHOUSE",
        providerToken,
        requestUrl,
        httpStatus: response.status,
        fetchedAt,
        errorCode: "GREENHOUSE_HTTP_ERROR",
        errorMessage: `Greenhouse returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as { jobs?: GreenhouseJobRaw[] };
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

    return {
      kind: "success",
      provider: "GREENHOUSE",
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
      provider: "GREENHOUSE",
      providerToken,
      requestUrl,
      httpStatus: null,
      fetchedAt,
      errorCode: "GREENHOUSE_FETCH_ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown Greenhouse fetch error",
    };
  }
}
