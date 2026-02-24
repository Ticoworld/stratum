/**
 * Ashby Job Board API
 * GET https://api.ashbyhq.com/posting-api/job-board/{companyName}
 */

import type { Job } from "./boards";
import { fetchWithRetry } from "./fetchWithRetry";

const ASHBY_BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyJobRaw {
  title?: string;
  location?: string;
  department?: string;
  publishedAt?: string;
  address?: { city?: string; locality?: string; region?: string; country?: string };
}

function toIsoDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
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

  return jobs.map((j: AshbyJobRaw) => {
    const location =
      (j.location ?? "").trim() ||
      [j.address?.city, j.address?.locality, j.address?.region, j.address?.country]
        .filter(Boolean)
        .join(", ") ||
      "Remote";
    return {
      title: (j.title ?? "").trim() || "Unknown",
      location: location.trim() || "Remote",
      department: (j.department ?? "").trim() || "General",
      updated_at: toIsoDate(j.publishedAt),
    };
  });
}
