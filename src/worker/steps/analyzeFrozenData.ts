import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { analysisRuns, claims, citations } from "@/db/schema";
import { buildAnalysisInput } from "@/lib/analysis/buildAnalysisInput";
import {
  ANALYSIS_MODEL_NAME,
  ANALYSIS_MODEL_PROVIDER,
  ANALYSIS_MODEL_VERSION,
  ANALYSIS_PROMPT_VERSION,
} from "@/lib/analysis/promptSpec";
import { runStructuredAnalysis } from "@/lib/analysis/runStructuredAnalysis";
import {
  parseStructuredAnalysisResponse,
  validateAnalysisOutput,
} from "@/lib/analysis/validateAnalysisOutput";
import { sha256Hex } from "@/lib/storage/checksums";
import { buildAnalysisInputObjectKey, buildAnalysisOutputObjectKey } from "@/lib/storage/objectKeys";
import { putObject } from "@/lib/storage/s3";

function jsonBuffer(value: unknown) {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

function buildEvidenceSha(params: {
  snapshotSha256: string | null;
  normalizedSha256: string;
  rawFieldPaths: string[];
}) {
  return sha256Hex(
    JSON.stringify({
      snapshotSha256: params.snapshotSha256,
      normalizedSha256: params.normalizedSha256,
      rawFieldPaths: params.rawFieldPaths,
    })
  );
}

async function getNextAnalysisSequence(reportRunId: string): Promise<number> {
  const [latestRun] = await db
    .select({ analysisSequence: analysisRuns.analysisSequence })
    .from(analysisRuns)
    .where(eq(analysisRuns.reportRunId, reportRunId))
    .orderBy(desc(analysisRuns.analysisSequence))
    .limit(1);

  return (latestRun?.analysisSequence ?? 0) + 1;
}

export interface AnalyzeFrozenDataResult {
  analysisRunId: string;
  claimCount: number;
  citationCount: number;
}

export async function analyzeFrozenData(params: {
  reportRunId: string;
}): Promise<AnalyzeFrozenDataResult> {
  const context = await buildAnalysisInput(params.reportRunId);
  const analysisRunId = randomUUID();
  const analysisSequence = await getNextAnalysisSequence(params.reportRunId);
  const inputBuffer = jsonBuffer(context.input);
  const inputSha256 = sha256Hex(inputBuffer);
  const inputObjectKey = buildAnalysisInputObjectKey({
    reportRunId: params.reportRunId,
    analysisRunId,
  });

  await db.insert(analysisRuns).values({
    id: analysisRunId,
    reportRunId: params.reportRunId,
    analysisSequence,
    status: "queued",
    promptVersion: ANALYSIS_PROMPT_VERSION,
    modelProvider: ANALYSIS_MODEL_PROVIDER,
    modelName: ANALYSIS_MODEL_NAME,
    modelVersion: ANALYSIS_MODEL_VERSION,
    inputObjectKey,
    inputSha256,
  });

  await putObject({
    key: inputObjectKey,
    body: inputBuffer,
    contentType: "application/json",
  });

  await db
    .update(analysisRuns)
    .set({
      status: "running",
      startedAt: new Date(),
    })
    .where(eq(analysisRuns.id, analysisRunId));

  try {
    const execution = await runStructuredAnalysis(context.input);
    const parsedOutput = validateAnalysisOutput(
      parseStructuredAnalysisResponse(execution.rawText),
      context
    );
    const outputBuffer = Buffer.from(execution.rawText, "utf8");
    const outputSha256 = sha256Hex(outputBuffer);
    const outputObjectKey = buildAnalysisOutputObjectKey({
      reportRunId: params.reportRunId,
      analysisRunId,
    });

    await putObject({
      key: outputObjectKey,
      body: outputBuffer,
      contentType: "application/json",
    });

    const claimIdMap = new Map<string, string>();
    const claimRows = parsedOutput.claims.map((claim, index) => {
      const claimId = randomUUID();
      claimIdMap.set(claim.claimId, claimId);

      return {
        id: claimId,
        analysisRunId,
        section: claim.section,
        claimType: claim.claimType,
        statement: claim.statement,
        whyItMatters: claim.whyThisMatters,
        confidence: claim.confidence,
        supportStatus: "supported",
        displayOrder: index + 1,
      };
    });

    await db.transaction(async (tx) => {
      if (claimRows.length > 0) {
        await tx.insert(claims).values(claimRows);
      }

      const citationRows = parsedOutput.claims.flatMap((claim) => {
        const persistedClaimId = claimIdMap.get(claim.claimId);

        if (!persistedClaimId) {
          throw new Error(`Missing persisted claim id for model claim "${claim.claimId}".`);
        }

        return claim.citationRefs.map((citationRef, index) => {
          const job = context.jobsById.get(citationRef.normalizedJobId);

          if (!job) {
            throw new Error(`Missing normalized job ${citationRef.normalizedJobId} during citation persist.`);
          }

          const snapshot = context.snapshotsById.get(job.sourceSnapshotId);

          if (!snapshot) {
            throw new Error(`Missing source snapshot ${job.sourceSnapshotId} during citation persist.`);
          }

          return {
            id: randomUUID(),
            claimId: persistedClaimId,
            sourceSnapshotId: job.sourceSnapshotId,
            normalizedJobId: job.normalizedJobId,
            provider: job.provider,
            providerJobId: job.providerJobId,
            jobUrl: job.jobUrl,
            jobTitle: job.title,
            department: job.department,
            location: job.location,
            sourcePostedAt: job.postedAt,
            sourceUpdatedAt: job.updatedAt,
            snapshotFetchedAt: snapshot.fetchedAt ?? new Date(context.input.asOfTime),
            rawRecordPath: job.rawRecordPath,
            rawFieldPaths: citationRef.rawFieldPaths,
            evidenceSha256: buildEvidenceSha({
              snapshotSha256: snapshot.payloadSha256,
              normalizedSha256: job.normalizedSha256,
              rawFieldPaths: citationRef.rawFieldPaths,
            }),
            citationOrder: index + 1,
          };
        });
      });

      if (citationRows.length > 0) {
        await tx.insert(citations).values(citationRows);
      }

      await tx
        .update(analysisRuns)
        .set({
          status: "succeeded",
          outputObjectKey,
          outputSha256,
          completedAt: new Date(),
          failureCode: null,
          failureMessage: null,
          promptVersion: execution.promptVersion,
          modelProvider: execution.modelProvider,
          modelName: execution.modelName,
          modelVersion: execution.modelVersion,
        })
        .where(eq(analysisRuns.id, analysisRunId));
    });

    return {
      analysisRunId,
      claimCount: parsedOutput.claims.length,
      citationCount: parsedOutput.claims.reduce(
        (total, claim) => total + claim.citationRefs.length,
        0
      ),
    };
  } catch (error) {
    const failureMessage =
      error instanceof Error ? error.message : "Structured analysis failed for an unknown reason.";
    const failureCode =
      error instanceof SyntaxError ||
      error instanceof ZodError ||
      (error instanceof Error &&
        (failureMessage.startsWith("Structured analysis") ||
          failureMessage.startsWith("Executive summary")))
        ? "failed_validation"
        : "failed_model";

    await db
      .update(analysisRuns)
      .set({
        status: failureCode,
        completedAt: new Date(),
        failureCode,
        failureMessage,
      })
      .where(eq(analysisRuns.id, analysisRunId));

    throw error;
  }
}
