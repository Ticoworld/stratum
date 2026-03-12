import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { artifacts, companies, reportRuns, reportVersions } from "@/db/schema";
import { type ReportJson, reportJsonSchema } from "@/lib/reports/reportJson";
import { getObjectJson } from "@/lib/storage/s3";

export type StoredArtifactRecord = {
  id: string;
  artifactType: string;
  status: string;
  objectKey: string | null;
  mimeType: string | null;
  byteSize: number | null;
  sha256: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export interface LoadedPublishedReportVersion {
  id: string;
  reportRunId: string;
  tenantId: string;
  companyId: string;
  status: string;
  versionNumber: number;
  templateVersion: string;
  generatedAt: Date;
  publishedAt: Date | null;
  reportObjectKey: string;
  report: ReportJson;
  artifacts: StoredArtifactRecord[];
}

export async function loadPublishedReportVersion(params: {
  reportVersionId: string;
  tenantId?: string;
}): Promise<LoadedPublishedReportVersion | null> {
  const filters = [
    eq(reportVersions.id, params.reportVersionId),
    eq(reportVersions.status, "published"),
  ];

  if (params.tenantId) {
    filters.push(eq(reportRuns.tenantId, params.tenantId));
  }

  const [row] = await db
    .select({
      id: reportVersions.id,
      reportRunId: reportVersions.reportRunId,
      tenantId: reportRuns.tenantId,
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
    .where(and(...filters))
    .limit(1);

  if (!row) {
    return null;
  }

  const report = reportJsonSchema.parse(await getObjectJson<unknown>(row.reportObjectKey));
  const artifactRows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.reportVersionId, row.id));

  return {
    ...row,
    report,
    artifacts: artifactRows,
  };
}
