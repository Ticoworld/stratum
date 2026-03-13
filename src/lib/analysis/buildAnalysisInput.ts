import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, normalizedJobs, reportRuns, sourceSnapshots } from "@/db/schema";
import { assessDataset, type AnalysisDatasetAssessment } from "@/lib/analysis/datasetAssessment";

export interface AnalysisInputJob {
  evidenceRef: string;
  provider: string;
  providerJobId: string | null;
  title: string;
  department: string | null;
  location: string | null;
  postedAt: string | null;
  updatedAt: string | null;
  jobUrl: string | null;
  snapshotRef: string;
}

export interface AnalysisInputSnapshot {
  snapshotRef: string;
  provider: string;
  fetchedAt: string | null;
  recordCount: number;
}

export interface AnalysisEvidenceBucket {
  key: string;
  count: number;
  sampleEvidenceRefs: string[];
}

export interface AnalysisEvidenceSummary {
  totalNormalizedJobs: number;
  providerCoverage: {
    capturedProviders: string[];
    providerCount: number;
  };
  departmentSummary: AnalysisEvidenceBucket[];
  geographySummary: AnalysisEvidenceBucket[];
  senioritySummary: AnalysisEvidenceBucket[];
  postingAgeSummary: AnalysisEvidenceBucket[];
  repeatedTitleKeywords: AnalysisEvidenceBucket[];
  sampleRoles: AnalysisInputJob[];
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
  datasetAssessment: AnalysisDatasetAssessment;
  evidenceSummary: AnalysisEvidenceSummary;
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
  jobsByEvidenceRef: Map<
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

function takeTopBuckets(map: Map<string, number>, sampleRefsByKey: Map<string, string[]>, limit = 5) {
  return Array.from(map.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([key, count]) => ({
      key,
      count,
      sampleEvidenceRefs: (sampleRefsByKey.get(key) ?? []).slice(0, 3),
    }));
}

function addSampleRef(sampleRefsByKey: Map<string, string[]>, key: string, evidenceRef: string) {
  const existing = sampleRefsByKey.get(key) ?? [];

  if (!existing.includes(evidenceRef)) {
    existing.push(evidenceRef);
  }

  sampleRefsByKey.set(key, existing);
}

function deriveGeographyBucket(location: string | null) {
  if (!location) {
    return "Unknown";
  }

  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts.at(-1) ?? location;
  }

  return parts[0] ?? location;
}

function deriveSeniorityBucket(title: string) {
  const normalized = title.toLowerCase();

  if (/\b(intern|internship|apprentice|junior|associate)\b/.test(normalized)) {
    return "entry_or_associate";
  }

  if (/\b(manager|lead|head)\b/.test(normalized)) {
    return "manager_or_lead";
  }

  if (/\b(director|vp|vice president|chief)\b/.test(normalized)) {
    return "director_or_executive";
  }

  if (/\b(principal|staff|senior|sr)\b/.test(normalized)) {
    return "senior_ic";
  }

  return "mid_ic_or_unspecified";
}

const TITLE_KEYWORD_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "apac",
  "associate",
  "dach",
  "emea",
  "for",
  "ii",
  "iii",
  "in",
  "intern",
  "lead",
  "manager",
  "new",
  "of",
  "or",
  "principal",
  "senior",
  "sr",
  "staff",
  "the",
  "to",
]);

function extractRepeatedTitleKeywords(
  jobs: Array<{ title: string; evidenceRef: string }>
): AnalysisEvidenceBucket[] {
  const counts = new Map<string, number>();
  const sampleRefsByKey = new Map<string, string[]>();

  for (const job of jobs) {
    const tokens = Array.from(
      new Set(
        job.title
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .map((token) => token.trim())
          .filter(
            (token) =>
              token.length >= 3 &&
              !TITLE_KEYWORD_STOP_WORDS.has(token) &&
              !/^\d+$/.test(token)
          )
      )
    );

    for (const token of tokens) {
      incrementCount(counts, token);
      addSampleRef(sampleRefsByKey, token, job.evidenceRef);
    }
  }

  return takeTopBuckets(
    new Map(Array.from(counts.entries()).filter(([, count]) => count >= 2)),
    sampleRefsByKey,
    8
  );
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
  const geographyCounts = new Map<string, number>();
  const seniorityCounts = new Map<string, number>();
  const departmentSampleRefs = new Map<string, string[]>();
  const geographySampleRefs = new Map<string, string[]>();
  const senioritySampleRefs = new Map<string, string[]>();
  const postingAgeSampleRefs = new Map<string, string[]>();

  const evidenceRefByJobId = new Map(
    jobs.map((job, index) => [job.normalizedJobId, `job-${String(index + 1).padStart(3, "0")}`])
  );

  for (const job of jobs) {
    const evidenceRef = evidenceRefByJobId.get(job.normalizedJobId) ?? job.normalizedJobId;
    const department = job.department?.trim() || "Unknown";
    const location = job.location?.trim() || "Unknown";
    const recencyBucket = buildRecencyBucket(run.asOfTime, job.updatedAt ?? job.postedAt ?? null);
    const geographyBucket = deriveGeographyBucket(job.location);
    const seniorityBucket = deriveSeniorityBucket(job.title);

    incrementCount(departmentCounts, department);
    incrementCount(locationCounts, location);
    incrementCount(recencyCounts, recencyBucket);
    incrementCount(geographyCounts, geographyBucket);
    incrementCount(seniorityCounts, seniorityBucket);
    addSampleRef(departmentSampleRefs, department, evidenceRef);
    addSampleRef(geographySampleRefs, geographyBucket, evidenceRef);
    addSampleRef(senioritySampleRefs, seniorityBucket, evidenceRef);
    addSampleRef(postingAgeSampleRefs, recencyBucket, evidenceRef);
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
  const snapshotRefById = new Map(
    snapshots.map((snapshot, index) => [snapshot.sourceSnapshotId, `snapshot-${String(index + 1).padStart(2, "0")}`])
  );

  const jobsById = new Map(
    jobs.map((job) => [
      job.normalizedJobId,
      {
        ...job,
      },
    ])
  );
  const jobsByEvidenceRef = new Map(
    jobs.map((job, index) => [`job-${String(index + 1).padStart(3, "0")}`, { ...job }])
  );
  const latestSnapshotFetchedAt = snapshots
    .map((snapshot) => snapshot.fetchedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const datasetAssessment = assessDataset({
    asOfTime: run.asOfTime,
    totalJobs: jobs.length,
    recencyBuckets: Array.from(recencyCounts.entries()).map(([bucket, count]) => ({ bucket, count })),
    latestSnapshotFetchedAt,
  });
  const normalizedJobInputs: AnalysisInputJob[] = jobs.map((job) => ({
    evidenceRef: evidenceRefByJobId.get(job.normalizedJobId) ?? job.normalizedJobId,
    provider: job.provider,
    providerJobId: job.providerJobId,
    title: job.title,
    department: job.department,
    location: job.location,
    postedAt: toIsoString(job.postedAt),
    updatedAt: toIsoString(job.updatedAt),
    jobUrl: job.jobUrl,
    snapshotRef: snapshotRefById.get(job.sourceSnapshotId) ?? job.sourceSnapshotId,
  }));
  const evidenceSummary: AnalysisEvidenceSummary = {
    totalNormalizedJobs: jobs.length,
    providerCoverage: {
      capturedProviders: snapshots.map((snapshot) => snapshot.provider),
      providerCount: snapshots.length,
    },
    departmentSummary: takeTopBuckets(departmentCounts, departmentSampleRefs),
    geographySummary: takeTopBuckets(geographyCounts, geographySampleRefs),
    senioritySummary: takeTopBuckets(seniorityCounts, senioritySampleRefs),
    postingAgeSummary: takeTopBuckets(recencyCounts, postingAgeSampleRefs),
    repeatedTitleKeywords: extractRepeatedTitleKeywords(
      jobs.map((job) => ({
        title: job.title,
        evidenceRef: evidenceRefByJobId.get(job.normalizedJobId) ?? job.normalizedJobId,
      }))
    ),
    sampleRoles: normalizedJobInputs.slice(0, 12),
  };

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
        snapshotRef: snapshotRefById.get(snapshot.sourceSnapshotId) ?? snapshot.sourceSnapshotId,
        provider: snapshot.provider,
        fetchedAt: toIsoString(snapshot.fetchedAt),
        recordCount: snapshot.recordCount,
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
      datasetAssessment,
      evidenceSummary,
      normalizedJobs: normalizedJobInputs,
    },
    snapshotsById,
    jobsById,
    jobsByEvidenceRef,
  };
}
