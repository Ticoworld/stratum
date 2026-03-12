import { z } from "zod";
import type { AnalysisInputContext } from "@/lib/analysis/buildAnalysisInput";
import { BANNED_ANALYSIS_PHRASES } from "@/lib/analysis/promptSpec";

const citationRefSchema = z.object({
  normalizedJobId: z.string().uuid(),
  rawFieldPaths: z.array(z.string().trim().min(1)).min(1),
});

const claimSchema = z.object({
  claimId: z.string().trim().min(1),
  section: z.string().trim().min(1),
  claimType: z.enum(["fact", "inference"]),
  statement: z.string().trim().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  citationRefs: z.array(citationRefSchema).min(1),
  whyThisMatters: z.string().trim().min(1),
  limitations: z.string().trim().min(1),
});

const executiveSummaryItemSchema = z.object({
  text: z.string().trim().min(1),
  claimRefs: z.array(z.string().trim().min(1)).min(1),
});

const analysisOutputSchema = z.object({
  executiveSummary: z.array(executiveSummaryItemSchema),
  claims: z.array(claimSchema),
  unknowns: z.array(z.string().trim().min(1)),
  caveats: z.array(z.string().trim().min(1)),
});

export type ValidatedAnalysisOutput = z.infer<typeof analysisOutputSchema>;

function containsBannedPhrase(value: string): string | null {
  const normalized = value.toLowerCase();

  for (const phrase of BANNED_ANALYSIS_PHRASES) {
    if (normalized.includes(phrase)) {
      return phrase;
    }
  }

  return null;
}

export function parseStructuredAnalysisResponse(value: string): unknown {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export function validateAnalysisOutput(
  rawOutput: unknown,
  context: AnalysisInputContext
): ValidatedAnalysisOutput {
  const parsed = analysisOutputSchema.parse(rawOutput);

  if (context.input.normalizedJobs.length > 0 && parsed.claims.length === 0) {
    throw new Error("Structured analysis returned zero claims for a non-zero-data run.");
  }

  const seenClaimIds = new Set<string>();

  for (const claim of parsed.claims) {
    if (seenClaimIds.has(claim.claimId)) {
      throw new Error(`Structured analysis returned duplicate claimId "${claim.claimId}".`);
    }

    seenClaimIds.add(claim.claimId);

    const bannedPhrase =
      containsBannedPhrase(claim.statement) ||
      containsBannedPhrase(claim.whyThisMatters) ||
      containsBannedPhrase(claim.limitations);

    if (bannedPhrase) {
      throw new Error(`Structured analysis used banned phrase "${bannedPhrase}" in claim output.`);
    }

    for (const citationRef of claim.citationRefs) {
      if (!context.jobsById.has(citationRef.normalizedJobId)) {
        throw new Error(
          `Structured analysis cited unknown normalized job "${citationRef.normalizedJobId}".`
        );
      }
    }
  }

  for (const summaryItem of parsed.executiveSummary) {
    const bannedPhrase = containsBannedPhrase(summaryItem.text);

    if (bannedPhrase) {
      throw new Error(
        `Structured analysis used banned phrase "${bannedPhrase}" in executive summary.`
      );
    }

    for (const claimRef of summaryItem.claimRefs) {
      if (!seenClaimIds.has(claimRef)) {
        throw new Error(`Executive summary referenced unknown claimId "${claimRef}".`);
      }
    }
  }

  return parsed;
}
