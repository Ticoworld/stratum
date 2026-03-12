import { claimReportRunById } from "@/lib/reports/claimNextReportRun";
import { createReportRun } from "@/lib/reports/createReportRun";
import { executeReportRun } from "@/lib/reports/executeReportRun";

interface CaptureCompanySnapshotParams {
  tenantId: string;
  requestedByUserId?: string;
  companyName: string;
}

export interface CaptureCompanySnapshotResult {
  companyId: string;
  reportRunId: string;
  sourceSnapshotId: string | null;
  status: string;
  normalizedJobCount: number;
}

export async function captureCompanySnapshot(
  params: CaptureCompanySnapshotParams
): Promise<CaptureCompanySnapshotResult> {
  const created = await createReportRun({
    tenantId: params.tenantId,
    requestedByUserId: params.requestedByUserId,
    companyName: params.companyName,
    triggerType: "phase2_capture",
  });

  const claimedRun = await claimReportRunById(created.reportRunId);

  if (!claimedRun || claimedRun.id !== created.reportRunId) {
    throw new Error(`Failed to claim newly created report run ${created.reportRunId}.`);
  }

  const executed = await executeReportRun(claimedRun);

  return {
    companyId: created.companyId,
    reportRunId: created.reportRunId,
    sourceSnapshotId: executed.sourceSnapshotId,
    status: executed.status,
    normalizedJobCount: executed.normalizedJobCount,
  };
}
