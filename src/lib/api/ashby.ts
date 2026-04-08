/**
 * Ashby Job Board API
 * GET https://api.ashbyhq.com/posting-api/job-board/{companyName}
 */

import type { Job } from "./boards";
import { fetchWithRetry } from "./fetchWithRetry";

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

export async function fetchFromAshby(companyToken: string): Promise<Job[]> {
  const url = `${ASHBY_BASE}/${encodeURIComponent(companyToken)}`;
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("NOT_FOUND");
    throw new Error(`Ashby: ${res.status}`);
  }

  const data = await res.json();
  const jobs: AshbyJobRaw[] = Array.isArray(data.jobs) ? data.jobs : [];
  const observedAt = new Date().toISOString();

  return jobs.map((j: AshbyJobRaw) => {
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
  });
}
