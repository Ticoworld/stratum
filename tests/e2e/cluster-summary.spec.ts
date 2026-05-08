
import { test, expect } from "@playwright/test";
import { 
  buildApprovedWatchlistSummary, 
  type ApprovedWatchlistLabel,
  type WatchlistConfidenceLevel,
  type WatchlistProofGrounding
} from "../../src/lib/signals/watchlistTaxonomy";
import type { AiSignalCluster } from "../../src/lib/signals/roleEnrichment";
import type { JobBoardSource } from "../../src/lib/api/boards";

test.describe("AI-2D: Cluster-Aware Summaries", () => {
  const mockJobs = [
    { title: "Engineer 1", department: "Engineering" },
    { title: "Engineer 2", department: "Engineering" },
    { title: "Product Manager 1", department: "Product" },
    { title: "Product Designer 1", department: "Design" },
  ];

  const baseArgs = {
    label: "Product and engineering buildout signal" as ApprovedWatchlistLabel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobs: mockJobs as any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    proofRoles: mockJobs as any[],
    apiSource: "GREENHOUSE" as JobBoardSource,
    watchlistReadConfidence: "high" as WatchlistConfidenceLevel,
    companyMatchConfidence: "high" as WatchlistConfidenceLevel,
    proofRoleGrounding: "exact" as WatchlistProofGrounding,
  };

  test("A. Cluster-aware summary replaces generic product/engineering wording", () => {
    const clusters: AiSignalCluster[] = [
      {
        clusterKey: "theme::core_platform",
        label: "Core Platform",
        roleKeys: ["1", "2"],
        roleCount: 2,
        businessThemes: ["core_platform"],
        functions: ["engineering"],
        strategicTags: [],
        evidenceReason: "reason",
        confidence: "high"
      },
      {
        clusterKey: "theme::risk_and_compliance",
        label: "Risk & Compliance",
        roleKeys: ["3", "4"],
        roleCount: 2,
        businessThemes: ["risk_and_compliance"],
        functions: ["compliance"],
        strategicTags: [],
        evidenceReason: "reason",
        confidence: "high"
      }
    ];

    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: clusters
    });

    // Should include clusters, not the generic "Visible roles currently emphasize product and engineering work."
    expect(summary).toContain("Visible roles cluster around core platform and risk and compliance work.");
    expect(summary).not.toContain("Visible roles currently emphasize product and engineering work.");
  });

  test("B. Undefined clusters fall back to deterministic wording", () => {
    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: undefined
    });

    expect(summary).toContain("Visible roles currently emphasize product and engineering work.");
  });

  test("C. Empty clusters fall back to deterministic wording", () => {
    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: []
    });

    expect(summary).toContain("Visible roles currently emphasize product and engineering work.");
  });

  test("D. Low-confidence clusters are ignored", () => {
    const clusters: AiSignalCluster[] = [
      {
        clusterKey: "theme::core_platform",
        label: "Core Platform",
        roleKeys: ["1", "2"],
        roleCount: 2,
        businessThemes: ["core_platform"],
        functions: ["engineering"],
        strategicTags: [],
        evidenceReason: "reason",
        confidence: "low"
      }
    ];

    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: clusters
    });

    expect(summary).toContain("Visible roles currently emphasize product and engineering work.");
  });

  test("E. One-role clusters are ignored", () => {
    const clusters: AiSignalCluster[] = [
      {
        clusterKey: "theme::core_platform",
        label: "Core Platform",
        roleKeys: ["1"],
        roleCount: 1,
        businessThemes: ["core_platform"],
        functions: ["engineering"],
        strategicTags: [],
        evidenceReason: "reason",
        confidence: "high"
      }
    ];

    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: clusters
    });

    expect(summary).toContain("Visible roles currently emphasize product and engineering work.");
  });

  test("F. Only top 3 valid clusters are mentioned", () => {
    const clusters: AiSignalCluster[] = [
      { label: "Cluster 1", roleCount: 10, confidence: "high", clusterKey: "1", roleKeys: [], businessThemes: [], functions: [], strategicTags: [], evidenceReason: "" },
      { label: "Cluster 2", roleCount: 8, confidence: "high", clusterKey: "2", roleKeys: [], businessThemes: [], functions: [], strategicTags: [], evidenceReason: "" },
      { label: "Cluster 3", roleCount: 6, confidence: "high", clusterKey: "3", roleKeys: [], businessThemes: [], functions: [], strategicTags: [], evidenceReason: "" },
      { label: "Cluster 4", roleCount: 4, confidence: "high", clusterKey: "4", roleKeys: [], businessThemes: [], functions: [], strategicTags: [], evidenceReason: "" },
    ];

    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: clusters
    });

    expect(summary).toContain("Visible hiring is weighted toward cluster 1, cluster 2, and cluster 3 work.");
    expect(summary).not.toContain("cluster 4");
  });

  test("G. Wording does not imply change or strategy shift", () => {
    const clusters: AiSignalCluster[] = [
      { label: "Core Platform", roleCount: 2, confidence: "high", clusterKey: "1", roleKeys: [], businessThemes: [], functions: [], strategicTags: [], evidenceReason: "" },
    ];

    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: clusters
    });

    // Check for "weighted toward" or "cluster around", NOT "strategy shifted" or "pivoted"
    expect(summary).toContain("Visible hiring is weighted toward core platform work.");
    expect(summary).not.toContain("strategy");
    expect(summary).not.toContain("shifted");
    expect(summary).not.toContain("pivoted");
  });

  test("H. Clusters do not affect the observed roles sentence", () => {
    const clusters: AiSignalCluster[] = [
      { label: "GTM", roleCount: 10, confidence: "high", clusterKey: "1", roleKeys: [], businessThemes: [], functions: [], strategicTags: [], evidenceReason: "" },
    ];

    const summary = buildApprovedWatchlistSummary({
      ...baseArgs,
      signalClusters: clusters
    });

    // The observed sentence (first one) should reflect mockJobs (4 roles)
    expect(summary).toContain("Observed on Greenhouse: 4 open roles");
    // But the second sentence mentions GTM clusters
    expect(summary).toContain("Visible hiring is weighted toward gtm work.");
  });
});
