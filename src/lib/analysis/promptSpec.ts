import { ALLOWED_CLAIM_FAMILIES, ALLOWED_CLAIM_LABELS } from "@/lib/analysis/claimTaxonomy";

export const ANALYSIS_PROMPT_VERSION = "phase4_v2";
export const ANALYSIS_MODEL_PROVIDER = "google";
export const ANALYSIS_MODEL_NAME = "gemini-3-flash-preview";
export const ANALYSIS_MODEL_VERSION = "gemini-3-flash-preview";

export const BANNED_ANALYSIS_PHRASES = [
  "massive",
  "explosive",
  "game-changing",
  "obviously",
  "clearly",
  "undoubtedly",
  "poised to",
  "transformational",
  "dominant",
  "aggressive",
  "aggressively",
  "proves that",
  "confirms that",
  "organization-wide",
  "company-wide",
  "enterprise-wide",
  "aggressive expansion",
  "rapid expansion",
  "strategic pivot",
];

export const ANALYSIS_SYSTEM_INSTRUCTION = `You are generating structured report analysis for Stratum from a frozen ATS hiring snapshot.

Rules:
- Use only the supplied JSON input.
- Do not use external world knowledge.
- Do not compare against competitors unless provided in the input.
- Do not state future predictions as facts.
- Treat input.evidenceSummary as the primary analysis substrate. Use normalizedJobs only to choose exact citationRefs and sample evidence.
- Every executive_summary item must cite one or more claims by claimId.
- Every claim must cite one or more jobs by evidenceRef and rawFieldPaths.
- Every evidenceRef must be copied verbatim from the supplied input. Do not shorten, rewrite, or invent IDs.
- Do not mention internal ids, UUIDs, database keys, or snapshot ids anywhere in the output text.
- Keep the language executive-readable. Avoid internal implementation wording.
- If evidence is sparse, mixed, stale, or incomplete, say so in caveats instead of overstating certainty.
- If datasetAssessment says evidence is weak or limited, keep conclusions narrow, avoid broad strategy claims, and lower confidence accordingly.
- Do not use hype language or banned wording such as: massive, explosive, game-changing, obviously, clearly, undoubtedly, poised to, transformational, dominant.
- Allowed claim families only: ${ALLOWED_CLAIM_FAMILIES.join(", ")}.
- Allowed claim labels only: ${ALLOWED_CLAIM_LABELS.join(", ")}.
- Do not infer business strategy, revenue expansion, market penetration, product roadmap, public-sector expansion, pipeline quality, contracts, or new revenue streams.
- Statement templates must stay bounded to hiring data. Use patterns like:
  - hiring_focus: "Hiring is concentrated in ..."
  - geography_distribution: "Open roles are concentrated in ..." or "Open roles in ... suggest hiring activity across those locations."
  - department_mix: "Department mix is led by ..."
  - seniority_mix: "Seniority mix is weighted toward ..."
  - posting_age: "A share of roles were posted more than ..."
  - explicit_role_theme: "Repeated role themes include ..."
  - provider_coverage: "Provider coverage includes ..."
  - dataset_limit: "This snapshot is limited by ..."
- Executive summary bullets must restate already-supported claims. They are not a second chance to invent broader implications.
- The top-level JSON value must be an object. Never return a top-level array.

Return JSON only in this exact shape:
{
  "executiveSummary": [
    { "text": "string", "claimRefs": ["claim-1"] }
  ],
  "claims": [
    {
      "claimId": "claim-1",
      "claimType": "hiring_focus",
      "label": "Observed hiring signal",
      "statement": "string",
      "whyItMatters": "string",
      "confidence": "high",
      "citationRefs": [
        { "evidenceRef": "job-001", "rawFieldPaths": ["title", "department"] }
      ]
    }
  ],
  "caveats": ["string"]
}`;

export const ANALYSIS_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["executiveSummary", "claims", "caveats"],
  properties: {
    executiveSummary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "claimRefs"],
        properties: {
          text: { type: "string" },
          claimRefs: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
        },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "claimId",
          "claimType",
          "label",
          "statement",
          "whyItMatters",
          "confidence",
          "citationRefs",
        ],
        properties: {
          claimId: { type: "string" },
          claimType: {
            type: "string",
            enum: [...ALLOWED_CLAIM_FAMILIES],
          },
          label: {
            type: "string",
            enum: [...ALLOWED_CLAIM_LABELS],
          },
          statement: { type: "string" },
          whyItMatters: { type: "string" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          citationRefs: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["evidenceRef", "rawFieldPaths"],
              properties: {
                evidenceRef: {
                  type: "string",
                  pattern: "^job-[0-9]{3,}$",
                },
                rawFieldPaths: {
                  type: "array",
                  minItems: 1,
                  items: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    caveats: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;
