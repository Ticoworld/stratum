/**
 * Workable Job Board API
 * GET https://apply.workable.com/api/v1/widget/accounts/{companyName}
 */

import type { Job } from "./boards";
import { fetchWithRetry } from "./fetchWithRetry";

const WORKABLE_BASE = "https://apply.workable.com/api/v1/widget/accounts";

interface WorkableJobRaw {
  url?: string;
  shortcode?: string;
  title?: string;
  location?: string;
  city?: string;
  country?: string;
  state?: string;
  department?: string;
  created_at?: string;
  workplace_type?: string;
  locations?: Array<{
    location?: string;
    city?: string;
    country?: string;
    state?: string;
    workplace_type?: string;
  }>;
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
  const observedAt = new Date().toISOString();

  return jobs.map((j: WorkableJobRaw) => {
    const firstLocation = Array.isArray(j.locations) ? j.locations[0] : undefined;
    const sourceTimestamp = toIsoDate(j.created_at);
    const roleId = normalizeText(j.shortcode);
    const location =
      normalizeText(j.location) ||
      normalizeText(firstLocation?.location) ||
      [j.city, j.state, j.country]
        .map((part) => normalizeText(part))
        .filter((part): part is string => Boolean(part))
        .join(", ") ||
      [firstLocation?.city, firstLocation?.state, firstLocation?.country]
        .map((part) => normalizeText(part))
        .filter((part): part is string => Boolean(part))
        .join(", ") ||
      (
        normalizeText(j.workplace_type)?.toLowerCase() === "remote" ||
        normalizeText(firstLocation?.workplace_type)?.toLowerCase() === "remote"
          ? "Remote"
          : null
      );

    return {
      title: normalizeText(j.title) ?? "Unknown",
      location: typeof location === "string" ? location.trim() || null : null,
      department: normalizeText(j.department),
      source: "WORKABLE",
      roleId,
      roleIdType: roleId ? "shortcode" : null,
      requisitionId: null,
      jobUrl: normalizeText(j.url),
      applyUrl: normalizeText(j.url),
      sourceTimestamp,
      sourceTimestampType: sourceTimestamp ? "created_at" : null,
      observedAt,
    };
  });
}
