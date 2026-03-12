import { readFileSync } from "fs";
import path from "path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  analysisRuns,
  citations,
  claims,
  companies,
  reportRuns,
  sourceSnapshots,
} from "@/db/schema";
import { buildAnalysisInput } from "@/lib/analysis/buildAnalysisInput";
import {
  type ValidatedAnalysisOutput,
  validateAnalysisOutput,
} from "@/lib/analysis/validateAnalysisOutput";
import { type ReportJson, reportJsonSchema } from "@/lib/reports/reportJson";
import { sha256Hex } from "@/lib/storage/checksums";
import { getObjectJson } from "@/lib/storage/s3";

const REPORT_SCHEMA_VERSION = "1";
const REPORT_TEMPLATE_VERSION = "1";

function getSystemVersion() {
  const packageJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8")
  ) as { name?: string; version?: string };

  return `${packageJson.name ?? "stratum"}@${packageJson.version ?? "0.0.0"}`;
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function buildReportHash(report: Omit<ReportJson, "integrity"> & { integrity: Omit<ReportJson["integrity"], "reportSha256"> }) {
  return sha256Hex(JSON.stringify(report, null, 2));
}

export interface BuildCanonicalReportParams {
  reportRunId: string;
  reportVersionId: string;
  analysisRunId: string | null;
  partialData: boolean;
  zeroData: boolean;
  generatedAt: Date;
  publishedAt: Date;
}

export interface BuildCanonicalReportResult {
  report: ReportJson;
  reportSha256: string;
  templateVersion: string;
}

export async function buildCanonicalReport(
  params: BuildCanonicalReportParams
): Promise<BuildCanonicalReportResult> {
  const [run] = await db
    .select({
      reportRunId: reportRuns.id,
      asOfTime: reportRuns.asOfTime,
      companyId: companies.id,
      displayName: companies.displayName,
      canonicalName: companies.canonicalName,
      websiteDomain: companies.websiteDomain,
    })
    .from(reportRuns)
    .innerJoin(companies, eq(companies.id, reportRuns.companyId))
    .where(eq(reportRuns.id, params.reportRunId))
    .limit(1);

  if (!run) {
    throw new Error(`Report run ${params.reportRunId} was not found while building report.json.`);
  }

  const snapshots = await db
    .select({
      id: sourceSnapshots.id,
      provider: sourceSnapshots.provider,
      providerToken: sourceSnapshots.providerToken,
      status: sourceSnapshots.status,
      fetchedAt: sourceSnapshots.fetchedAt,
      payloadSha256: sourceSnapshots.payloadSha256,
      errorCode: sourceSnapshots.errorCode,
      errorMessage: sourceSnapshots.errorMessage,
    })
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.reportRunId, params.reportRunId))
    .orderBy(asc(sourceSnapshots.createdAt));

  const analysisContext = await buildAnalysisInput(params.reportRunId);
  const metrics = {
    totalJobs: analysisContext.input.normalizedJobs.length,
    departmentCounts: analysisContext.input.jobCountsByDepartment,
    locationCounts: analysisContext.input.jobCountsByLocation,
    recencyBuckets: analysisContext.input.recencyBuckets,
  };

  let analysisRun:
    | {
        id: string;
        promptVersion: string;
        modelProvider: string;
        modelName: string;
        modelVersion: string;
        inputSha256: string;
        outputSha256: string | null;
        outputObjectKey: string | null;
      }
    | undefined;
  let analysisOutput: ValidatedAnalysisOutput | null = null;

  if (params.analysisRunId) {
    [analysisRun] = await db
      .select({
        id: analysisRuns.id,
        promptVersion: analysisRuns.promptVersion,
        modelProvider: analysisRuns.modelProvider,
        modelName: analysisRuns.modelName,
        modelVersion: analysisRuns.modelVersion,
        inputSha256: analysisRuns.inputSha256,
        outputSha256: analysisRuns.outputSha256,
        outputObjectKey: analysisRuns.outputObjectKey,
      })
      .from(analysisRuns)
      .where(and(eq(analysisRuns.id, params.analysisRunId), eq(analysisRuns.reportRunId, params.reportRunId)))
      .limit(1);

    if (!analysisRun?.outputObjectKey) {
      throw new Error(`Analysis run ${params.analysisRunId} is missing persisted output required for publication.`);
    }

    const rawAnalysisOutput = await getObjectJson<unknown>(analysisRun.outputObjectKey);
    analysisOutput = validateAnalysisOutput(rawAnalysisOutput, analysisContext);
  }

  const claimRows = params.analysisRunId
    ? await db
        .select({
          id: claims.id,
          section: claims.section,
          claimType: claims.claimType,
          statement: claims.statement,
          whyItMatters: claims.whyItMatters,
          confidence: claims.confidence,
          supportStatus: claims.supportStatus,
          displayOrder: claims.displayOrder,
        })
        .from(claims)
        .where(eq(claims.analysisRunId, params.analysisRunId))
        .orderBy(asc(claims.displayOrder))
    : [];

  const claimIds = claimRows.map((claim) => claim.id);

  const citationRows =
    claimIds.length > 0
      ? await db
          .select({
            id: citations.id,
            claimId: citations.claimId,
            sourceSnapshotId: citations.sourceSnapshotId,
            normalizedJobId: citations.normalizedJobId,
            provider: citations.provider,
            providerJobId: citations.providerJobId,
            jobUrl: citations.jobUrl,
            jobTitle: citations.jobTitle,
            department: citations.department,
            location: citations.location,
            sourcePostedAt: citations.sourcePostedAt,
            sourceUpdatedAt: citations.sourceUpdatedAt,
            snapshotFetchedAt: citations.snapshotFetchedAt,
            rawRecordPath: citations.rawRecordPath,
            rawFieldPaths: citations.rawFieldPaths,
            evidenceSha256: citations.evidenceSha256,
            citationOrder: citations.citationOrder,
          })
          .from(citations)
          .where(inArray(citations.claimId, claimIds))
          .orderBy(asc(citations.claimId), asc(citations.citationOrder))
      : [];

  const citationsByClaimId = new Map<string, typeof citationRows>();

  for (const citation of citationRows) {
    const existing = citationsByClaimId.get(citation.claimId) ?? [];
    existing.push(citation);
    citationsByClaimId.set(citation.claimId, existing);
  }

  const analysisClaimIdToPersistedClaimId = new Map<string, string>();

  if (analysisOutput) {
    for (const [index, analysisClaim] of analysisOutput.claims.entries()) {
      const persistedClaim = claimRows[index];

      if (!persistedClaim) {
        throw new Error(
          `Persisted claim row is missing for analysis claim "${analysisClaim.claimId}".`
        );
      }

      analysisClaimIdToPersistedClaimId.set(analysisClaim.claimId, persistedClaim.id);
    }
  }

  const executiveSummary =
    params.zeroData || !analysisOutput
      ? [
          {
            order: 1,
            text: "No active jobs observed in captured snapshot.",
            claimRefs: [],
          },
        ]
      : analysisOutput.executiveSummary.map((item, index) => ({
          order: index + 1,
          text: item.text,
          claimRefs: item.claimRefs.map((claimRef) => {
            const persistedClaimId = analysisClaimIdToPersistedClaimId.get(claimRef);

            if (!persistedClaimId) {
              throw new Error(`Executive summary references unknown persisted claim "${claimRef}".`);
            }

            return persistedClaimId;
          }),
        }));

  const claimPayload = claimRows.map((claim) => {
    const claimCitations = citationsByClaimId.get(claim.id) ?? [];

    return {
      claimId: claim.id,
      section: claim.section,
      claimType: claim.claimType,
      statement: claim.statement,
      whyItMatters: claim.whyItMatters,
      confidence: claim.confidence,
      supportStatus: claim.supportStatus,
      citationRefs: claimCitations.map((citation) => citation.id),
    };
  });

  const citationPayload = citationRows.map((citation) => ({
    citationId: citation.id,
    claimId: citation.claimId,
    sourceSnapshotId: citation.sourceSnapshotId,
    normalizedJobId: citation.normalizedJobId,
    provider: citation.provider,
    providerJobId: citation.providerJobId,
    jobUrl: citation.jobUrl,
    jobTitle: citation.jobTitle,
    department: citation.department,
    location: citation.location,
    sourcePostedAt: toIsoString(citation.sourcePostedAt),
    sourceUpdatedAt: toIsoString(citation.sourceUpdatedAt),
    snapshotFetchedAt: citation.snapshotFetchedAt.toISOString(),
    rawRecordPath: citation.rawRecordPath,
    rawFieldPaths: citation.rawFieldPaths,
    evidenceSha256: citation.evidenceSha256,
  }));

  const evidenceAppendix = Array.from(
    citationRows.reduce((map, citation) => {
      const existing = map.get(citation.normalizedJobId);

      if (existing) {
        existing.citedByClaimIds.push(citation.claimId);
        return map;
      }

      map.set(citation.normalizedJobId, {
        normalizedJobId: citation.normalizedJobId,
        sourceSnapshotId: citation.sourceSnapshotId,
        provider: citation.provider,
        providerJobId: citation.providerJobId,
        jobUrl: citation.jobUrl,
        jobTitle: citation.jobTitle,
        department: citation.department,
        location: citation.location,
        sourcePostedAt: toIsoString(citation.sourcePostedAt),
        sourceUpdatedAt: toIsoString(citation.sourceUpdatedAt),
        snapshotFetchedAt: citation.snapshotFetchedAt.toISOString(),
        rawRecordPath: citation.rawRecordPath,
        rawFieldPaths: citation.rawFieldPaths,
        evidenceSha256: citation.evidenceSha256,
        citedByClaimIds: [citation.claimId],
      });

      return map;
    }, new Map<string, ReportJson["evidenceAppendix"][number]>()).values()
  );

  const snapshotWindow = snapshots
    .map((snapshot) => snapshot.fetchedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  const caveats = [
    ...(analysisOutput?.unknowns.map((text) => ({ type: "unknown", text })) ?? []),
    ...(analysisOutput?.caveats.map((text) => ({ type: "analysis", text })) ?? []),
    ...snapshots
      .filter((snapshot) => snapshot.status === "provider_error")
      .map((snapshot) => ({
        type: "provider_failure",
        text: `${snapshot.provider} failed${snapshot.errorCode ? ` (${snapshot.errorCode})` : ""}${snapshot.errorMessage ? `: ${snapshot.errorMessage}` : "."}`,
      })),
  ];

  const reportWithoutHash = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportVersionId: params.reportVersionId,
    reportRunId: params.reportRunId,
    analysisRunId: params.analysisRunId,
    generatedAt: params.generatedAt.toISOString(),
    publishedAt: params.publishedAt.toISOString(),
    company: {
      companyId: run.companyId,
      displayName: run.displayName,
      canonicalName: run.canonicalName,
      websiteDomain: run.websiteDomain,
    },
    snapshot: {
      asOfTime: run.asOfTime.toISOString(),
      providersQueried: snapshots.map((snapshot) => snapshot.provider),
      providersSucceeded: snapshots
        .filter((snapshot) => snapshot.status === "captured")
        .map((snapshot) => snapshot.provider),
      partialData: params.partialData,
      zeroData: params.zeroData,
      sourceSnapshotIds: snapshots.map((snapshot) => snapshot.id),
      snapshotWindowStart: snapshotWindow[0]?.toISOString() ?? null,
      snapshotWindowEnd: snapshotWindow.at(-1)?.toISOString() ?? null,
    },
    model: {
      provider: analysisRun?.modelProvider ?? null,
      name: analysisRun?.modelName ?? null,
      version: analysisRun?.modelVersion ?? null,
      promptVersion: analysisRun?.promptVersion ?? null,
      inputSha256: analysisRun?.inputSha256 ?? null,
      outputSha256: analysisRun?.outputSha256 ?? null,
    },
    metrics,
    executiveSummary,
    claims: claimPayload,
    citations: citationPayload,
    evidenceAppendix,
    methodology: {
      providers: snapshots.map((snapshot) => ({
        provider: snapshot.provider,
        providerToken: snapshot.providerToken,
        status: snapshot.status,
        sourceSnapshotId: snapshot.id,
      })),
      normalizationRules: [
        "Use persisted normalized_jobs rows only.",
        "Retain provider job identifiers, URLs, timestamps, and raw record paths.",
      ],
      analysisConstraints: [
        "Use only the stored frozen snapshot.",
        "No live ATS calls on the report read path.",
        "No AI calls on the report read path.",
      ],
    },
    caveats,
    integrity: {
      artifactHashes: {},
      rawPayloadHashes: snapshots
        .filter((snapshot) => snapshot.payloadSha256)
        .map((snapshot) => ({
          sourceSnapshotId: snapshot.id,
          provider: snapshot.provider,
          payloadSha256: snapshot.payloadSha256!,
        })),
      publishedBySystemVersion: getSystemVersion(),
    },
  };

  const reportSha256 = buildReportHash(reportWithoutHash);
  const report = reportJsonSchema.parse({
    ...reportWithoutHash,
    integrity: {
      ...reportWithoutHash.integrity,
      reportSha256,
    },
  });

  return {
    report,
    reportSha256,
    templateVersion: REPORT_TEMPLATE_VERSION,
  };
}
