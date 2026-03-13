import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  companies,
  companyProviderAccounts,
  normalizedJobs,
  reportRuns,
  sourceSnapshots,
} from "@/db/schema";
import { normalizeJobs } from "@/lib/normalize/normalizeJobs";
import type { ClaimedReportRun } from "@/lib/reports/claimNextReportRun";
import { fetchProviderSnapshotForResolvedCompany } from "@/lib/providers/ats/fetchProviderSnapshot";
import { resolveCompany } from "@/lib/providers/ats/resolveCompany";
import { buildRawSnapshotObjectKey } from "@/lib/storage/objectKeys";
import { gzipJson, sha256Hex } from "@/lib/storage/checksums";
import { getS3Bucket, putObject } from "@/lib/storage/s3";
import { publishReportVersion } from "@/lib/reports/publishReportVersion";
import { analyzeFrozenData } from "@/worker/steps/analyzeFrozenData";
import { renderArtifacts } from "@/worker/steps/renderArtifacts";

async function updateRun(
  reportRunId: string,
  lockToken: string | null,
  values: Partial<typeof reportRuns.$inferInsert>
) {
  const nextValues = {
    ...values,
    ...(lockToken && values.lockedAt === undefined ? { lockedAt: new Date() } : {}),
  };
  const whereClause = lockToken
    ? and(eq(reportRuns.id, reportRunId), eq(reportRuns.lockToken, lockToken))
    : eq(reportRuns.id, reportRunId);

  await db.update(reportRuns).set(nextValues).where(whereClause);
}

async function upsertProviderAccount(params: {
  companyId: string;
  provider: string;
  providerToken: string;
  verifiedAt: Date;
}) {
  const existing = await db.query.companyProviderAccounts.findFirst({
    where: and(
      eq(companyProviderAccounts.companyId, params.companyId),
      eq(companyProviderAccounts.provider, params.provider),
      eq(companyProviderAccounts.providerToken, params.providerToken)
    ),
  });

  if (existing) {
    await db
      .update(companyProviderAccounts)
      .set({
        status: "verified",
        resolutionSource: "worker_snapshot",
        confidence: "1.00",
        verifiedAt: params.verifiedAt,
        lastSuccessAt: params.verifiedAt,
        updatedAt: new Date(),
      })
      .where(eq(companyProviderAccounts.id, existing.id));

    return;
  }

  await db.insert(companyProviderAccounts).values({
    id: randomUUID(),
    companyId: params.companyId,
    provider: params.provider,
    providerToken: params.providerToken,
    status: "verified",
    resolutionSource: "worker_snapshot",
    confidence: "1.00",
    verifiedAt: params.verifiedAt,
    lastSuccessAt: params.verifiedAt,
  });
}

async function markRunFailed(
  claimedRun: ClaimedReportRun,
  failureCode: string,
  failureMessage: string,
) {
  await updateRun(claimedRun.id, claimedRun.lockToken, {
    status: "failed",
    failureCode,
    failureMessage,
    completedAt: new Date(),
    lockToken: null,
    lockedAt: null,
  });
}

function getRunFailureDetails(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown report-run execution failure.";

  if (message.includes("did not respond cleanly after 3 attempts")) {
    return {
      failureCode: "analysis_model_transient_failure",
      failureMessage: message,
    };
  }

  if (message.startsWith("The analysis model returned")) {
    return {
      failureCode: "analysis_model_failed",
      failureMessage: message,
    };
  }

  if (
    message.startsWith("Structured analysis") ||
    message.startsWith("Executive summary") ||
    message.includes("unsupported claim") ||
    message.includes("missing required caveats")
  ) {
    return {
      failureCode: "analysis_validation_failed",
      failureMessage: message,
    };
  }

  if (message.toLowerCase().includes("pdf")) {
    return {
      failureCode: "artifact_pdf_failed",
      failureMessage: message,
    };
  }

  return {
    failureCode: "report_run_execution_failed",
    failureMessage: message,
  };
}

export interface ExecuteReportRunResult {
  reportRunId: string;
  companyId: string;
  sourceSnapshotId: string | null;
  status: string;
  normalizedJobCount: number;
  analysisRunId: string | null;
  claimCount: number;
  citationCount: number;
  reportVersionId: string | null;
}

export async function executeReportRun(
  claimedRun: ClaimedReportRun
): Promise<ExecuteReportRunResult> {
  if (!claimedRun.lockToken) {
    throw new Error(`Report run ${claimedRun.id} does not have a lock token.`);
  }

  try {
    getS3Bucket();
  } catch (error) {
    await markRunFailed(
      claimedRun,
      "s3_not_configured",
      error instanceof Error
        ? error.message
        : "Object storage is not configured for report-run execution."
    );
    throw error;
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, claimedRun.companyId))
    .limit(1);

  if (!company) {
    await markRunFailed(claimedRun, "company_missing", "The queued report run references a missing company.");
    throw new Error(`Report run ${claimedRun.id} references missing company ${claimedRun.companyId}.`);
  }

  try {
    await updateRun(claimedRun.id, claimedRun.lockToken, {
      status: "resolving",
      failureCode: null,
      failureMessage: null,
    });

    const resolvedCompany = resolveCompany(claimedRun.requestedCompanyName);

    await db
      .update(companies)
      .set({
        displayName: resolvedCompany.normalizedName,
        canonicalName: resolvedCompany.canonicalName,
        resolutionStatus: "resolving",
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));

    await updateRun(claimedRun.id, claimedRun.lockToken, {
      status: "fetching",
    });

    const selection = await fetchProviderSnapshotForResolvedCompany(resolvedCompany);

    if (!selection) {
      await db
        .update(companies)
        .set({
          resolutionStatus: "needs_resolution",
          updatedAt: new Date(),
        })
        .where(eq(companies.id, company.id));

      await updateRun(claimedRun.id, claimedRun.lockToken, {
        status: "needs_resolution",
        failureCode: "no_provider_snapshot",
        failureMessage: `No supported ATS snapshot could be captured for "${claimedRun.requestedCompanyName}".`,
        completedAt: new Date(),
        lockToken: null,
        lockedAt: null,
      });

      return {
        reportRunId: claimedRun.id,
        companyId: company.id,
        sourceSnapshotId: null,
        status: "needs_resolution",
        normalizedJobCount: 0,
        analysisRunId: null,
        claimCount: 0,
        citationCount: 0,
        reportVersionId: null,
      };
    }

    const fetchedAt = new Date(selection.snapshot.fetchedAt);
    const sourceSnapshotId = randomUUID();

    await db
      .update(companies)
      .set({
        displayName: selection.resolvedCompany.normalizedName,
        canonicalName: selection.resolvedCompany.canonicalName,
        resolutionStatus: "resolved",
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));

    await upsertProviderAccount({
      companyId: company.id,
      provider: selection.snapshot.provider,
      providerToken: selection.snapshot.providerToken,
      verifiedAt: fetchedAt,
    });

    const payloadBuffer = gzipJson(selection.snapshot.payload);
    const payloadSha256 = sha256Hex(payloadBuffer);
    const objectKey = buildRawSnapshotObjectKey({
      tenantId: claimedRun.tenantId,
      companyId: company.id,
      reportRunId: claimedRun.id,
      provider: selection.snapshot.provider,
      sourceSnapshotId,
    });

    await putObject({
      key: objectKey,
      body: payloadBuffer,
      contentType: "application/json",
      contentEncoding: "gzip",
    });

    await db.insert(sourceSnapshots).values({
      id: sourceSnapshotId,
      reportRunId: claimedRun.id,
      companyId: company.id,
      provider: selection.snapshot.provider,
      providerToken: selection.snapshot.providerToken,
      requestUrl: selection.snapshot.requestUrl,
      status: "captured",
      httpStatus: selection.snapshot.httpStatus,
      fetchedAt,
      payloadObjectKey: objectKey,
      payloadSha256,
      recordCount: selection.snapshot.rawJobs.length,
    });

    await updateRun(claimedRun.id, claimedRun.lockToken, {
      status: "normalizing",
    });

    const jobRows = normalizeJobs({
      reportRunId: claimedRun.id,
      sourceSnapshotId,
      provider: selection.snapshot.provider,
      rawJobs: selection.snapshot.rawJobs,
    });

    if (jobRows.length > 0) {
      await db.insert(normalizedJobs).values(jobRows);
    }

    if (jobRows.length === 0) {
      await updateRun(claimedRun.id, claimedRun.lockToken, {
        status: "publishing",
      });

      const published = await publishReportVersion(claimedRun.id);
      await renderArtifacts(published.reportVersionId).catch((error) => {
        console.error(
          `[worker] Failed to render artifacts for zero-data report ${published.reportVersionId}:`,
          error
        );
      });

      return {
        reportRunId: claimedRun.id,
        companyId: company.id,
        sourceSnapshotId,
        status: published.finalRunStatus,
        normalizedJobCount: 0,
        analysisRunId: null,
        claimCount: 0,
        citationCount: 0,
        reportVersionId: published.reportVersionId,
      };
    }

    await updateRun(claimedRun.id, claimedRun.lockToken, {
      status: "analyzing",
    });

    const analysisResult = await analyzeFrozenData({
      reportRunId: claimedRun.id,
    });

    await updateRun(claimedRun.id, claimedRun.lockToken, {
      status: "validating",
    });

    await updateRun(claimedRun.id, claimedRun.lockToken, {
      status: "publishing",
    });

    const published = await publishReportVersion(claimedRun.id);
    await renderArtifacts(published.reportVersionId).catch((error) => {
      console.error(
        `[worker] Failed to render artifacts for report ${published.reportVersionId}:`,
        error
      );
    });

    return {
      reportRunId: claimedRun.id,
      companyId: company.id,
      sourceSnapshotId,
      status: published.finalRunStatus,
      normalizedJobCount: jobRows.length,
      analysisRunId: analysisResult.analysisRunId,
      claimCount: analysisResult.claimCount,
      citationCount: analysisResult.citationCount,
      reportVersionId: published.reportVersionId,
    };
  } catch (error) {
    const { failureCode, failureMessage } = getRunFailureDetails(error);
    await markRunFailed(claimedRun, failureCode, failureMessage);
    throw error;
  }
}
