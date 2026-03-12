import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reportVersions, reportRuns } from "@/db/schema";
import { buildCanonicalReport } from "@/lib/artifacts/buildCanonicalReport";
import { validateForPublication } from "@/lib/reports/validateForPublication";
import { buildReportObjectKey } from "@/lib/storage/objectKeys";
import { putObject } from "@/lib/storage/s3";

export interface PublishReportVersionResult {
  reportVersionId: string;
  reportRunId: string;
  analysisRunId: string | null;
  status: "published";
  finalRunStatus: "completed" | "completed_partial" | "completed_zero_data";
}

async function getNextVersionNumber(reportRunId: string): Promise<number> {
  const [latestVersion] = await db
    .select({
      versionNumber: reportVersions.versionNumber,
    })
    .from(reportVersions)
    .where(eq(reportVersions.reportRunId, reportRunId))
    .orderBy(desc(reportVersions.versionNumber))
    .limit(1);

  return (latestVersion?.versionNumber ?? 0) + 1;
}

export async function publishReportVersion(
  reportRunId: string
): Promise<PublishReportVersionResult> {
  const existingPublished = await db.query.reportVersions.findFirst({
    where: and(eq(reportVersions.reportRunId, reportRunId), eq(reportVersions.status, "published")),
  });

  if (existingPublished) {
    const [run] = await db
      .select({ status: reportRuns.status })
      .from(reportRuns)
      .where(eq(reportRuns.id, reportRunId))
      .limit(1);

    return {
      reportVersionId: existingPublished.id,
      reportRunId,
      analysisRunId: existingPublished.analysisRunId,
      status: "published",
      finalRunStatus:
        run?.status === "completed_zero_data" || run?.status === "completed_partial"
          ? run.status
          : "completed",
    };
  }

  const validation = await validateForPublication(reportRunId);
  const reportVersionId = randomUUID();
  const versionNumber = await getNextVersionNumber(reportRunId);
  const reportObjectKey = buildReportObjectKey(reportVersionId);
  const generatedAt = new Date();
  const publishedAt = new Date();
  const built = await buildCanonicalReport({
    reportRunId,
    reportVersionId,
    analysisRunId: validation.latestSuccessfulAnalysisRunId,
    partialData: validation.partialData,
    zeroData: validation.zeroData,
    generatedAt,
    publishedAt,
  });

  await putObject({
    key: reportObjectKey,
    body: JSON.stringify(built.report, null, 2),
    contentType: "application/json",
  });

  await db.transaction(async (tx) => {
    await tx.insert(reportVersions).values({
      id: reportVersionId,
      reportRunId,
      analysisRunId: validation.latestSuccessfulAnalysisRunId,
      versionNumber,
      status: "drafting",
      templateVersion: built.templateVersion,
      reportObjectKey,
      reportSha256: built.reportSha256,
      generatedAt,
      createdAt: generatedAt,
    });

    await tx
      .update(reportVersions)
      .set({
        status: "published",
        publishedAt,
      })
      .where(eq(reportVersions.id, reportVersionId));

    await tx
      .update(reportRuns)
      .set({
        status: validation.finalRunStatus,
        completedAt: publishedAt,
        lockToken: null,
        lockedAt: null,
        failureCode: null,
        failureMessage: null,
      })
      .where(eq(reportRuns.id, reportRunId));
  });

  return {
    reportVersionId,
    reportRunId,
    analysisRunId: validation.latestSuccessfulAnalysisRunId,
    status: "published",
    finalRunStatus: validation.finalRunStatus,
  };
}
