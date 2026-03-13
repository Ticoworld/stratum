import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  artifacts,
  companies,
  normalizedJobs,
  reportRuns,
  reportVersions,
  sourceSnapshots,
} from "@/db/schema";
import { getReportArtifactStatus } from "@/lib/artifacts/status";

export async function getReportRun(params: { reportRunId: string; tenantId: string }) {
  const [run] = await db
    .select({
      id: reportRuns.id,
      tenantId: reportRuns.tenantId,
      companyId: reportRuns.companyId,
      requestedByUserId: reportRuns.requestedByUserId,
      triggerType: reportRuns.triggerType,
      requestedCompanyName: reportRuns.requestedCompanyName,
      asOfTime: reportRuns.asOfTime,
      status: reportRuns.status,
      attemptCount: reportRuns.attemptCount,
      startedAt: reportRuns.startedAt,
      completedAt: reportRuns.completedAt,
      failureCode: reportRuns.failureCode,
      failureMessage: reportRuns.failureMessage,
      createdAt: reportRuns.createdAt,
      companyDisplayName: companies.displayName,
      companyResolutionStatus: companies.resolutionStatus,
    })
    .from(reportRuns)
    .innerJoin(companies, eq(companies.id, reportRuns.companyId))
    .where(and(eq(reportRuns.id, params.reportRunId), eq(reportRuns.tenantId, params.tenantId)))
    .limit(1);

  if (!run) {
    return null;
  }

  const snapshots = await db
    .select({
      provider: sourceSnapshots.provider,
      status: sourceSnapshots.status,
      httpStatus: sourceSnapshots.httpStatus,
      fetchedAt: sourceSnapshots.fetchedAt,
      recordCount: sourceSnapshots.recordCount,
      errorCode: sourceSnapshots.errorCode,
      errorMessage: sourceSnapshots.errorMessage,
    })
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.reportRunId, params.reportRunId))
    .orderBy(desc(sourceSnapshots.createdAt));

  const [{ count: normalizedJobCount }] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(normalizedJobs)
    .where(eq(normalizedJobs.reportRunId, params.reportRunId));

  const jobs = await db
    .select({
      provider: normalizedJobs.provider,
      title: normalizedJobs.title,
      department: normalizedJobs.department,
      location: normalizedJobs.location,
      jobUrl: normalizedJobs.jobUrl,
      updatedAt: normalizedJobs.updatedAt,
    })
    .from(normalizedJobs)
    .where(eq(normalizedJobs.reportRunId, params.reportRunId))
    .orderBy(desc(normalizedJobs.createdAt))
    .limit(5);

  const [publishedVersion] = await db
    .select({
      id: reportVersions.id,
      status: reportVersions.status,
      versionNumber: reportVersions.versionNumber,
      generatedAt: reportVersions.generatedAt,
      publishedAt: reportVersions.publishedAt,
    })
    .from(reportVersions)
    .where(eq(reportVersions.reportRunId, params.reportRunId))
    .orderBy(desc(reportVersions.publishedAt), desc(reportVersions.generatedAt))
    .limit(1);

  const publishedArtifacts = publishedVersion
    ? await db
        .select({
          artifactType: artifacts.artifactType,
          status: artifacts.status,
        })
        .from(artifacts)
        .where(eq(artifacts.reportVersionId, publishedVersion.id))
    : [];

  return {
    ...run,
    sourceSnapshots: snapshots,
    normalizedJobs: jobs,
    normalizedJobCount,
    reportVersionId: publishedVersion?.id ?? null,
    reportVersion: publishedVersion
      ? {
          id: publishedVersion.id,
          status: publishedVersion.status,
          versionNumber: publishedVersion.versionNumber,
          generatedAt: publishedVersion.generatedAt,
          publishedAt: publishedVersion.publishedAt,
          artifactStatus: {
            html: getReportArtifactStatus(publishedArtifacts, "html"),
            pdf: getReportArtifactStatus(publishedArtifacts, "pdf"),
          },
          artifactAvailability: {
            html: publishedArtifacts.some(
              (artifact) => artifact.artifactType === "html" && artifact.status === "available"
            ),
            pdf: publishedArtifacts.some(
              (artifact) => artifact.artifactType === "pdf" && artifact.status === "available"
            ),
          },
        }
      : null,
  };
}
