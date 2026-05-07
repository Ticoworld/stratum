import type { Job, JobBoardSource } from "@/lib/api/boards";

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

export interface BriefPublicReadiness {
  level: BriefPublicReadinessLevel;
  reasons: string[];
  blockers: string[];
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

function getLabelSuggestionSentence(label: ApprovedWatchlistLabel): string {
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

export function buildApprovedWatchlistSummary(args: {
  label: ApprovedWatchlistLabel;
  jobs: Job[];
  proofRoles: Job[];
  apiSource: JobBoardSource | null;
  watchlistReadConfidence: WatchlistConfidenceLevel;
  companyMatchConfidence: WatchlistConfidenceLevel;
  proofRoleGrounding: WatchlistProofGrounding;
}): string {
  const {
    label,
    jobs,
    proofRoles,
    apiSource,
    watchlistReadConfidence,
    companyMatchConfidence,
    proofRoleGrounding,
  } = args;
  const sourceLabel = formatSourceLabel(apiSource);
  const titles = getObservedTitles(proofRoles, jobs);
  const locations = getUniqueExplicitLocations(jobs);
  const observedSentence =
    titles.length > 0
      ? `Observed on ${sourceLabel}: ${jobs.length} open role${jobs.length === 1 ? "" : "s"}, including ${joinHumanList(titles)}.`
      : `Observed on ${sourceLabel}: ${jobs.length} open role${jobs.length === 1 ? "" : "s"}.`;

  const suggestionSentence =
    label === "Multi-location hiring signal" && locations.length >= 2
      ? `The visible roles span ${locations.slice(0, 3).join(", ")}, which may point to multi-location hiring.`
      : getLabelSuggestionSentence(label);

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
}): BriefPublicReadiness {
  const blockers: string[] = [];
  const reasons: string[] = [];

  // internal_only Blockers
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
    return { level: "internal_only", reasons: [], blockers };
  }

  // Cautious Factors
  if (args.jobsCount <= 4) {
    reasons.push("Evidence volume is moderate (under 5 roles).");
  }
  if (args.watchlistReadConfidence === "medium") {
    reasons.push("Interpretation confidence is moderate.");
  }
  if (args.proofRoleGrounding === "partial") {
    reasons.push("Read is only partially grounded in visible examples.");
  }
  if (
    args.label === "Mixed hiring signal" ||
    args.label === "Limited hiring signal" ||
    args.label === "Multi-location hiring signal"
  ) {
    reasons.push(`The "${args.label}" is broad or non-concentrated.`);
  }
  if (!args.hasComparison) {
    reasons.push("First baseline scan; no historical comparison available yet.");
  } else if (!args.hasSignificantChange) {
    reasons.push("Hiring changes are minor or reflect normal board churn.");
  }
  
  if (args.comparisonStrength === "weak") {
    reasons.push("Historical comparison is limited by missing legacy data.");
  }

  if (reasons.length > 0) {
    return { level: "cautious", reasons, blockers: [] };
  }

  // Strong
  if (args.significanceDrivers.length === 0) {
    return {
      level: "cautious",
      reasons: ["Hiring changes are minor or reflect normal board churn."],
      blockers: [],
    };
  }

  return {
    level: "strong",
    reasons: ["High confidence, clear functional signal, and material growth detected."],
    blockers: [],
  };
}
