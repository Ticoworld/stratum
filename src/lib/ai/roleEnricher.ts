import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";
import type { Job } from "@/lib/api/boards";
import {
  type AiRoleEnrichment,
  type AiRoleEnrichmentStatus,
  type AiRoleEnrichmentBusinessFunction,
  type AiRoleEnrichmentBusinessTheme,
  type AiRoleEnrichmentSeniority,
  type AiRoleEnrichmentMeta,
  buildEnrichmentRoleKey,
} from "@/lib/signals/roleEnrichment";

const BATCH_SIZE = 25;
const MAX_ROLES = 200;
const BATCH_TIMEOUT_MS = 25_000;

export interface RoleEnrichmentResult {
  enrichments: Record<string, AiRoleEnrichment>;
  status: AiRoleEnrichmentStatus;
  enrichedCount: number;
  totalRoles: number;
  batchesAttempted: number;
  batchesFailed: number;
  meta: AiRoleEnrichmentMeta;
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

export interface ParsedBatch {
  validEnrichments: AiRoleEnrichment[];
  rejectedCount: number;
  parseFailure: boolean;
}

export function parseEnrichmentBatchResponse(text: string, expectedRoleKeys: string[]): ParsedBatch {
  const result: ParsedBatch = {
    validEnrichments: [],
    rejectedCount: 0,
    parseFailure: false,
  };

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
    if (!Array.isArray(parsed)) {
      result.parseFailure = true;
      return result;
    }

    const expectedKeysSet = new Set(expectedRoleKeys);
    
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        result.rejectedCount++;
        continue;
      }

      if (typeof entry.roleKey !== "string" || !expectedKeysSet.has(entry.roleKey)) {
        result.rejectedCount++;
        continue;
      }

      // AI-2F: Enum normalization
      const normalizeEnum = (val: unknown) => String(val || "").trim().toLowerCase().replace(/[\s-]/g, "_");
      
      const businessFunction = normalizeEnum(entry.businessFunction) as AiRoleEnrichmentBusinessFunction;
      const businessTheme = normalizeEnum(entry.businessTheme) as AiRoleEnrichmentBusinessTheme;
      const seniority = normalizeEnum(entry.seniority) as AiRoleEnrichmentSeniority;

      if (!ALLOWED_FUNCTIONS.has(businessFunction) || 
          !ALLOWED_THEMES.has(businessTheme) || 
          !ALLOWED_SENIORITIES.has(seniority)) {
        result.rejectedCount++;
        continue;
      }

      if (entry.confidence !== "high" && entry.confidence !== "medium" && entry.confidence !== "low") {
        result.rejectedCount++;
        continue;
      }
      
      if (!Array.isArray(entry.strategicTags) || entry.strategicTags.length > 3) {
        result.rejectedCount++;
        continue;
      }

      if (typeof entry.evidenceReason !== "string" || entry.evidenceReason.trim().length === 0) {
        result.rejectedCount++;
        continue;
      }

      result.validEnrichments.push({
        ...entry,
        businessFunction,
        businessTheme,
        seniority,
      });
    }

    return result;
  } catch {
    result.parseFailure = true;
    return result;
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
  
  const emptyResult = (status: AiRoleEnrichmentStatus): RoleEnrichmentResult => ({
    enrichments: {},
    status,
    enrichedCount: 0,
    totalRoles: jobs.length,
    batchesAttempted: 0,
    batchesFailed: 0,
    meta: {
      attemptedCount: 0,
      enrichedCount: 0,
      failedBatchCount: 0,
      parseFailureCount: 0,
      rejectedRowCount: 0,
      truncated: false,
      batchSize: BATCH_SIZE,
    },
  });

  if (!isEnabled || jobs.length === 0 || !isGeminiAvailable() || process.env.STRATUM_E2E_DISABLE_GEMINI === "1") {
    return emptyResult("disabled");
  }

  const client = getGeminiClient();
  if (!client) {
    return emptyResult("disabled");
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

  const initialChunks: typeof jobInputs[] = [];
  for (let i = 0; i < jobInputs.length; i += BATCH_SIZE) {
    initialChunks.push(jobInputs.slice(i, i + BATCH_SIZE));
  }

  let batchesFailed = 0;
  let parseFailureCount = 0;
  let rejectedRowCount = 0;

  async function processBatch(chunk: typeof jobInputs, isRetry = false): Promise<boolean> {
    const expectedKeys = chunk.map(j => j.roleKey);
    const prompt = buildPrompt(companyName, chunk);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
      
      const response = await client!.models.generateContent({
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
        console.warn(`[Stratum AI-2F] Empty response from Gemini (retry=${isRetry})`);
        return false;
      }

      const parsed = parseEnrichmentBatchResponse(text, expectedKeys);
      if (parsed.parseFailure) {
        parseFailureCount++;
        console.warn(`[Stratum AI-2F] JSON parse failure (retry=${isRetry})`);
        return false;
      }

      rejectedRowCount += parsed.rejectedCount;

      if (parsed.validEnrichments.length === 0 && chunk.length > 0) {
        console.warn(`[Stratum AI-2F] Zero valid rows recovered from batch (retry=${isRetry})`);
        return false;
      }

      for (const entry of parsed.validEnrichments) {
        const originalJob = chunk.find(j => j.roleKey === entry.roleKey);
        if (originalJob) {
          entry.title = originalJob.title;
        }
        enrichments[entry.roleKey] = entry;
      }

      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[Stratum AI-2F] Gemini API call failed (retry=${isRetry}): ${message}`);
      return false;
    }
  }

  for (const chunk of initialChunks) {
    const success = await processBatch(chunk);
    
    if (!success) {
      // AI-2F: Retry once with smaller chunks if the main batch failed
      batchesFailed++;
      console.log(`[Stratum AI-2F] Batch failed. Attempting retry with sub-chunks...`);
      
      const subChunks: typeof jobInputs[] = [];
      const SUB_BATCH_SIZE = Math.ceil(BATCH_SIZE / 2);
      for (let i = 0; i < chunk.length; i += SUB_BATCH_SIZE) {
        subChunks.push(chunk.slice(i, i + SUB_BATCH_SIZE));
      }

      for (const subChunk of subChunks) {
        const subSuccess = await processBatch(subChunk, true);
        if (!subSuccess) {
          // We don't increment batchesFailed again for sub-chunks to avoid double counting
          // but we do log it.
          console.warn(`[Stratum AI-2F] Sub-chunk retry failed.`);
        }
      }
    }
  }

  const enrichedCount = Object.keys(enrichments).length;
  let status: AiRoleEnrichmentStatus = "complete";
  
  if (batchesFailed === initialChunks.length && enrichedCount === 0) {
    status = "failed";
  } else if (batchesFailed > 0 || truncated || enrichedCount < jobInputs.length) {
    status = "partial";
  }

  return {
    enrichments,
    status,
    enrichedCount,
    totalRoles: jobs.length,
    batchesAttempted: initialChunks.length,
    batchesFailed,
    meta: {
      attemptedCount: jobInputs.length,
      enrichedCount,
      failedBatchCount: batchesFailed,
      parseFailureCount,
      rejectedRowCount,
      truncated,
      batchSize: BATCH_SIZE,
    },
  };
}
