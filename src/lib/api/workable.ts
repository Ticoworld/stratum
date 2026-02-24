/**
 * Workable Job Board API
 * GET https://apply.workable.com/api/v1/widget/accounts/{companyName}
 */

import type { Job } from "./boards";
import { fetchWithRetry } from "./fetchWithRetry";

const WORKABLE_BASE = "https://apply.workable.com/api/v1/widget/accounts";

interface WorkableJobRaw {
  title?: string;
  city?: string;
  country?: string;
  department?: string;
  created_at?: string;
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

export async function fetchFromWorkable(companyToken: string): Promise<Job[]> {
  const url = `${WORKABLE_BASE}/${encodeURIComponent(companyToken)}`;
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("NOT_FOUND");
    throw new Error(`Workable: ${res.status}`);
  }

  const data = await res.json();
  const jobs: WorkableJobRaw[] = Array.isArray(data.jobs) ? data.jobs : [];

  return jobs.map((j: WorkableJobRaw) => {
    const city = (j.city ?? "").trim();
    const country = (j.country ?? "").trim();
    const location = [city, country].filter(Boolean).join(", ") || "Remote";
    return {
      title: (j.title ?? "").trim() || "Unknown",
      location,
      department: (j.department ?? "").trim() || "General",
      updated_at: toIsoDate(j.created_at),
    };
  });
}
