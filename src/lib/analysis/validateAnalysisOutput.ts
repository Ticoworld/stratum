import { z } from "zod";
import type { AnalysisInputContext } from "@/lib/analysis/buildAnalysisInput";
import {
  ALLOWED_CLAIM_FAMILIES,
  ALLOWED_CLAIM_LABELS,
  buildCanonicalWhyItMatters,
  buildExecutiveSummaryLine,
  matchesClaimFamilyTemplate,
  supportsClaimLabel,
  type ClaimFamily,
  type ClaimLabel,
} from "@/lib/analysis/claimTaxonomy";
import type { ConfidenceLevel } from "@/lib/analysis/datasetAssessment";
import { presentProviderName } from "@/lib/reports/presentation";

const citationRefSchema = z.union([
  z.object({
    evidenceRef: z.string().regex(/^job-\d{3,}$/),
    rawFieldPaths: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    normalizedJobId: z.string().uuid(),
    rawFieldPaths: z.array(z.string().trim().min(1)).min(1),
  }),
]);

const claimSchema = z.object({
  claimId: z.string().trim().min(1),
  claimType: z.enum(ALLOWED_CLAIM_FAMILIES),
  label: z.enum(ALLOWED_CLAIM_LABELS),
  statement: z.string().trim().min(1),
  whyItMatters: z.string().trim().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  citationRefs: z.array(citationRefSchema).min(1),
});

const executiveSummaryItemSchema = z.object({
  text: z.string().trim().min(1),
  claimRefs: z.array(z.string().trim().min(1)).min(1),
});

const analysisOutputSchema = z.object({
  executiveSummary: z.array(executiveSummaryItemSchema),
  claims: z.array(claimSchema),
  caveats: z.array(z.string().trim().min(1)),
});

export type ValidatedAnalysisOutput = z.infer<typeof analysisOutputSchema>;

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const EVIDENCE_REF_PATTERN = /\bjob-\d{3,}\b/i;
const SNAPSHOT_REF_PATTERN = /\bsnapshot-\d{2,}\b/i;

const UNSUPPORTED_OUTCOME_SUBJECTS = [
  "company is",
  "company appears",
  "represents",
  "new revenue",
  "revenue stream",
  "market expansion",
  "product roadmap",
  "public sector",
  "government",
  "contracts",
  "pipeline",
  "stablecoin",
  "cross-border",
  "settlement",
  "global liquidity",
  "business-model",
];

const ALLOWED_CAVEAT_PREFIXES = [
  "This snapshot is limited by ",
  "This report is limited by ",
  "The dataset is limited by ",
  "Only ",
  "A share of roles were posted more than ",
  "The captured roles do not show ",
  "Provider coverage includes ",
  "Captured provider coverage includes ",
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clampConfidence(value: ConfidenceLevel, maximum: ConfidenceLevel): ConfidenceLevel {
  const rank: Record<ConfidenceLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  return rank[value] <= rank[maximum] ? value : maximum;
}

function resolveCitationRefJobId(
  citationRef: ValidatedAnalysisOutput["claims"][number]["citationRefs"][number],
  context: AnalysisInputContext
) {
  if ("evidenceRef" in citationRef) {
    return context.jobsByEvidenceRef.get(citationRef.evidenceRef)?.normalizedJobId ?? null;
  }

  return citationRef.normalizedJobId;
}

function assertNoInternalIdentifierLeak(value: string, path: string) {
  if (UUID_PATTERN.test(value)) {
    throw new Error(`Structured analysis leaked an internal UUID in ${path}.`);
  }

  if (EVIDENCE_REF_PATTERN.test(value) || SNAPSHOT_REF_PATTERN.test(value)) {
    throw new Error(`Structured analysis leaked an internal evidence alias in ${path}.`);
  }
}

function assertNoUnsupportedImplication(value: string, claimType: ClaimFamily, path: string) {
  const normalized = value.toLowerCase();

  for (const marker of UNSUPPORTED_OUTCOME_SUBJECTS) {
    if (normalized.includes(marker)) {
      throw new Error(
        `Structured analysis exceeded the ${claimType} taxonomy with unsupported implication "${marker}" in ${path}.`
      );
    }
  }

  if (normalized.includes("confirms") || normalized.includes("proves")) {
    throw new Error(`Structured analysis used decisive unsupported language in ${path}.`);
  }
}

function assertClaimStatementFitsFamily(
  claimType: ClaimFamily,
  label: ClaimLabel,
  statement: string,
  path: string
) {
  if (!supportsClaimLabel(claimType, label)) {
    throw new Error(`Structured analysis used unsupported label "${label}" for ${claimType}.`);
  }

  if (!matchesClaimFamilyTemplate(claimType, statement)) {
    throw new Error(
      `Structured analysis statement for ${claimType} does not match an allowed template in ${path}.`
    );
  }

  assertNoUnsupportedImplication(statement, claimType, path);
}

function deriveExecutiveSummary(
  parsed: z.infer<typeof analysisOutputSchema>
): ValidatedAnalysisOutput["executiveSummary"] {
  const claimById = new Map(parsed.claims.map((claim) => [claim.claimId, claim]));
  const orderedClaimIds = Array.from(
    new Set([
      ...parsed.executiveSummary.flatMap((item) => item.claimRefs),
      ...parsed.claims.map((claim) => claim.claimId),
    ])
  );

  return orderedClaimIds.slice(0, 4).flatMap((claimId, index) => {
    const claim = claimById.get(claimId);

    if (!claim) {
      return [];
    }

    return [
      {
        text: buildExecutiveSummaryLine(claim.statement),
        claimRefs: [claim.claimId],
      },
    ].map((item, summaryIndex) => ({
      ...item,
      claimRefs: item.claimRefs,
      text: item.text,
      order: index + summaryIndex + 1,
    }));
  }).map(({ text, claimRefs }) => ({ text, claimRefs }));
}

function buildDeterministicCaveats(context: AnalysisInputContext) {
  const caveats = [...context.input.datasetAssessment.deterministicCaveats];

  if (context.input.evidenceSummary.providerCoverage.providerCount === 1) {
    caveats.push(
      `Provider coverage includes only ${presentProviderName(
        context.input.evidenceSummary.providerCoverage.capturedProviders[0]
      )}.`
    );
  }

  return Array.from(new Set(caveats.map((text) => normalizeWhitespace(text))));
}

function validateModelCaveat(caveat: string) {
  const trimmed = normalizeWhitespace(caveat);

  if (ALLOWED_CAVEAT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    assertNoInternalIdentifierLeak(trimmed, "caveat");
    return trimmed;
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

  const claims = parsed.claims.map((claim) => {
    if (seenClaimIds.has(claim.claimId)) {
      throw new Error(`Structured analysis returned duplicate claimId "${claim.claimId}".`);
    }

    seenClaimIds.add(claim.claimId);

    const statement = normalizeWhitespace(claim.statement);
    assertNoInternalIdentifierLeak(statement, `claim "${claim.claimId}" statement`);
    assertClaimStatementFitsFamily(
      claim.claimType,
      claim.label,
      statement,
      `claim "${claim.claimId}" statement`
    );

    for (const citationRef of claim.citationRefs) {
      const normalizedJobId = resolveCitationRefJobId(citationRef, context);

      if (!normalizedJobId || !context.jobsById.has(normalizedJobId)) {
        throw new Error(
          `Structured analysis cited unknown job reference in claim "${claim.claimId}".`
        );
      }
    }

    return {
      ...claim,
      statement,
      whyItMatters: buildCanonicalWhyItMatters(claim.claimType, claim.label),
      confidence: clampConfidence(
        claim.confidence,
        context.input.datasetAssessment.confidenceCap
      ),
    };
  });

  const executiveSummary = deriveExecutiveSummary({
    ...parsed,
    claims,
  });

  for (const item of executiveSummary) {
    assertNoInternalIdentifierLeak(item.text, "executive summary");

    for (const claimRef of item.claimRefs) {
      if (!seenClaimIds.has(claimRef)) {
        throw new Error(`Executive summary referenced unknown claimId "${claimRef}".`);
      }
    }
  }

  const modelCaveats = parsed.caveats
    .map((caveat) => validateModelCaveat(caveat))
    .filter((caveat): caveat is string => Boolean(caveat));
  const caveats = Array.from(
    new Set([...buildDeterministicCaveats(context), ...modelCaveats])
  );

  if (
    context.input.datasetAssessment.evidenceStrength !== "strong" &&
    caveats.length === 0
  ) {
    throw new Error("Structured analysis is missing required dataset caveats for a weak or limited snapshot.");
  }

  return {
    executiveSummary,
    claims,
    caveats,
  };
}
