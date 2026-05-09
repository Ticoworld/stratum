import type { Job, JobBoardSource } from "@/lib/api/boards";
import type { AiSignalCluster } from "./roleEnrichment";
import { scoreClusterForSummary } from "./roleClusters";

export type WatchlistConfidenceLevel = "high" | "medium" | "low" | "none";
export type WatchlistProofGrounding = "exact" | "partial" | "fallback" | "none";
export type WatchlistSignalCategory =
  | "product_engineering_buildout"
  | "go_to_market"
  | "platform_infrastructure"
  | "security_compliance"
  | "data_ai"
  | "leadership"
  | "multi_location"
  | "mixed"
  | "limited"
  | "thin"
  | "tentative";

export type ApprovedWatchlistLabel =
  | "Product and engineering buildout signal"
  | "Go-to-market hiring signal"
  | "Platform and infrastructure signal"
  | "Security and compliance signal"
  | "Data and AI signal"
  | "Leadership hiring signal"
  | "Multi-location hiring signal"
  | "Mixed hiring signal"
  | "Limited hiring signal"
  | "Thin hiring signal"
  | "Tentative hiring signal";

export type BriefPublicReadinessLevel = "strong" | "cautious" | "internal_only";
export type ChangeSignificance = "meaningful_change" | "minor_change" | "baseline" | "limited_comparison";
export type PublicUseRecommendation = "strong_baseline" | "strong_update" | "cautious_baseline" | "cautious_update" | "internal_only";

export interface DepartmentBreakdown {
  department: string;
  count: number;
  sampleJobs: Job[];
}

export type CurrentSignalStrength = "strong" | "moderate" | "weak";
export type ChangeDirection =
  | "expansion"
  | "contraction"
  | "replacement_churn"
  | "mix_shift"
  | "geography_shift"
  | "minor_movement"
  | "baseline"
  | "limited";

export interface BriefPublicReadiness {
  level: BriefPublicReadinessLevel;
  reasons: string[];
  blockers: string[];
  currentSignal: CurrentSignalStrength;
  changeSignificance: ChangeSignificance;
  changeDirection: ChangeDirection;
  publicUse: PublicUseRecommendation;
}

export const APPROVED_WATCHLIST_SIGNAL_TAXONOMY: Array<{
  category: WatchlistSignalCategory;
  label: ApprovedWatchlistLabel;
}> = [
  {
    category: "product_engineering_buildout",
    label: "Product and engineering buildout signal",
  },
  {
    category: "go_to_market",
    label: "Go-to-market hiring signal",
  },
  {
    category: "platform_infrastructure",
    label: "Platform and infrastructure signal",
  },
  {
    category: "security_compliance",
    label: "Security and compliance signal",
  },
  {
    category: "data_ai",
    label: "Data and AI signal",
  },
  {
    category: "leadership",
    label: "Leadership hiring signal",
  },
  {
    category: "multi_location",
    label: "Multi-location hiring signal",
  },
  {
    category: "mixed",
    label: "Mixed hiring signal",
  },
  {
    category: "limited",
    label: "Limited hiring signal",
  },
  {
    category: "thin",
    label: "Thin hiring signal",
  },
  {
    category: "tentative",
    label: "Tentative hiring signal",
  },
];

export const APPROVED_WATCHLIST_LABELS: ApprovedWatchlistLabel[] =
  APPROVED_WATCHLIST_SIGNAL_TAXONOMY.map((entry) => entry.label);

export const BANNED_WATCHLIST_LABELS = [
  "Aggressive Expansion",
  "Hypergrowth",
  "Maintenance Mode",
  "Strategic Pivot",
  "R&D Pivot",
  "Product Pivot",
  "Corporate Intelligence",
  "Institutional-grade strategy analysis",
  "Workforce intelligence",
  "Recruiting analytics",
] as const;

export type FunctionalSignal =
  | "product_engineering_buildout"
  | "go_to_market"
  | "platform_infrastructure"
  | "security_compliance"
  | "data_ai"
  | "leadership"
  | "unclassified";

export const SIGNAL_PRIORITY: FunctionalSignal[] = [
  "security_compliance",
  "data_ai",
  "platform_infrastructure",
  "go_to_market",
  "leadership",
  "product_engineering_buildout",
  "unclassified",
];

const SIGNAL_LABELS: Record<Exclude<WatchlistSignalCategory, "multi_location" | "mixed" | "limited" | "thin" | "tentative">, ApprovedWatchlistLabel> =
  {
    product_engineering_buildout: "Product and engineering buildout signal",
    go_to_market: "Go-to-market hiring signal",
    platform_infrastructure: "Platform and infrastructure signal",
    security_compliance: "Security and compliance signal",
    data_ai: "Data and AI signal",
    leadership: "Leadership hiring signal",
  };

function formatSourceLabel(source?: JobBoardSource | null): string {
  switch (source) {
    case "GREENHOUSE":
      return "Greenhouse";
    case "LEVER":
      return "Lever";
    case "ASHBY":
      return "Ashby";
    case "WORKABLE":
      return "Workable";
    default:
      return "the matched ATS source";
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildRoleText(job: Job): string {
  return `${normalizeText(job.title)} ${normalizeText(job.department)}`;
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function getFunctionalSignal(job: Job): FunctionalSignal {
  const text = buildRoleText(job);

  if (
    includesAny(text, [
      "security",
      "application security",
      "security engineer",
      "security analyst",
      "compliance",
      "risk",
      "privacy",
      "governance",
      "grc",
      "audit",
      "controls",
      "fraud",
      "trust",
    ])
  ) {
    return "security_compliance";
  }

  if (
    includesAny(text, [
      "machine learning",
      "ml ",
      " ml",
      "artificial intelligence",
      " ai",
      "ai ",
      "applied scientist",
      "research scientist",
      "data scientist",
      "data science",
      "data engineer",
      "analytics",
      "analyst",
      "prompt engineer",
    ])
  ) {
    return "data_ai";
  }

  if (
    includesAny(text, [
      "platform",
      "infrastructure",
      "devops",
      "site reliability",
      "sre",
      "reliability",
      "cloud",
      "internal tools",
      "systems",
      "network",
      "developer experience",
      "observability",
    ])
  ) {
    return "platform_infrastructure";
  }

  if (
    includesAny(text, [
      "sales",
      "account executive",
      "account manager",
      "business development",
      "bdr",
      "sdr",
      "revenue",
      "revops",
      "marketing",
      "growth",
      "demand generation",
      "partnership",
      "partnerships",
      "customer success",
      "solutions engineer",
      "solutions consultant",
      "field marketing",
    ])
  ) {
    return "go_to_market";
  }

  if (
    includesAny(text, [
      "head of",
      "vice president",
      "vp ",
      " vp",
      "chief ",
      "cto",
      "cfo",
      "coo",
      "chief of staff",
      "general manager",
      "gm ",
      "director",
    ])
  ) {
    return "leadership";
  }

  if (
    includesAny(text, [
      "engineer",
      "engineering",
      "developer",
      "software",
      "fullstack",
      "full-stack",
      "frontend",
      "backend",
      "mobile",
      "ios",
      "android",
      "product manager",
      "product designer",
      "ux",
      "ui",
      "design",
      "technical program manager",
      "program manager",
    ])
  ) {
    return "product_engineering_buildout";
  }

  return "unclassified";
}

function getUniqueExplicitLocations(jobs: Job[]): string[] {
  return Array.from(
    new Set(
      jobs
        .map((job) => job.location?.trim())
        .filter(
          (location): location is string =>
            typeof location === "string" && location.length > 0 && location.toLowerCase() !== "remote"
        )
    )
  );
}

export function getSignalCounts(jobs: Job[]): Record<FunctionalSignal, number> {
  const counts: Record<FunctionalSignal, number> = {
    product_engineering_buildout: 0,
    go_to_market: 0,
    platform_infrastructure: 0,
    security_compliance: 0,
    data_ai: 0,
    leadership: 0,
    unclassified: 0,
  };

  for (const job of jobs) {
    counts[getFunctionalSignal(job)]++;
  }

  return counts;
}

export function getDominantFunctionalSignal(jobs: Job[]): {
  signal: FunctionalSignal;
  count: number;
  ratio: number;
  categoriesWithAtLeastTwo: number;
} {
  const counts = getSignalCounts(jobs);
  const ranked = SIGNAL_PRIORITY.map((signal) => ({
    signal,
    count: counts[signal],
  })).sort((a, b) => b.count - a.count || SIGNAL_PRIORITY.indexOf(a.signal) - SIGNAL_PRIORITY.indexOf(b.signal));

  const top = ranked[0] ?? { signal: "unclassified" as const, count: 0 };
  const categoriesWithAtLeastTwo = ranked.filter(
    (entry) => entry.signal !== "unclassified" && entry.count >= 2
  ).length;

  return {
    signal: top.signal,
    count: top.count,
    ratio: jobs.length > 0 ? top.count / jobs.length : 0,
    categoriesWithAtLeastTwo,
  };
}

function getObservedTitles(proofRoles: Job[], jobs: Job[]): string[] {
  const source = proofRoles.length > 0 ? proofRoles : jobs;
  return Array.from(new Set(source.map((job) => job.title.trim()).filter(Boolean))).slice(0, 3);
}

function joinHumanList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

export function deriveApprovedWatchlistLabel(args: {
  jobs: Job[];
  watchlistReadConfidence: WatchlistConfidenceLevel;
  companyMatchConfidence: WatchlistConfidenceLevel;
}): ApprovedWatchlistLabel {
  const { jobs, watchlistReadConfidence, companyMatchConfidence } = args;

  if (companyMatchConfidence === "low") {
    return "Tentative hiring signal";
  }

  if (jobs.length <= 2) {
    return "Thin hiring signal";
  }

  if (watchlistReadConfidence === "low") {
    return "Tentative hiring signal";
  }

  const dominant = getDominantFunctionalSignal(jobs);
  const uniqueLocations = getUniqueExplicitLocations(jobs);

  if (
    uniqueLocations.length >= 3 &&
    jobs.length >= 5 &&
    dominant.ratio < 0.5 &&
    dominant.categoriesWithAtLeastTwo <= 1
  ) {
    return "Multi-location hiring signal";
  }

  if (
    dominant.signal !== "unclassified" &&
    dominant.count >= 2 &&
    (dominant.ratio >= 0.45 || (jobs.length >= 6 && dominant.count >= 3))
  ) {
    return SIGNAL_LABELS[dominant.signal as keyof typeof SIGNAL_LABELS];
  }

  if (dominant.categoriesWithAtLeastTwo >= 2) {
    return "Mixed hiring signal";
  }

  if (jobs.length <= 4 || dominant.count <= 1) {
    return "Limited hiring signal";
  }

  return "Mixed hiring signal";
}

/**
 * Keyword sets used to split the product_engineering_buildout bucket into
 * engineering-heavy vs. product/design-heavy sub-reads.
 * Mirrors the keyword lists in getFunctionalSignal() so classification is consistent.
 * Engineering wins over product in getFunctionalSignal (listed first), so the
 * same precedence is used here.
 */
const ENGINEERING_SUB_KEYWORDS = [
  "engineer",
  "engineering",
  "developer",
  "software",
  "fullstack",
  "full-stack",
  "frontend",
  "backend",
  "mobile",
  "ios",
  "android",
];

const PRODUCT_SUB_KEYWORDS = [
  "product manager",
  "product designer",
  "ux",
  "ui ",
  " ui",
  "design",
  "technical program manager",
  "program manager",
];

/**
 * For boards classified as product_engineering_buildout, computes how many
 * jobs in that bucket are engineering-leaning vs. product/design-leaning.
 * Both ratios are relative to the total product_engineering_buildout count,
 * not the full board — so a board with 8 engineers and 1 PM yields
 * { engineeringRatio: 0.89, productRatio: 0.11 }.
 */
export function getProductEngineeringSubRatio(
  jobs: Job[]
): { engineeringCount: number; productCount: number; engineeringRatio: number; productRatio: number } {
  let engineeringCount = 0;
  let productCount = 0;

  for (const job of jobs) {
    if (getFunctionalSignal(job) !== "product_engineering_buildout") continue;
    const text = buildRoleText(job);
    // Engineering keywords take precedence (same priority as getFunctionalSignal)
    if (includesAny(text, ENGINEERING_SUB_KEYWORDS)) {
      engineeringCount++;
    } else if (includesAny(text, PRODUCT_SUB_KEYWORDS)) {
      productCount++;
    }
    // Roles that match neither sub-keyword (e.g. "Technical Lead") are not counted
    // in either bucket, keeping the ratio honest.
  }

  const total = engineeringCount + productCount;
  return {
    engineeringCount,
    productCount,
    engineeringRatio: total > 0 ? engineeringCount / total : 0,
    productRatio: total > 0 ? productCount / total : 0,
  };
}

/**
 * Returns the suggestion sentence for the label shown in a watchlist summary.
 * For the "Product and engineering buildout signal" label, uses a keyword-based
 * sub-ratio (from getProductEngineeringSubRatio) rather than raw ATS department
 * strings, which vary by source and casing.
 */
function getLabelSuggestionSentence(
  label: ApprovedWatchlistLabel,
  subRatio?: { engineeringRatio: number; productRatio: number }
): string {
  if (label === "Product and engineering buildout signal" && subRatio) {
    if (subRatio.engineeringRatio >= 0.75) {
      return "Visible roles currently emphasize engineering work, with limited product headcount.";
    }
    if (subRatio.productRatio >= 0.75) {
      return "Visible roles currently emphasize product management and design work.";
    }
  }

  switch (label) {
    case "Product and engineering buildout signal":
      return "Visible roles currently emphasize product and engineering work.";
    case "Go-to-market hiring signal":
      return "Visible roles currently emphasize go-to-market functions (sales, marketing, customer-facing).";
    case "Platform and infrastructure signal":
      return "Visible roles currently emphasize platform and infrastructure work.";
    case "Security and compliance signal":
      return "Visible roles currently emphasize security and compliance work.";
    case "Data and AI signal":
      return "Visible roles currently emphasize data and AI work.";
    case "Leadership hiring signal":
      return "The current board includes senior hiring that points toward leadership or management activity.";
    case "Multi-location hiring signal":
      return "The board currently shows roles spanning multiple explicit locations.";
    case "Mixed hiring signal":
      return "Visible roles span several functions, suggesting a mixed functional hiring focus at this time.";
    case "Limited hiring signal":
      return "Visible ATS activity is present but narrow, suggesting limited current hiring volume.";
    case "Thin hiring signal":
      return "The current board state is too thin for a confirmed functional read.";
    case "Tentative hiring signal":
      return "There is a visible hiring signal, but the match or evidence is currently tentative.";
  }
}

/**
 * Builds a natural-language sentence describing the top thematic clusters.
 * Rules:
 * - Only clusters with roleCount >= 2 and confidence >= medium.
 * - Max 3 clusters.
 * - Rank by scoreClusterForSummary (strategic priority + proof overlap + penalty),
 *   then roleCount as tie-breaker, then confidence as final tie-breaker.
 */
export function buildClusterAwareSignalSentence(
  clusters?: AiSignalCluster[],
  options?: {
    /** roleKeys of the displayed proof roles — used for proof-overlap bonus. */
    proofRoleKeys?: string[];
  }
): string | null {
  if (!clusters || clusters.length === 0) return null;

  const validClusters = clusters
    .filter(
      (c) =>
        c.roleCount >= 2 && (c.confidence === "high" || c.confidence === "medium")
    )
    .sort((a, b) => {
      const scoreA = scoreClusterForSummary(a, options);
      const scoreB = scoreClusterForSummary(b, options);
      if (scoreB !== scoreA) return scoreB - scoreA;          // primary: composite score
      if (b.roleCount !== a.roleCount) return b.roleCount - a.roleCount; // tie-break 1: raw count
      if (a.confidence === b.confidence) return 0;            // tie-break 2: confidence
      return a.confidence === "high" ? -1 : 1;
    })
    .slice(0, 3);

  if (validClusters.length === 0) return null;

  const labels = validClusters.map((c) =>
    c.label.toLowerCase().replace("&", "and")
  );

  if (labels.length === 1) {
    return `Visible hiring is weighted toward ${labels[0]} work.`;
  }

  if (labels.length === 2) {
    return `Visible roles cluster around ${labels[0]} and ${labels[1]} work.`;
  }

  return `Visible hiring is weighted toward ${labels[0]}, ${labels[1]}, and ${labels[2]} work.`;
}

export function buildApprovedWatchlistSummary(args: {
  label: ApprovedWatchlistLabel;
  jobs: Job[];
  proofRoles: Job[];
  apiSource: JobBoardSource | null;
  watchlistReadConfidence: WatchlistConfidenceLevel;
  companyMatchConfidence: WatchlistConfidenceLevel;
  proofRoleGrounding: WatchlistProofGrounding;
  hiringMix?: DepartmentBreakdown[];
  signalClusters?: AiSignalCluster[];
  /** roleKeys of the displayed proof roles, forwarded to scoreClusterForSummary. */
  proofRoleKeys?: string[];
}): string {
  const {
    label,
    jobs,
    proofRoles,
    apiSource,
    watchlistReadConfidence,
    companyMatchConfidence,
    proofRoleGrounding,
    proofRoleKeys,
  } = args;
  const sourceLabel = formatSourceLabel(apiSource);
  const titles = getObservedTitles(proofRoles, jobs);
  const locations = getUniqueExplicitLocations(jobs);
  const observedSentence =
    titles.length > 0
      ? `Observed on ${sourceLabel}: ${jobs.length} open role${jobs.length === 1 ? "" : "s"}, including ${joinHumanList(titles)}.`
      : `Observed on ${sourceLabel}: ${jobs.length} open role${jobs.length === 1 ? "" : "s"}.`;

  // Compute keyword-based sub-ratio from actual job titles — not from raw ATS
  // department strings, which vary by source and casing and caused the previous
  // mix-sensitive branch to always produce the generic "product and engineering" sentence.
  const subRatio =
    label === "Product and engineering buildout signal"
      ? getProductEngineeringSubRatio(jobs)
      : undefined;

  const clusterSentence = buildClusterAwareSignalSentence(args.signalClusters, { proofRoleKeys });

  const suggestionSentence =
    clusterSentence ||
    (label === "Multi-location hiring signal" && locations.length >= 2
      ? `The visible roles span ${locations.slice(0, 3).join(", ")}, which may point to multi-location hiring.`
      : getLabelSuggestionSentence(label, subRatio));

  let limitSentence = `This brief only reflects roles visible on ${sourceLabel} and may miss hiring outside that feed.`;

  if (companyMatchConfidence === "low") {
    limitSentence =
      "This brief is tentative because the company match is indirect and Stratum only sees one matched ATS source.";
  } else if (watchlistReadConfidence === "low") {
    const reason =
      jobs.length <= 2
        ? "the observed role count is thin"
        : proofRoleGrounding === "fallback"
          ? "the read is weakly grounded in the displayed roles"
          : "the current ATS signal is incomplete";
    limitSentence = `This brief is limited because ${reason}, and it only reflects roles visible on ${sourceLabel}.`;
  } else if (proofRoleGrounding === "partial") {
    limitSentence = `This brief only reflects roles visible on ${sourceLabel}, and the read is only partially grounded in the displayed roles.`;
  }

  return `${observedSentence} ${suggestionSentence} ${limitSentence}`;
}

export function deriveCurrentSignalStrength(args: {
  jobsCount: number;
  watchlistReadConfidence: WatchlistConfidenceLevel;
  companyMatchConfidence: WatchlistConfidenceLevel;
  proofRoleGrounding: WatchlistProofGrounding;
  label: ApprovedWatchlistLabel;
}): { strength: CurrentSignalStrength; caveats: string[]; blockers: string[] } {
  const blockers: string[] = [];
  const caveats: string[] = [];

  // Weak Blockers
  if (args.jobsCount <= 2) blockers.push("Insufficient evidence volume (3+ roles required).");
  if (args.companyMatchConfidence === "low" || args.companyMatchConfidence === "none") {
    blockers.push("Weak company match confidence.");
  }
  if (args.watchlistReadConfidence === "low" || args.watchlistReadConfidence === "none") {
    blockers.push("Low interpretation confidence.");
  }
  if (args.proofRoleGrounding === "none" || args.proofRoleGrounding === "fallback") {
    blockers.push("Proof roles qualify rather than strongly support the read.");
  }
  if (args.label === "Thin hiring signal" || args.label === "Tentative hiring signal") {
    blockers.push("Read is too thin or tentative for a definitive strategic claim.");
  }

  if (blockers.length > 0) {
    return { strength: "weak", caveats: [], blockers };
  }

  // Moderate Caveats
  if (args.jobsCount <= 4) {
    caveats.push("Evidence volume is moderate (under 5 roles).");
  }
  if (args.watchlistReadConfidence === "medium") {
    caveats.push("Interpretation confidence is moderate.");
  }
  if (args.proofRoleGrounding === "partial") {
    caveats.push("Read is only partially grounded in visible examples.");
  }
  if (
    args.label === "Mixed hiring signal" ||
    args.label === "Limited hiring signal" ||
    args.label === "Multi-location hiring signal"
  ) {
    caveats.push(`The "${args.label}" is broad or non-concentrated.`);
  }

  if (caveats.length > 0) {
    return { strength: "moderate", caveats, blockers: [] };
  }

  return { strength: "strong", caveats: [], blockers: [] };
}

export function deriveChangeSignificance(args: {
  hasComparison: boolean;
  hasMaterialChange: boolean;
  hasSignificantChange: boolean;
  comparisonStrength: "standard" | "weak" | "unavailable";
  significanceDrivers: Array<"count" | "roles" | "mix" | "geography">;
  changeDirection: ChangeDirection;
}): { significance: ChangeSignificance; caveats: string[] } {
  const caveats: string[] = [];

  if (!args.hasComparison) {
    caveats.push("First baseline scan; no historical comparison available yet.");
    return { significance: "baseline", caveats };
  }

  if (args.changeDirection === "limited" || args.comparisonStrength === "weak") {
    caveats.push("Historical comparison is limited by missing legacy data.");
    return { significance: "limited_comparison", caveats };
  }

  if (!args.hasSignificantChange || args.significanceDrivers.length === 0) {
    caveats.push("Hiring changes are minor or reflect normal board churn.");
    return { significance: "minor_change", caveats };
  }

  return { significance: "meaningful_change", caveats: [] };
}

export function derivePublicUseRecommendation(
  currentSignal: CurrentSignalStrength,
  changeSignificance: ChangeSignificance,
  changeDirection: ChangeDirection
): PublicUseRecommendation {
  if (currentSignal === "weak") return "internal_only";

  if (currentSignal === "strong") {
    if (changeSignificance === "meaningful_change") {
      // If it's contraction or replacement churn, it's a meaningful movement but maybe not a "strong update" in a positive sense
      if (changeDirection === "contraction" || changeDirection === "replacement_churn") {
        return "cautious_update";
      }
      return "strong_update";
    }
    if (changeSignificance === "baseline") return "strong_baseline";
    if (changeSignificance === "minor_change") return "cautious_update";
    return "cautious_baseline"; // limited_comparison
  }

  // moderate signal
  if (changeSignificance === "baseline" || changeSignificance === "limited_comparison") {
    return "cautious_baseline";
  }
  return "cautious_update";
}

export function deriveBriefPublicReadiness(args: {
  jobsCount: number;
  watchlistReadConfidence: WatchlistConfidenceLevel;
  companyMatchConfidence: WatchlistConfidenceLevel;
  proofRoleGrounding: WatchlistProofGrounding;
  label: ApprovedWatchlistLabel;
  hasComparison: boolean;
  hasMaterialChange: boolean;
  hasSignificantChange: boolean;
  significanceDrivers: Array<"count" | "roles" | "mix" | "geography">;
  comparisonStrength: "standard" | "weak" | "unavailable";
  changeDirection: ChangeDirection;
}): BriefPublicReadiness {
  const currentSignalResult = deriveCurrentSignalStrength(args);
  const changeResult = deriveChangeSignificance(args);
  
  let effectiveDirection = args.changeDirection;
  if (changeResult.significance === "baseline") {
    effectiveDirection = "baseline";
  } else if (changeResult.significance === "limited_comparison") {
    effectiveDirection = "limited";
  }

  const publicUse = derivePublicUseRecommendation(
    currentSignalResult.strength,
    changeResult.significance,
    effectiveDirection
  );

  // Map back to legacy level for backward compatibility
  let legacyLevel: BriefPublicReadinessLevel = "cautious";
  if (publicUse === "internal_only") {
    legacyLevel = "internal_only";
  } else if (publicUse === "strong_update") {
    legacyLevel = "strong";
  }

  return {
    level: legacyLevel,
    reasons: [...currentSignalResult.caveats, ...changeResult.caveats],
    blockers: currentSignalResult.blockers,
    currentSignal: currentSignalResult.strength,
    changeSignificance: changeResult.significance,
    changeDirection: effectiveDirection,
    publicUse,
  };
}

// ---------------------------------------------------------------------------
// AI-2H: Why-This-Matters Interpretation (public-safe wording)
// ---------------------------------------------------------------------------

/**
 * Maps raw hiring-mix bucket names (from mapToFunctionalBucket in page.tsx)
 * to clean, public-facing labels.
 *
 * Rules:
 *  - "Other"      → null  (callers drop null entries; falls back to cluster
 *                           language or "broader execution roles" if needed)
 *  - "Sales"      → "go-to-market"
 *  - everything else → lowercased as-is
 */
function toPublicBucketLabel(bucket: string): string | null {
  const normalised = bucket.trim();
  if (normalised === "Other") return null;
  if (normalised === "Sales") return "go-to-market";
  return normalised.toLowerCase();
}

/**
 * Converts an internal `mapToFunctionalBucket` key to its public chart display label.
 *
 * This is the display-layer rename used by the Hiring Mix chart in the brief page.
 * The internal bucket key (used for counts and React keys) is unchanged; only the
 * rendered text is replaced.
 *
 * "Other" → "Broader roles"   (raw catch-all bucket → clean public label)
 * All other named buckets are returned as-is.
 */
export function formatHiringMixBucketLabel(bucket: string): string {
  if (bucket.trim() === "Other") return "Broader roles";
  return bucket;
}

/**
 * Builds the "Why this matters" interpretation sentence for a brief.
 *
 * Priority order:
 *  1. Cluster-aware sentence when qualifying clusters exist (roleCount >= 2,
 *     confidence high|medium, sorted by scoreClusterForSummary).
 *  2. Hiring-mix sentence using public-safe bucket labels (no "other roles").
 *  3. Conservative thin-evidence fallback.
 *
 * @param args.hiringMix       Sorted [bucketName, count][] from getHiringMix()
 * @param args.totalObserved   Total roles observed (for thin-evidence gate)
 * @param args.confidence      watchlistReadConfidence level
 * @param args.hasPriorComparison  Whether a prior snapshot exists for comparison
 * @param args.signalClusters  Optional enriched clusters (used for cluster-aware wording)
 * @param args.proofRoleKeys   Optional proof-role keys (forwarded to cluster scoring)
 */
export function buildWhyThisMattersInterpretation(args: {
  hiringMix: [string, number][];
  totalObserved: number;
  confidence: string;
  hasPriorComparison: boolean;
  signalClusters?: AiSignalCluster[];
  proofRoleKeys?: string[];
}): string {
  const { hiringMix, totalObserved, confidence, hasPriorComparison, signalClusters, proofRoleKeys } = args;

  // --- Gate: thin evidence → always use the conservative fallback ---
  if (totalObserved < 5 || confidence === "low" || confidence === "none") {
    const topRaw = hiringMix
      .slice(0, 2)
      .map(([b]) => toPublicBucketLabel(b))
      .filter((l): l is string => l !== null);
    const focus = topRaw.length > 0 ? topRaw.join(" and ") : "broader execution";
    return `Visible openings currently lean toward ${focus} roles, though the total evidence is currently too thin for a high-confidence read of organizational strategy.`;
  }

  // --- Option 1: cluster-aware wording (preferred when clusters available) ---
  if (signalClusters && signalClusters.length > 0) {
    const validClusters = signalClusters
      .filter((c) => c.roleCount >= 2 && (c.confidence === "high" || c.confidence === "medium"))
      .sort((a, b) => {
        const sA = scoreClusterForSummary(a, { proofRoleKeys });
        const sB = scoreClusterForSummary(b, { proofRoleKeys });
        if (sB !== sA) return sB - sA;
        return b.roleCount - a.roleCount;
      })
      .slice(0, 3);

    if (validClusters.length > 0) {
      const labels = validClusters.map((c) => c.label.toLowerCase().replace("&", "and"));
      let clusterSentence: string;
      if (labels.length === 1) {
        clusterSentence = `The current board is strongest around ${labels[0]} work.`;
      } else if (labels.length === 2) {
        clusterSentence = `The current board is strongest around ${labels[0]} and ${labels[1]} work.`;
      } else {
        clusterSentence = `The current board is strongest around ${labels[0]}, ${labels[1]}, and ${labels[2]} work.`;
      }

      if (!hasPriorComparison) {
        return `${clusterSentence} As this is a baseline read, these observations represent the current board state rather than a change in strategy.`;
      }
      return clusterSentence;
    }
  }

  // --- Option 2: hiring-mix wording with public-safe bucket labels ---
  // Filter out "Other"; if all top buckets were "Other", use a safe fallback term.
  const originalTop3 = hiringMix.slice(0, 3).map(([b]) => b);
  const publicLabels = originalTop3
    .map((b) => toPublicBucketLabel(b))
    .filter((l): l is string => l !== null);

  if (publicLabels.length === 0) {
    // Every top bucket was "Other" — use the generic fallback
    if (!hasPriorComparison) {
      return "Visible hiring reflects a mix of functional roles. As this is a baseline read, these observations represent the current board state rather than a change in strategy.";
    }
    return "Visible hiring reflects a mix of functional roles across the organization.";
  }

  // If "Other" was stripped from top-3, pad with "broader execution roles" so
  // the sentence still acknowledges the remaining unclassified activity.
  const hadOtherInTop3 = originalTop3.includes("Other");
  const labelsToUse =
    hadOtherInTop3 && publicLabels.length < originalTop3.length
      ? [...publicLabels, "broader execution roles"].slice(0, 3)
      : publicLabels;

  const focus =
    labelsToUse.length === 1
      ? labelsToUse[0]
      : labelsToUse.length === 2
        ? `${labelsToUse[0]} and ${labelsToUse[1]}`
        : `${labelsToUse[0]}, ${labelsToUse[1]}, and ${labelsToUse[2]}`;

  if (!hasPriorComparison) {
    return `Visible hiring is currently weighted toward ${focus} roles. As this is a baseline read, these observations represent the current board state rather than a change in strategy.`;
  }

  return `Visible hiring is currently weighted toward ${focus} roles across the organization.`;
}
