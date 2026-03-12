import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, normalizedJobs, reportRuns, sourceSnapshots } from "@/db/schema";

export interface AnalysisInputJob {
  normalizedJobId: string;
  provider: string;
  providerJobId: string | null;
  title: string;
  department: string | null;
  location: string | null;
  postedAt: string | null;
  updatedAt: string | null;
  jobUrl: string | null;
  sourceSnapshotId: string;
}

export interface AnalysisInputSnapshot {
  sourceSnapshotId: string;
  provider: string;
  providerToken: string;
  fetchedAt: string | null;
  recordCount: number;
  payloadSha256: string | null;
}

export interface AnalysisInput {
  reportRunId: string;
  company: {
    companyId: string;
    displayName: string;
    canonicalName: string;
    websiteDomain: string | null;
  };
  asOfTime: string;
  providerSummary: AnalysisInputSnapshot[];
  jobCountsByDepartment: Array<{ department: string; count: number }>;
  jobCountsByLocation: Array<{ location: string; count: number }>;
  recencyBuckets: Array<{ bucket: string; count: number }>;
  normalizedJobs: AnalysisInputJob[];
}

export interface AnalysisInputContext {
  input: AnalysisInput;
  snapshotsById: Map<
    string,
    {
      sourceSnapshotId: string;
      provider: string;
      providerToken: string;
      fetchedAt: Date | null;
      payloadSha256: string | null;
    }
  >;
  jobsById: Map<
    string,
    {
      normalizedJobId: string;
      sourceSnapshotId: string;
      provider: string;
      providerJobId: string | null;
      jobUrl: string | null;
      title: string;
      department: string | null;
      location: string | null;
      postedAt: Date | null;
      updatedAt: Date | null;
      rawRecordPath: string;
      normalizedSha256: string;
    }
  >;
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function buildRecencyBucket(asOfTime: Date, jobDate: Date | null): string {
  if (!jobDate) {
    return "unknown";
  }

  const diffMs = asOfTime.getTime() - jobDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 30) {
    return "0_30_days";
  }

  if (diffDays <= 90) {
    return "31_90_days";
  }

  return "91_plus_days";
}

export async function buildAnalysisInput(reportRunId: string): Promise<AnalysisInputContext> {
  const [run] = await db
    .select({
      reportRunId: reportRuns.id,
      asOfTime: reportRuns.asOfTime,
      companyId: companies.id,
      displayName: companies.displayName,
      canonicalName: companies.canonicalName,
      websiteDomain: companies.websiteDomain,
    })
    .from(reportRuns)
    .innerJoin(companies, eq(companies.id, reportRuns.companyId))
    .where(eq(reportRuns.id, reportRunId))
    .limit(1);

  if (!run) {
    throw new Error(`Report run ${reportRunId} was not found for analysis input.`);
  }

  const snapshots = await db
    .select({
      sourceSnapshotId: sourceSnapshots.id,
      provider: sourceSnapshots.provider,
      providerToken: sourceSnapshots.providerToken,
      fetchedAt: sourceSnapshots.fetchedAt,
      recordCount: sourceSnapshots.recordCount,
      payloadSha256: sourceSnapshots.payloadSha256,
    })
    .from(sourceSnapshots)
    .where(
      and(eq(sourceSnapshots.reportRunId, reportRunId), eq(sourceSnapshots.status, "captured"))
    )
    .orderBy(asc(sourceSnapshots.createdAt));

  const jobs = await db
    .select({
      normalizedJobId: normalizedJobs.id,
      sourceSnapshotId: normalizedJobs.sourceSnapshotId,
      provider: normalizedJobs.provider,
      providerJobId: normalizedJobs.providerJobId,
      jobUrl: normalizedJobs.jobUrl,
      title: normalizedJobs.title,
      department: normalizedJobs.department,
      location: normalizedJobs.location,
      postedAt: normalizedJobs.postedAt,
      updatedAt: normalizedJobs.updatedAt,
      rawRecordPath: normalizedJobs.rawRecordPath,
      normalizedSha256: normalizedJobs.normalizedSha256,
    })
    .from(normalizedJobs)
    .where(eq(normalizedJobs.reportRunId, reportRunId))
    .orderBy(asc(normalizedJobs.createdAt));

  const departmentCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const recencyCounts = new Map<string, number>();

  for (const job of jobs) {
    incrementCount(departmentCounts, job.department?.trim() || "Unknown");
    incrementCount(locationCounts, job.location?.trim() || "Unknown");
    incrementCount(
      recencyCounts,
      buildRecencyBucket(run.asOfTime, job.updatedAt ?? job.postedAt ?? null)
    );
  }

  const snapshotsById = new Map(
    snapshots.map((snapshot) => [
      snapshot.sourceSnapshotId,
      {
        sourceSnapshotId: snapshot.sourceSnapshotId,
        provider: snapshot.provider,
        providerToken: snapshot.providerToken,
        fetchedAt: snapshot.fetchedAt,
        payloadSha256: snapshot.payloadSha256,
      },
    ])
  );

  const jobsById = new Map(
    jobs.map((job) => [
      job.normalizedJobId,
      {
        ...job,
      },
    ])
  );

  return {
    input: {
      reportRunId: run.reportRunId,
      company: {
        companyId: run.companyId,
        displayName: run.displayName,
        canonicalName: run.canonicalName,
        websiteDomain: run.websiteDomain,
      },
      asOfTime: run.asOfTime.toISOString(),
      providerSummary: snapshots.map((snapshot) => ({
        sourceSnapshotId: snapshot.sourceSnapshotId,
        provider: snapshot.provider,
        providerToken: snapshot.providerToken,
        fetchedAt: toIsoString(snapshot.fetchedAt),
        recordCount: snapshot.recordCount,
        payloadSha256: snapshot.payloadSha256,
      })),
      jobCountsByDepartment: Array.from(departmentCounts.entries()).map(([department, count]) => ({
        department,
        count,
      })),
      jobCountsByLocation: Array.from(locationCounts.entries()).map(([location, count]) => ({
        location,
        count,
      })),
      recencyBuckets: Array.from(recencyCounts.entries()).map(([bucket, count]) => ({
        bucket,
        count,
      })),
      normalizedJobs: jobs.map((job) => ({
        normalizedJobId: job.normalizedJobId,
        provider: job.provider,
        providerJobId: job.providerJobId,
        title: job.title,
        department: job.department,
        location: job.location,
        postedAt: toIsoString(job.postedAt),
        updatedAt: toIsoString(job.updatedAt),
        jobUrl: job.jobUrl,
        sourceSnapshotId: job.sourceSnapshotId,
      })),
    },
    snapshotsById,
    jobsById,
  };
}
