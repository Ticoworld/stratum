import { test, expect } from "@playwright/test";
import { buildSignalClusters } from "../../src/lib/signals/roleClusters";
import type { AiRoleEnrichment } from "../../src/lib/signals/roleEnrichment";

test.describe("AI-2B: Signal Clustering Logic", () => {
  
  test("status=disabled returns empty clusters", () => {
    const enrichments: Record<string, AiRoleEnrichment> = {
      "role-1": {
        roleKey: "role-1",
        title: "Software Engineer",
        businessFunction: "engineering",
        businessTheme: "core_platform",
        seniority: "mid",
        strategicTags: ["backend"],
        evidenceReason: "Reason",
        confidence: "high"
      }
    };
    const clusters = buildSignalClusters(enrichments, "disabled");
    expect(clusters).toEqual([]);
  });

  test("status=failed returns empty clusters", () => {
    const enrichments: Record<string, AiRoleEnrichment> = {
      "role-1": {
        roleKey: "role-1",
        title: "Software Engineer",
        businessFunction: "engineering",
        businessTheme: "core_platform",
        seniority: "mid",
        strategicTags: ["backend"],
        evidenceReason: "Reason",
        confidence: "high"
      }
    };
    const clusters = buildSignalClusters(enrichments, "failed");
    expect(clusters).toEqual([]);
  });

  test("complete enrichment groups by businessTheme", () => {
    const enrichments: Record<string, AiRoleEnrichment> = {
      "role-1": {
        roleKey: "role-1",
        title: "Software Engineer",
        businessFunction: "engineering",
        businessTheme: "core_platform",
        seniority: "mid",
        strategicTags: ["backend"],
        evidenceReason: "Reason 1",
        confidence: "high"
      },
      "role-2": {
        roleKey: "role-2",
        title: "Platform Engineer",
        businessFunction: "engineering",
        businessTheme: "core_platform",
        seniority: "senior",
        strategicTags: ["infrastructure"],
        evidenceReason: "Reason 2",
        confidence: "high"
      },
      "role-3": {
        roleKey: "role-3",
        title: "Risk Analyst",
        businessFunction: "compliance",
        businessTheme: "risk_and_compliance",
        seniority: "mid",
        strategicTags: ["fraud"],
        evidenceReason: "Reason 3",
        confidence: "medium"
      }
    };

    const clusters = buildSignalClusters(enrichments, "complete");
    expect(clusters.length).toBe(2);
    
    const corePlatform = clusters.find(c => c.clusterKey === "theme::core_platform");
    expect(corePlatform).toBeDefined();
    expect(corePlatform?.roleCount).toBe(2);
    expect(corePlatform?.roleKeys).toContain("role-1");
    expect(corePlatform?.roleKeys).toContain("role-2");
    expect(corePlatform?.confidence).toBe("high"); // 2 high roles
    expect(corePlatform?.label).toBe("Core Platform");
    expect(corePlatform?.evidenceReason).toBe("Concentrated hiring in core platform across 2 roles.");

    const risk = clusters.find(c => c.clusterKey === "theme::risk_and_compliance");
    expect(risk).toBeDefined();
    expect(risk?.roleCount).toBe(1);
    expect(risk?.confidence).toBe("medium"); 
  });

  test("confidence: low-confidence roles are ignored or drive low-confidence clusters", () => {
    const enrichments: Record<string, AiRoleEnrichment> = {
      "role-1": {
        roleKey: "role-1",
        title: "Software Engineer",
        businessFunction: "engineering",
        businessTheme: "core_platform",
        seniority: "mid",
        strategicTags: ["backend"],
        evidenceReason: "Reason",
        confidence: "low"
      },
      "role-2": {
        roleKey: "role-2",
        title: "Product Manager",
        businessFunction: "product",
        businessTheme: "core_platform",
        seniority: "mid",
        strategicTags: ["ux"],
        evidenceReason: "Reason",
        confidence: "low"
      }
    };
    const clusters = buildSignalClusters(enrichments, "complete");
    const cluster = clusters[0];
    expect(cluster.confidence).toBe("low");
  });

  test("partial enrichment creates conservative clusters", () => {
    const enrichments: Record<string, AiRoleEnrichment> = {
      "role-1": {
        roleKey: "role-1",
        title: "Software Engineer",
        businessFunction: "engineering",
        businessTheme: "core_platform",
        seniority: "mid",
        strategicTags: ["backend"],
        evidenceReason: "Reason",
        confidence: "high"
      }
    };
    const clusters = buildSignalClusters(enrichments, "partial");
    expect(clusters.length).toBe(1);
    expect(clusters[0].confidence).toBe("medium"); // 1 high role -> medium
  });

  test("aggregates unique functions and strategic tags", () => {
    const enrichments: Record<string, AiRoleEnrichment> = {
      "role-1": {
        roleKey: "role-1",
        title: "A",
        businessFunction: "engineering",
        businessTheme: "go_to_market",
        seniority: "mid",
        strategicTags: ["sales", "crm"],
        evidenceReason: "R",
        confidence: "high"
      },
      "role-2": {
        roleKey: "role-2",
        title: "B",
        businessFunction: "sales",
        businessTheme: "go_to_market",
        seniority: "mid",
        strategicTags: ["crm", "ops"],
        evidenceReason: "R",
        confidence: "high"
      }
    };
    const clusters = buildSignalClusters(enrichments, "complete");
    const cluster = clusters[0];
    expect(cluster.functions).toContain("engineering");
    expect(cluster.functions).toContain("sales");
    expect(cluster.strategicTags).toEqual(["sales", "crm", "ops"]);
  });

});
