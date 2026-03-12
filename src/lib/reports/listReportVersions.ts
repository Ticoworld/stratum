import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, reportRuns, reportVersions } from "@/db/schema";

export async function listReportVersions(params: {
  tenantId: string;
  companyId?: string;
}) {
  const filters = [eq(reportRuns.tenantId, params.tenantId), eq(reportVersions.status, "published")];

  if (params.companyId) {
    filters.push(eq(reportRuns.companyId, params.companyId));
  }

  return db
    .select({
      reportVersionId: reportVersions.id,
      reportRunId: reportVersions.reportRunId,
      companyId: reportRuns.companyId,
      companyDisplayName: companies.displayName,
      companyCanonicalName: companies.canonicalName,
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
}
