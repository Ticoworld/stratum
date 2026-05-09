import {
  type AiRoleEnrichment,
  type AiRoleEnrichmentStatus,
  type AiSignalCluster,
  type AiRoleEnrichmentBusinessTheme,
  type AiRoleEnrichmentBusinessFunction,
} from "./roleEnrichment";

/**
 * Deterministically builds semantic signal clusters from stored AI role enrichments.
 */
export function buildSignalClusters(
  enrichments: Record<string, AiRoleEnrichment> | undefined | null,
  status: AiRoleEnrichmentStatus
): AiSignalCluster[] {
  if (status === "disabled" || status === "failed" || !enrichments) {
    return [];
  }

  const roles = Object.values(enrichments);
  if (roles.length === 0) {
    return [];
  }

  // Group by businessTheme
  const themeGroups = new Map<AiRoleEnrichmentBusinessTheme, AiRoleEnrichment[]>();

  for (const role of roles) {
    // Skip unhelpful themes if needed, but for now we group everything
    const theme = role.businessTheme;
    if (!themeGroups.has(theme)) {
      themeGroups.set(theme, []);
    }
    themeGroups.get(theme)!.push(role);
  }

  const clusters: AiSignalCluster[] = [];

  for (const [theme, groupRoles] of themeGroups.entries()) {
    if (theme === "unknown") continue;

    const clusterKey = `theme::${theme}`;
    const label = formatThemeLabel(theme);
    const roleKeys = groupRoles.map((r) => r.roleKey);
    const roleCount = groupRoles.length;
    
    // Aggregates
    const functions = Array.from(new Set(groupRoles.map((r) => r.businessFunction)));
    const allTags = groupRoles.flatMap((r) => r.strategicTags || []);
    const strategicTags = Array.from(new Set(allTags)).slice(0, 5); // Cap at 5 top tags

    // Confidence Rules:
    // 1. If only 1 role, max confidence is medium (unless it's high and we trust it? user said one-role clusters don't become high confidence).
    // 2. High confidence requires at least 2 roles with high/medium confidence.
    // 3. If mostly low confidence roles, the cluster is low confidence.
    let confidence: "high" | "medium" | "low" = "low";
    const highCount = groupRoles.filter(r => r.confidence === "high").length;
    const mediumCount = groupRoles.filter(r => r.confidence === "medium").length;

    if (roleCount >= 2 && highCount >= 2) {
      confidence = "high";
    } else if (roleCount >= 2 && (highCount + mediumCount) >= 1) {
      confidence = "medium";
    } else if (roleCount === 1 && (highCount === 1 || mediumCount === 1)) {
      confidence = "medium"; // Downgraded single high/medium role to medium
    } else {
      confidence = "low";
    }

    // Deterministic evidence reason
    const evidenceReason = `Concentrated hiring in ${label.toLowerCase()} across ${roleCount} role${roleCount === 1 ? "" : "s"}.`;

    clusters.push({
      clusterKey,
      label,
      roleKeys,
      roleCount,
      businessThemes: [theme],
      functions,
      strategicTags,
      evidenceReason,
      confidence,
    });
  }

  // Sort by roleCount descending
  return clusters.sort((a, b) => b.roleCount - a.roleCount);
}

// ---------------------------------------------------------------------------
// Strategic priority table for summary scoring (AI-2G-A)
// Higher bonus = more distinctive signal worth surfacing above raw count.
// ---------------------------------------------------------------------------
const CLUSTER_STRATEGIC_PRIORITY: Partial<Record<AiRoleEnrichmentBusinessTheme, number>> = {
  risk_and_compliance:         4,
  data_control_infrastructure: 3,
  credit_and_lending:          3,
  core_platform:               2,
  product_execution:           2,
  go_to_market:                1,
  regional_operations:         0,
  customer_operations:         0,
  internal_operations:        -1,
  finance_and_treasury:       -1,
};

// Functions that indicate a compliance/risk/security character.
const COMPLIANCE_RISK_FUNCTIONS = new Set<AiRoleEnrichmentBusinessFunction>([
  "compliance",
  "security",
  "credit_risk",
]);

/**
 * Computes a deterministic composite score for a cluster used only by
 * `buildClusterAwareSignalSentence` to rank clusters in the summary sentence.
 *
 * Formula:
 *   score = roleCount
 *         + strategicPriorityBonus
 *         + proofRoleOverlapBonus
 *         − genericClusterPenalty
 *
 * This function is pure — it does not modify the cluster object.
 */
export function scoreClusterForSummary(
  cluster: AiSignalCluster,
  options?: {
    /** roleKeys of the proof roles currently displayed in this brief. */
    proofRoleKeys?: string[];
  }
): number {
  const theme = cluster.businessThemes[0] as AiRoleEnrichmentBusinessTheme | undefined;

  // 1. Strategic priority bonus
  const priorityBonus = theme !== undefined ? (CLUSTER_STRATEGIC_PRIORITY[theme] ?? 0) : 0;

  // 2. Proof-role overlap bonus
  //    +2 if at least one displayed proof role lives in this cluster.
  let proofOverlapBonus = 0;
  const proofKeys = options?.proofRoleKeys;
  if (proofKeys && proofKeys.length > 0) {
    const roleKeySet = new Set(cluster.roleKeys);
    const hasOverlap = proofKeys.some((k) => roleKeySet.has(k));
    if (hasOverlap) proofOverlapBonus = 2;
  }

  // 3. Generic cluster penalty
  //    −3 when a regional_operations cluster is actually compliance/risk-heavy
  //    (more than half its declared functions are compliance/risk/security).
  //    This prevents geographic deployment activity from dominating the summary
  //    when the underlying roles are field-risk or internal-control work.
  let genericPenalty = 0;
  if (theme === "regional_operations" && cluster.functions.length > 0) {
    const complianceCount = cluster.functions.filter((f) =>
      COMPLIANCE_RISK_FUNCTIONS.has(f as AiRoleEnrichmentBusinessFunction)
    ).length;
    if (complianceCount > cluster.functions.length / 2) {
      genericPenalty = 3;
    }
  }

  return cluster.roleCount + priorityBonus + proofOverlapBonus - genericPenalty;
}

function formatThemeLabel(theme: AiRoleEnrichmentBusinessTheme): string {
  switch (theme) {
    case "core_platform": return "Core Platform";
    case "data_control_infrastructure": return "Data Control & Infrastructure";
    case "credit_and_lending": return "Credit & Lending";
    case "risk_and_compliance": return "Risk & Compliance";
    case "go_to_market": return "Go-to-Market";
    case "customer_operations": return "Customer Operations";
    case "regional_operations": return "Regional Operations";
    case "product_execution": return "Product Execution";
    case "finance_and_treasury": return "Finance & Treasury";
    case "internal_operations": return "Internal Operations";
    case "unknown": return "General";
    default: return theme;
  }
}
