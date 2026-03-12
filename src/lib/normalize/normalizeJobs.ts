import { randomUUID } from "crypto";
import { sha256Hex } from "@/lib/storage/checksums";
import type { ProviderRawJob } from "@/lib/providers/ats/types";

export interface NormalizedJobRecord {
  id: string;
  reportRunId: string;
  sourceSnapshotId: string;
  provider: string;
  providerJobId: string | null;
  providerRequisitionId: string | null;
  jobUrl: string | null;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  workplaceType: string | null;
  postedAt: Date | null;
  updatedAt: Date | null;
  rawRecordPath: string;
  normalizedSha256: string;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildNormalizedHash(provider: string, job: ProviderRawJob): string {
  return sha256Hex(
    JSON.stringify({
      provider,
      providerJobId: job.providerJobId ?? null,
      providerRequisitionId: job.providerRequisitionId ?? null,
      jobUrl: job.jobUrl ?? null,
      title: job.title,
      department: job.department ?? null,
      location: job.location ?? null,
      employmentType: job.employmentType ?? null,
      workplaceType: job.workplaceType ?? null,
      postedAt: job.postedAt ?? null,
      updatedAt: job.updatedAt ?? null,
      rawRecordPath: job.rawRecordPath,
    })
  );
}

export function normalizeJobs(params: {
  reportRunId: string;
  sourceSnapshotId: string;
  provider: string;
  rawJobs: ProviderRawJob[];
}): NormalizedJobRecord[] {
  const { reportRunId, sourceSnapshotId, provider, rawJobs } = params;

  return rawJobs.map((job) => ({
    id: randomUUID(),
    reportRunId,
    sourceSnapshotId,
    provider,
    providerJobId: job.providerJobId ?? null,
    providerRequisitionId: job.providerRequisitionId ?? null,
    jobUrl: job.jobUrl ?? null,
    title: job.title,
    department: job.department ?? null,
    location: job.location ?? null,
    employmentType: job.employmentType ?? null,
    workplaceType: job.workplaceType ?? null,
    postedAt: toDate(job.postedAt),
    updatedAt: toDate(job.updatedAt),
    rawRecordPath: job.rawRecordPath,
    normalizedSha256: buildNormalizedHash(provider, job),
  }));
}
