import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  analysisRuns,
  citations,
  claims,
  normalizedJobs,
  reportRuns,
  sourceSnapshots,
} from "@/db/schema";

export interface PublicationValidationResult {
  runId: string;
  zeroData: boolean;
  partialData: boolean;
  finalRunStatus: "completed" | "completed_partial" | "completed_zero_data";
  latestSuccessfulAnalysisRunId: string | null;
}

export async function validateForPublication(
  reportRunId: string
): Promise<PublicationValidationResult> {
  const [run] = await db
    .select({
      id: reportRuns.id,
      status: reportRuns.status,
    })
    .from(reportRuns)
    .where(eq(reportRuns.id, reportRunId))
    .limit(1);

  if (!run) {
    throw new Error(`Report run ${reportRunId} was not found for publication.`);
  }

  if (run.status === "needs_resolution" || run.status === "failed") {
    throw new Error(`Report run ${reportRunId} is not publishable from status "${run.status}".`);
  }

  const snapshots = await db
    .select({
      id: sourceSnapshots.id,
      status: sourceSnapshots.status,
      payloadObjectKey: sourceSnapshots.payloadObjectKey,
      payloadSha256: sourceSnapshots.payloadSha256,
      recordCount: sourceSnapshots.recordCount,
    })
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.reportRunId, reportRunId));

  if (snapshots.length === 0) {
    throw new Error(`Report run ${reportRunId} has no source snapshots to publish.`);
  }

  const terminalStatuses = new Set(["captured", "zero_data", "provider_error", "skipped"]);
  const nonTerminalSnapshot = snapshots.find((snapshot) => !terminalStatuses.has(snapshot.status));

  if (nonTerminalSnapshot) {
    throw new Error(
      `Report run ${reportRunId} cannot publish while snapshot ${nonTerminalSnapshot.id} is "${nonTerminalSnapshot.status}".`
    );
  }

  const capturedSnapshots = snapshots.filter((snapshot) => snapshot.status === "captured");

  if (capturedSnapshots.length === 0) {
    throw new Error(`Report run ${reportRunId} has no successful captured snapshots to publish.`);
  }

  for (const snapshot of capturedSnapshots) {
    if (!snapshot.payloadObjectKey || !snapshot.payloadSha256 || snapshot.recordCount < 0) {
      throw new Error(`Captured snapshot ${snapshot.id} is missing required publication fields.`);
    }
  }

  const jobRows = await db
    .select({ id: normalizedJobs.id })
    .from(normalizedJobs)
    .where(eq(normalizedJobs.reportRunId, reportRunId));

  const zeroData = jobRows.length === 0;
  const partialData = snapshots.some(
    (snapshot) => snapshot.status === "provider_error" || snapshot.status === "skipped"
  );

  const [latestSuccessfulAnalysisRun] = await db
    .select({
      id: analysisRuns.id,
    })
    .from(analysisRuns)
    .where(and(eq(analysisRuns.reportRunId, reportRunId), eq(analysisRuns.status, "succeeded")))
    .orderBy(desc(analysisRuns.analysisSequence))
    .limit(1);

  if (zeroData) {
    const zeroDataClaims = await db
      .select({ id: claims.id })
      .from(claims)
      .innerJoin(analysisRuns, eq(analysisRuns.id, claims.analysisRunId))
      .where(eq(analysisRuns.reportRunId, reportRunId))
      .limit(1);

    if (zeroDataClaims.length > 0) {
      throw new Error(`Zero-data report run ${reportRunId} cannot publish with persisted claims.`);
    }

    return {
      runId: reportRunId,
      zeroData: true,
      partialData: false,
      finalRunStatus: "completed_zero_data",
      latestSuccessfulAnalysisRunId: null,
    };
  }

  if (!latestSuccessfulAnalysisRun) {
    throw new Error(`Report run ${reportRunId} cannot publish without a successful analysis run.`);
  }

  const claimRows = await db
    .select({
      id: claims.id,
    })
    .from(claims)
    .where(eq(claims.analysisRunId, latestSuccessfulAnalysisRun.id));

  if (claimRows.length === 0) {
    throw new Error(`Analysis run ${latestSuccessfulAnalysisRun.id} has no persisted claims.`);
  }

  for (const claim of claimRows) {
    const claimCitations = await db
      .select({
        id: citations.id,
        normalizedJobId: citations.normalizedJobId,
        sourceSnapshotId: citations.sourceSnapshotId,
        rawRecordPath: citations.rawRecordPath,
        rawFieldPaths: citations.rawFieldPaths,
        evidenceSha256: citations.evidenceSha256,
      })
      .from(citations)
      .where(eq(citations.claimId, claim.id));

    if (claimCitations.length === 0) {
      throw new Error(`Claim ${claim.id} is missing citations required for publication.`);
    }

    for (const citation of claimCitations) {
      if (
        !citation.normalizedJobId ||
        !citation.sourceSnapshotId ||
        !citation.rawRecordPath ||
        citation.rawFieldPaths.length === 0 ||
        !citation.evidenceSha256
      ) {
        throw new Error(`Citation ${citation.id} is missing publication evidence fields.`);
      }
    }
  }

  return {
    runId: reportRunId,
    zeroData: false,
    partialData,
    finalRunStatus: partialData ? "completed_partial" : "completed",
    latestSuccessfulAnalysisRunId: latestSuccessfulAnalysisRun.id,
  };
}
