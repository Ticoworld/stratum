import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, reportRuns, reportVersions } from "@/db/schema";
import { type ReportJson, reportJsonSchema } from "@/lib/reports/reportJson";
import { getObjectJson } from "@/lib/storage/s3";

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
}

export async function getReportVersion(params: {
  reportVersionId: string;
  tenantId: string;
}): Promise<StoredReportVersion | null> {
  const [row] = await db
    .select({
      id: reportVersions.id,
      reportRunId: reportVersions.reportRunId,
      companyId: reportRuns.companyId,
      status: reportVersions.status,
      versionNumber: reportVersions.versionNumber,
      templateVersion: reportVersions.templateVersion,
      generatedAt: reportVersions.generatedAt,
      publishedAt: reportVersions.publishedAt,
      reportObjectKey: reportVersions.reportObjectKey,
    })
    .from(reportVersions)
    .innerJoin(reportRuns, eq(reportRuns.id, reportVersions.reportRunId))
    .innerJoin(companies, eq(companies.id, reportRuns.companyId))
    .where(
      and(
        eq(reportVersions.id, params.reportVersionId),
        eq(reportVersions.status, "published"),
        eq(reportRuns.tenantId, params.tenantId)
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const report = reportJsonSchema.parse(await getObjectJson<unknown>(row.reportObjectKey));

  return {
    id: row.id,
    reportRunId: row.reportRunId,
    companyId: row.companyId,
    status: row.status,
    versionNumber: row.versionNumber,
    templateVersion: row.templateVersion,
    generatedAt: row.generatedAt,
    publishedAt: row.publishedAt,
    report,
  };
}
