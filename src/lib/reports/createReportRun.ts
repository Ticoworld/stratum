import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { companies, reportRuns } from "@/db/schema";
import { assertReportCreationReady } from "@/lib/deployment/readiness";
import { resolveCompany } from "@/lib/providers/ats/resolveCompany";

const optionalWebsiteDomain = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed.toLowerCase();
  },
  z.string().max(255).optional()
);

export const createReportRunInputSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(100, "Company name must be 100 characters or less"),
  websiteDomain: optionalWebsiteDomain,
});

export type CreateReportRunInput = z.infer<typeof createReportRunInputSchema>;

export interface CreateReportRunParams extends CreateReportRunInput {
  tenantId: string;
  requestedByUserId?: string;
  triggerType?: string;
}

export interface CreateReportRunResult {
  reportRunId: string;
  companyId: string;
  status: string;
}

async function upsertCompanyForRun(params: {
  tenantId: string;
  companyName: string;
  websiteDomain?: string;
}) {
  const resolved = resolveCompany(params.companyName);
  const now = new Date();

  const existing = await db.query.companies.findFirst({
    where: and(
      eq(companies.tenantId, params.tenantId),
      eq(companies.canonicalName, resolved.canonicalName)
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(companies)
      .set({
        displayName: resolved.normalizedName,
        websiteDomain: params.websiteDomain ?? existing.websiteDomain,
        resolutionStatus: "pending",
        updatedAt: now,
      })
      .where(eq(companies.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(companies)
    .values({
      id: randomUUID(),
      tenantId: params.tenantId,
      displayName: resolved.normalizedName,
      canonicalName: resolved.canonicalName,
      websiteDomain: params.websiteDomain ?? null,
      resolutionStatus: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

export async function createReportRun(
  params: CreateReportRunParams
): Promise<CreateReportRunResult> {
  await assertReportCreationReady();

  const input = createReportRunInputSchema.parse({
    companyName: params.companyName,
    websiteDomain: params.websiteDomain,
  });

  const company = await upsertCompanyForRun({
    tenantId: params.tenantId,
    companyName: input.companyName,
    websiteDomain: input.websiteDomain,
  });

  const reportRunId = randomUUID();
  const now = new Date();

  await db.insert(reportRuns).values({
    id: reportRunId,
    tenantId: params.tenantId,
    companyId: company.id,
    requestedByUserId: params.requestedByUserId ?? null,
    triggerType: params.triggerType ?? "manual",
    requestedCompanyName: input.companyName,
    asOfTime: now,
    status: "queued",
    attemptCount: 1,
    createdAt: now,
  });

  return {
    reportRunId,
    companyId: company.id,
    status: "queued",
  };
}
