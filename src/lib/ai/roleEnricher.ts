import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";
import type { Job } from "@/lib/api/boards";
import {
  type AiRoleEnrichment,
  type AiRoleEnrichmentStatus,
  type AiRoleEnrichmentBusinessFunction,
  type AiRoleEnrichmentBusinessTheme,
  type AiRoleEnrichmentSeniority,
  buildEnrichmentRoleKey,
} from "@/lib/signals/roleEnrichment";

const BATCH_SIZE = 50;
const MAX_ROLES = 200;
const BATCH_TIMEOUT_MS = 15_000;

export interface RoleEnrichmentResult {
  enrichments: Record<string, AiRoleEnrichment>;
  status: AiRoleEnrichmentStatus;
  enrichedCount: number;
  totalRoles: number;
  batchesAttempted: number;
  batchesFailed: number;
}

const ALLOWED_FUNCTIONS = new Set<AiRoleEnrichmentBusinessFunction>([
  "engineering", "product", "data_governance", "data_science", "credit_risk",
  "compliance", "sales", "marketing", "operations", "finance",
  "customer_success", "security", "legal", "people", "other"
]);

const ALLOWED_THEMES = new Set<AiRoleEnrichmentBusinessTheme>([
  "core_platform", "data_control_infrastructure", "credit_and_lending",
  "risk_and_compliance", "go_to_market", "customer_operations",
  "regional_operations", "product_execution", "finance_and_treasury",
  "internal_operations", "unknown"
]);

const ALLOWED_SENIORITIES = new Set<AiRoleEnrichmentSeniority>([
  "executive", "leadership", "senior", "mid", "junior", "unknown"
]);

export function parseEnrichmentBatchResponse(text: string, expectedRoleKeys: string[]): AiRoleEnrichment[] | null {
  try {
    let jsonString = text.trim();
    const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonString = jsonBlockMatch[1].trim();
    } else {
      const first = jsonString.indexOf("[");
      const last = jsonString.lastIndexOf("]");
      if (first !== -1 && last > first) {
        jsonString = jsonString.slice(first, last + 1);
      }
    }

    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return null;
    if (parsed.length !== expectedRoleKeys.length) return null;

    const expectedKeysSet = new Set(expectedRoleKeys);
    
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") return null;
      if (typeof entry.roleKey !== "string" || !expectedKeysSet.has(entry.roleKey)) return null;
      if (!ALLOWED_FUNCTIONS.has(entry.businessFunction)) return null;
      if (!ALLOWED_THEMES.has(entry.businessTheme)) return null;
      if (!ALLOWED_SENIORITIES.has(entry.seniority)) return null;
      if (entry.confidence !== "high" && entry.confidence !== "medium" && entry.confidence !== "low") return null;
      
      if (!Array.isArray(entry.strategicTags) || entry.strategicTags.length > 3) return null;
      if (typeof entry.evidenceReason !== "string" || entry.evidenceReason.trim().length === 0) return null;
    }

    return parsed as AiRoleEnrichment[];
  } catch {
    return null;
  }
}

function buildPrompt(companyName: string, batchJobs: Array<{ roleKey: string; title: string; department: string; location: string }>): string {
  const systemInstruction = `You are a hiring signal classifier. Classify each role strictly from its title, department, and location.
Do not infer company strategy. Do not reference company name for classification.
Use only the allowed values listed below for businessFunction, businessTheme, seniority.
Return ONLY a valid JSON array of exactly ${batchJobs.length} objects.

Allowed businessFunction values: ${Array.from(ALLOWED_FUNCTIONS).join(", ")}
Allowed businessTheme values: ${Array.from(ALLOWED_THEMES).join(", ")}
Allowed seniority values: ${Array.from(ALLOWED_SENIORITIES).join(", ")}

User message:
Classify these ${batchJobs.length} roles for company: ${companyName}

${JSON.stringify(batchJobs, null, 2)}

Return one object per role in the same order.
Each object: { "roleKey": string, "businessFunction": string, "businessTheme": string, "seniority": string, "strategicTags": string[], "evidenceReason": string, "confidence": "high"|"medium"|"low" }`;
  return systemInstruction;
}

export async function runRoleEnrichment(
  companyName: string,
  jobs: Job[]
): Promise<RoleEnrichmentResult> {
  const isEnabled = process.env.STRATUM_ENABLE_ROLE_ENRICHMENT === "1";
  
  if (!isEnabled || jobs.length === 0 || !isGeminiAvailable() || process.env.STRATUM_E2E_DISABLE_GEMINI === "1") {
    return {
      enrichments: {},
      status: "disabled",
      enrichedCount: 0,
      totalRoles: jobs.length,
      batchesAttempted: 0,
      batchesFailed: 0,
    };
  }

  const client = getGeminiClient();
  if (!client) {
    return {
      enrichments: {},
      status: "disabled",
      enrichedCount: 0,
      totalRoles: jobs.length,
      batchesAttempted: 0,
      batchesFailed: 0,
    };
  }

  const enrichments: Record<string, AiRoleEnrichment> = {};
  
  let targetJobs = jobs;
  let truncated = false;
  if (targetJobs.length > MAX_ROLES) {
    targetJobs = targetJobs.slice(0, MAX_ROLES);
    truncated = true;
    console.warn(`[Stratum AI-1B] Truncating jobs from ${jobs.length} to ${MAX_ROLES} for enrichment`);
  }

  const jobInputs = targetJobs.map(job => ({
    roleKey: buildEnrichmentRoleKey(job),
    title: job.title || "",
    department: job.department || "",
    location: job.location || "",
  }));

  const chunks: typeof jobInputs[] = [];
  for (let i = 0; i < jobInputs.length; i += BATCH_SIZE) {
    chunks.push(jobInputs.slice(i, i + BATCH_SIZE));
  }

  let batchesFailed = 0;

  for (const chunk of chunks) {
    const expectedKeys = chunk.map(j => j.roleKey);
    const prompt = buildPrompt(companyName, chunk);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
      
      const response = await client.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });
      
      clearTimeout(timeout);

      const text = response.text;
      if (!text) {
        batchesFailed++;
        console.warn(`[Stratum AI-1B] Empty text response from Gemini`);
        continue;
      }

      const parsed = parseEnrichmentBatchResponse(text, expectedKeys);
      if (!parsed) {
        batchesFailed++;
        console.warn(`[Stratum AI-1B] Failed to parse JSON batch`);
        continue;
      }

      for (const entry of parsed) {
        // Echo the original title to avoid hallucinated titles
        const originalJob = chunk.find(j => j.roleKey === entry.roleKey);
        if (originalJob) {
          entry.title = originalJob.title;
        }
        enrichments[entry.roleKey] = entry;
      }
    } catch {
      batchesFailed++;
      console.warn(`[Stratum AI-1B] Gemini API call failed for batch`);
    }
  }

  const enrichedCount = Object.keys(enrichments).length;
  let status: AiRoleEnrichmentStatus = "complete";
  
  if (batchesFailed === chunks.length) {
    status = "failed";
  } else if (batchesFailed > 0 || truncated) {
    status = "partial";
  }

  return {
    enrichments,
    status,
    enrichedCount,
    totalRoles: jobs.length,
    batchesAttempted: chunks.length,
    batchesFailed,
  };
}
