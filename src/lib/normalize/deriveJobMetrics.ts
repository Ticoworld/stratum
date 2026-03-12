import type { NormalizedJobRecord } from "@/lib/normalize/normalizeJobs";

export interface DerivedJobMetrics {
  totalJobs: number;
  byDepartment: Record<string, number>;
  byLocation: Record<string, number>;
  withProviderIds: number;
}

export function deriveJobMetrics(jobs: NormalizedJobRecord[]): DerivedJobMetrics {
  const byDepartment: Record<string, number> = {};
  const byLocation: Record<string, number> = {};

  for (const job of jobs) {
    const department = job.department?.trim() || "General";
    const location = job.location?.trim() || "Unknown";

    byDepartment[department] = (byDepartment[department] ?? 0) + 1;
    byLocation[location] = (byLocation[location] ?? 0) + 1;
  }

  return {
    totalJobs: jobs.length,
    byDepartment,
    byLocation,
    withProviderIds: jobs.filter((job) => job.providerJobId).length,
  };
}
