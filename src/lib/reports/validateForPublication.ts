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
import { buildAnalysisInput } from "@/lib/analysis/buildAnalysisInput";
import {
  ALLOWED_CLAIM_FAMILIES,
  ALLOWED_CLAIM_LABELS,
} from "@/lib/analysis/claimTaxonomy";
import { validateAnalysisOutput } from "@/lib/analysis/validateAnalysisOutput";
import { getObjectJson } from "@/lib/storage/s3";

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
      outputObjectKey: analysisRuns.outputObjectKey,
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
      claimType: claims.claimType,
      supportStatus: claims.supportStatus,
      confidence: claims.confidence,
    })
    .from(claims)
    .where(eq(claims.analysisRunId, latestSuccessfulAnalysisRun.id));

  if (claimRows.length === 0) {
    throw new Error(`Analysis run ${latestSuccessfulAnalysisRun.id} has no persisted claims.`);
  }

  for (const claim of claimRows) {
    if (!ALLOWED_CLAIM_FAMILIES.includes(claim.claimType as (typeof ALLOWED_CLAIM_FAMILIES)[number])) {
      throw new Error(`Claim ${claim.id} has unsupported claim_type "${claim.claimType}".`);
    }

    if (!ALLOWED_CLAIM_LABELS.includes(claim.supportStatus as (typeof ALLOWED_CLAIM_LABELS)[number])) {
      throw new Error(`Claim ${claim.id} has unsupported support_status "${claim.supportStatus}".`);
    }

    if (!["high", "medium", "low"].includes(claim.confidence)) {
      throw new Error(`Claim ${claim.id} has unsupported confidence "${claim.confidence}".`);
    }

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

  if (!latestSuccessfulAnalysisRun.outputObjectKey) {
    throw new Error(
      `Analysis run ${latestSuccessfulAnalysisRun.id} is missing persisted output required for publication.`
    );
  }

  const analysisContext = await buildAnalysisInput(reportRunId);
  const rawAnalysisOutput = await getObjectJson<unknown>(latestSuccessfulAnalysisRun.outputObjectKey);
  const validatedOutput = validateAnalysisOutput(rawAnalysisOutput, analysisContext);

  if (
    analysisContext.input.datasetAssessment.evidenceStrength !== "strong" &&
    validatedOutput.caveats.length === 0
  ) {
    throw new Error(`Report run ${reportRunId} is missing required caveats for a weak or limited dataset.`);
  }

  for (const claim of validatedOutput.claims) {
    if (
      analysisContext.input.datasetAssessment.confidenceCap === "low" &&
      claim.confidence !== "low"
    ) {
      throw new Error(`Claim ${claim.claimId} exceeds the low-confidence cap required for this dataset.`);
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
