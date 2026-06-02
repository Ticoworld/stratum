/**
 * Ashby Job Board API
 * GET https://api.ashbyhq.com/posting-api/job-board/{companyName}
 */

import type { Job } from "./boards";
import type { FetchWithRetryTelemetry } from "./fetchWithRetry";
import {
  attachProviderTelemetry,
  createProviderHttpError,
  createProviderUnexpectedShapeError,
} from "./providerErrors";
import { fetchProviderWithHttpRetry } from "./providerHttpRetry";

const ASHBY_BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyJobRaw {
  id?: string;
  title?: string;
  location?: string;
  department?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  isRemote?: boolean;
  workplaceType?: string;
  address?: { city?: string; locality?: string; region?: string; country?: string };
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

interface ProviderFetchResult {
  jobs: Job[];
  retryTelemetry: FetchWithRetryTelemetry;
}

export async function fetchFromAshby(companyToken: string): Promise<ProviderFetchResult> {
  const url = `${ASHBY_BASE}/${encodeURIComponent(companyToken)}`;
  const fetchResult = await fetchProviderWithHttpRetry(url, {
    headers: { Accept: "application/json" },
  });
  const { response: res, ...retryTelemetry } = fetchResult;

  try {
    if (!res.ok) {
      throw createProviderHttpError("Ashby", res.status);
    }

    const data = await res.json();
    if (!data || typeof data !== "object" || !Array.isArray((data as { jobs?: unknown }).jobs)) {
      throw createProviderUnexpectedShapeError("Ashby", res.status);
    }

    const jobs: AshbyJobRaw[] = (data as { jobs: AshbyJobRaw[] }).jobs;
    const observedAt = new Date().toISOString();

    return {
      jobs: jobs.map((j: AshbyJobRaw) => {
        const sourceTimestamp = toIsoDate(j.publishedAt);
        const roleId = normalizeText(j.id);
        const location =
          normalizeText(j.location) ||
          [j.address?.city, j.address?.locality, j.address?.region, j.address?.country]
            .map((part) => normalizeText(part))
            .filter((part): part is string => Boolean(part))
            .join(", ") ||
          (j.isRemote || normalizeText(j.workplaceType)?.toLowerCase() === "remote" ? "Remote" : null);

        return {
          title: normalizeText(j.title) ?? "Unknown",
          location: typeof location === "string" ? location.trim() || null : null,
          department: normalizeText(j.department),
          source: "ASHBY",
          roleId,
          roleIdType: roleId ? "job_id" : null,
          requisitionId: null,
          jobUrl: normalizeText(j.jobUrl),
          applyUrl: normalizeText(j.applyUrl),
          sourceTimestamp,
          sourceTimestampType: sourceTimestamp ? "published_at" : null,
          observedAt,
        };
      }),
      retryTelemetry: retryTelemetry as FetchWithRetryTelemetry,
    };
  } catch (error) {
    throw attachProviderTelemetry(
      error instanceof Error ? error : new Error(String(error)),
      retryTelemetry as FetchWithRetryTelemetry
    );
  }
}
