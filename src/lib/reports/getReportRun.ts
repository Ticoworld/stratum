import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, normalizedJobs, reportRuns, sourceSnapshots } from "@/db/schema";

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
      companyCanonicalName: companies.canonicalName,
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
      id: sourceSnapshots.id,
      provider: sourceSnapshots.provider,
      providerToken: sourceSnapshots.providerToken,
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

  const jobs = await db
    .select({
      id: normalizedJobs.id,
      provider: normalizedJobs.provider,
      title: normalizedJobs.title,
      department: normalizedJobs.department,
      location: normalizedJobs.location,
      providerJobId: normalizedJobs.providerJobId,
      jobUrl: normalizedJobs.jobUrl,
      updatedAt: normalizedJobs.updatedAt,
    })
    .from(normalizedJobs)
    .where(eq(normalizedJobs.reportRunId, params.reportRunId))
    .orderBy(desc(normalizedJobs.createdAt));

  return {
    ...run,
    sourceSnapshots: snapshots,
    normalizedJobs: jobs,
    normalizedJobCount: jobs.length,
  };
}
