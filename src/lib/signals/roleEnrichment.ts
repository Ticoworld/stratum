import type { Job } from "@/lib/api/boards";

export type AiRoleEnrichmentBusinessFunction =
  | "engineering"
  | "product"
  | "data_governance"
  | "data_science"
  | "credit_risk"
  | "compliance"
  | "sales"
  | "marketing"
  | "operations"
  | "finance"
  | "customer_success"
  | "security"
  | "legal"
  | "people"
  | "other";

export type AiRoleEnrichmentBusinessTheme =
  | "core_platform"
  | "data_control_infrastructure"
  | "credit_and_lending"
  | "risk_and_compliance"
  | "go_to_market"
  | "customer_operations"
  | "regional_operations"
  | "product_execution"
  | "finance_and_treasury"
  | "internal_operations"
  | "unknown";

export type AiRoleEnrichmentSeniority =
  | "executive"
  | "leadership"
  | "senior"
  | "mid"
  | "junior"
  | "unknown";

export type AiRoleEnrichmentStatus =
  | "complete"
  | "partial"
  | "failed"
  | "disabled";

export interface AiRoleEnrichment {
  roleKey: string;        // stable identity key (see below)
  title: string;          // echoed from input for traceability
  businessFunction: AiRoleEnrichmentBusinessFunction;
  businessTheme: AiRoleEnrichmentBusinessTheme;
  seniority: AiRoleEnrichmentSeniority;
  strategicTags: string[];    // 0-3 short strings
  evidenceReason: string;     // 1 sentence, title/dept only
  confidence: "high" | "medium" | "low";
}

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
}

function normalizeTitle(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/\bsr\b/g, "senior")
    .replace(/\beng\b/g, "engineering");
}

function normalizeLocation(value: string | null | undefined): string {
  const norm = normalizeText(value);
  if (norm === "remote us" || norm === "remote, us" || norm === "remote  us") return "remote";
  return norm;
}

/**
 * Note: This intentionally mirrors buildRoleSignature from history.ts
 * It is duplicated here to avoid a circular dependency between the AI
 * module and the taxonomy/history module.
 */
export function buildEnrichmentRoleKey(job: Pick<Job, "roleId" | "jobUrl" | "requisitionId" | "title" | "department" | "location" | "source">): string {
  if (job.roleId)        return `id::${job.source}::${job.roleId}`;
  if (job.jobUrl)        return `url::${job.jobUrl}`;
  if (job.requisitionId) return `req::${job.source}::${job.requisitionId}`;

  // Fallback: content-based, same style as buildRoleSignature()
  return [
    "text",
    normalizeTitle(job.title),
    normalizeText(job.department),
    normalizeLocation(job.location),
    normalizeText(job.source),
  ].join("::");
}
