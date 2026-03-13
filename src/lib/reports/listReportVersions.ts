import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { artifacts, companies, reportRuns, reportVersions } from "@/db/schema";
import { getReportArtifactStatus } from "@/lib/artifacts/status";

export async function listReportVersions(params: {
  tenantId: string;
  companyId?: string;
}) {
  const filters = [eq(reportRuns.tenantId, params.tenantId), eq(reportVersions.status, "published")];

  if (params.companyId) {
    filters.push(eq(reportRuns.companyId, params.companyId));
  }

  const rows = await db
    .select({
      reportVersionId: reportVersions.id,
      companyDisplayName: companies.displayName,
      runStatus: reportRuns.status,
      status: reportVersions.status,
      versionNumber: reportVersions.versionNumber,
      templateVersion: reportVersions.templateVersion,
      generatedAt: reportVersions.generatedAt,
      publishedAt: reportVersions.publishedAt,
    })
    .from(reportVersions)
    .innerJoin(reportRuns, eq(reportRuns.id, reportVersions.reportRunId))
    .innerJoin(companies, eq(companies.id, reportRuns.companyId))
    .where(and(...filters))
    .orderBy(desc(reportVersions.publishedAt), desc(reportVersions.generatedAt));

  if (rows.length === 0) {
    return rows;
  }

  const artifactRows = await db
    .select({
      reportVersionId: artifacts.reportVersionId,
      artifactType: artifacts.artifactType,
      status: artifacts.status,
    })
    .from(artifacts)
    .where(inArray(artifacts.reportVersionId, rows.map((row) => row.reportVersionId)));

  return rows.map((row) => {
    const reportArtifacts = artifactRows.filter(
      (artifact) => artifact.reportVersionId === row.reportVersionId
    );

    return {
      ...row,
      dataMode:
        row.runStatus === "completed_zero_data"
          ? "zero-data"
          : row.runStatus === "completed_partial"
            ? "partial-data"
            : "completed",
      artifactStatus: {
        html: getReportArtifactStatus(reportArtifacts, "html"),
        pdf: getReportArtifactStatus(reportArtifacts, "pdf"),
      },
      artifactAvailability: {
        html: reportArtifacts.some(
          (artifact) => artifact.artifactType === "html" && artifact.status === "available"
        ),
        pdf: reportArtifacts.some(
          (artifact) => artifact.artifactType === "pdf" && artifact.status === "available"
        ),
      },
    };
  });
}
