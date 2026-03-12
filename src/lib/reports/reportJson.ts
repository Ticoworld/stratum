import { z } from "zod";

export const reportJsonSchema = z.object({
  schemaVersion: z.string().trim().min(1),
  reportVersionId: z.string().uuid(),
  reportRunId: z.string().uuid(),
  analysisRunId: z.string().uuid().nullable(),
  generatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  company: z.object({
    companyId: z.string().uuid(),
    displayName: z.string().trim().min(1),
    canonicalName: z.string().trim().min(1),
    websiteDomain: z.string().trim().min(1).nullable(),
  }),
  snapshot: z.object({
    asOfTime: z.string().datetime(),
    providersQueried: z.array(z.string().trim().min(1)),
    providersSucceeded: z.array(z.string().trim().min(1)),
    partialData: z.boolean(),
    zeroData: z.boolean(),
    sourceSnapshotIds: z.array(z.string().uuid()),
    snapshotWindowStart: z.string().datetime().nullable(),
    snapshotWindowEnd: z.string().datetime().nullable(),
  }),
  model: z.object({
    provider: z.string().trim().min(1).nullable(),
    name: z.string().trim().min(1).nullable(),
    version: z.string().trim().min(1).nullable(),
    promptVersion: z.string().trim().min(1).nullable(),
    inputSha256: z.string().trim().min(1).nullable(),
    outputSha256: z.string().trim().min(1).nullable(),
  }),
  metrics: z.object({
    totalJobs: z.number().int().nonnegative(),
    departmentCounts: z.array(
      z.object({
        department: z.string().trim().min(1),
        count: z.number().int().nonnegative(),
      })
    ),
    locationCounts: z.array(
      z.object({
        location: z.string().trim().min(1),
        count: z.number().int().nonnegative(),
      })
    ),
    recencyBuckets: z.array(
      z.object({
        bucket: z.string().trim().min(1),
        count: z.number().int().nonnegative(),
      })
    ),
  }),
  executiveSummary: z.array(
    z.object({
      order: z.number().int().positive(),
      text: z.string().trim().min(1),
      claimRefs: z.array(z.string().uuid()),
    })
  ),
  claims: z.array(
    z.object({
      claimId: z.string().uuid(),
      section: z.string().trim().min(1),
      claimType: z.string().trim().min(1),
      statement: z.string().trim().min(1),
      whyItMatters: z.string().trim().min(1),
      confidence: z.string().trim().min(1),
      supportStatus: z.string().trim().min(1),
      citationRefs: z.array(z.string().uuid()).min(1),
    })
  ),
  citations: z.array(
    z.object({
      citationId: z.string().uuid(),
      claimId: z.string().uuid(),
      sourceSnapshotId: z.string().uuid(),
      normalizedJobId: z.string().uuid(),
      provider: z.string().trim().min(1),
      providerJobId: z.string().nullable(),
      jobUrl: z.string().nullable(),
      jobTitle: z.string().trim().min(1),
      department: z.string().nullable(),
      location: z.string().nullable(),
      sourcePostedAt: z.string().datetime().nullable(),
      sourceUpdatedAt: z.string().datetime().nullable(),
      snapshotFetchedAt: z.string().datetime(),
      rawRecordPath: z.string().trim().min(1),
      rawFieldPaths: z.array(z.string().trim().min(1)).min(1),
      evidenceSha256: z.string().trim().min(1),
    })
  ),
  evidenceAppendix: z.array(
    z.object({
      normalizedJobId: z.string().uuid(),
      sourceSnapshotId: z.string().uuid(),
      provider: z.string().trim().min(1),
      providerJobId: z.string().nullable(),
      jobUrl: z.string().nullable(),
      jobTitle: z.string().trim().min(1),
      department: z.string().nullable(),
      location: z.string().nullable(),
      sourcePostedAt: z.string().datetime().nullable(),
      sourceUpdatedAt: z.string().datetime().nullable(),
      snapshotFetchedAt: z.string().datetime(),
      rawRecordPath: z.string().trim().min(1),
      rawFieldPaths: z.array(z.string().trim().min(1)).min(1),
      evidenceSha256: z.string().trim().min(1),
      citedByClaimIds: z.array(z.string().uuid()).min(1),
    })
  ),
  methodology: z.object({
    providers: z.array(
      z.object({
        provider: z.string().trim().min(1),
        providerToken: z.string().trim().min(1),
        status: z.string().trim().min(1),
        sourceSnapshotId: z.string().uuid(),
      })
    ),
    normalizationRules: z.array(z.string().trim().min(1)),
    analysisConstraints: z.array(z.string().trim().min(1)),
  }),
  caveats: z.array(
    z.object({
      type: z.string().trim().min(1),
      text: z.string().trim().min(1),
    })
  ),
  integrity: z.object({
    reportSha256: z.string().trim().min(1),
    artifactHashes: z.record(z.string(), z.string()),
    rawPayloadHashes: z.array(
      z.object({
        sourceSnapshotId: z.string().uuid(),
        provider: z.string().trim().min(1),
        payloadSha256: z.string().trim().min(1),
      })
    ),
    publishedBySystemVersion: z.string().trim().min(1),
  }),
});

export type ReportJson = z.infer<typeof reportJsonSchema>;
