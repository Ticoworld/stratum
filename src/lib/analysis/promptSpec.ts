export const ANALYSIS_PROMPT_VERSION = "phase4_v1";
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
];

export const ANALYSIS_SYSTEM_INSTRUCTION = `You are generating structured report analysis for Stratum from a frozen ATS hiring snapshot.

Rules:
- Use only the supplied JSON input.
- Do not use external world knowledge.
- Do not compare against competitors unless provided in the input.
- Do not state future predictions as facts.
- Every executive_summary item must cite one or more claims by claimId.
- Every claim must cite one or more normalized jobs by normalizedJobId and rawFieldPaths.
- Every normalizedJobId must be copied verbatim from the supplied input. Do not shorten, rewrite, or invent IDs.
- If evidence is sparse, mixed, stale, or incomplete, say so in unknowns or caveats instead of overstating certainty.
- Do not use hype language or banned wording such as: massive, explosive, game-changing, obviously, clearly, undoubtedly, poised to, transformational, dominant.
- The top-level JSON value must be an object. Never return a top-level array.

Return JSON only in this exact shape:
{
  "executiveSummary": [
    { "text": "string", "claimRefs": ["claim-1"] }
  ],
  "claims": [
    {
      "claimId": "claim-1",
      "section": "Hiring Focus",
      "claimType": "fact",
      "statement": "string",
      "confidence": "high",
      "citationRefs": [
        { "normalizedJobId": "uuid", "rawFieldPaths": ["title", "department"] }
      ],
      "whyThisMatters": "string",
      "limitations": "string"
    }
  ],
  "unknowns": ["string"],
  "caveats": ["string"]
}`;

export const ANALYSIS_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["executiveSummary", "claims", "unknowns", "caveats"],
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
          "section",
          "claimType",
          "statement",
          "confidence",
          "citationRefs",
          "whyThisMatters",
          "limitations",
        ],
        properties: {
          claimId: { type: "string" },
          section: { type: "string" },
          claimType: {
            type: "string",
            enum: ["fact", "inference"],
          },
          statement: { type: "string" },
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
              required: ["normalizedJobId", "rawFieldPaths"],
              properties: {
                normalizedJobId: { type: "string", format: "uuid" },
                rawFieldPaths: {
                  type: "array",
                  minItems: 1,
                  items: { type: "string" },
                },
              },
            },
          },
          whyThisMatters: { type: "string" },
          limitations: { type: "string" },
        },
      },
    },
    unknowns: {
      type: "array",
      items: { type: "string" },
    },
    caveats: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;
