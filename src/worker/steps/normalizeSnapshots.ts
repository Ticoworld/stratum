import { normalizeJobs } from "@/lib/normalize/normalizeJobs";
import type { ProviderFetchSuccess } from "@/lib/providers/ats/types";

export function normalizeSnapshotJobs(params: {
  reportRunId: string;
  sourceSnapshotId: string;
  snapshot: ProviderFetchSuccess;
}) {
  return normalizeJobs({
    reportRunId: params.reportRunId,
    sourceSnapshotId: params.sourceSnapshotId,
    provider: params.snapshot.provider,
    rawJobs: params.snapshot.rawJobs,
  });
}
