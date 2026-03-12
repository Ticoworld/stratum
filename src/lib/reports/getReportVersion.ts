import {
  type StoredArtifactRecord,
  loadPublishedReportVersion,
} from "@/lib/reports/loadPublishedReportVersion";
import { type ReportJson } from "@/lib/reports/reportJson";

export interface StoredReportVersion {
  id: string;
  reportRunId: string;
  companyId: string;
  status: string;
  versionNumber: number;
  templateVersion: string;
  generatedAt: Date;
  publishedAt: Date | null;
  report: ReportJson;
  artifacts: StoredArtifactRecord[];
}

export async function getReportVersion(params: {
  reportVersionId: string;
  tenantId: string;
}): Promise<StoredReportVersion | null> {
  const reportVersion = await loadPublishedReportVersion({
    reportVersionId: params.reportVersionId,
    tenantId: params.tenantId,
  });

  if (!reportVersion) {
    return null;
  }

  return {
    id: reportVersion.id,
    reportRunId: reportVersion.reportRunId,
    companyId: reportVersion.companyId,
    status: reportVersion.status,
    versionNumber: reportVersion.versionNumber,
    templateVersion: reportVersion.templateVersion,
    generatedAt: reportVersion.generatedAt,
    publishedAt: reportVersion.publishedAt,
    report: reportVersion.report,
    artifacts: reportVersion.artifacts,
  };
}
