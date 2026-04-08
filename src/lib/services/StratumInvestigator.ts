/**
 * STRATUM INVESTIGATOR
 *
 * Flow:
 * 1. Fetch normalized ATS roles plus fetch-state metadata.
 * 2. Determine explicit result state and confidence/completeness levels.
 * 3. Run interpretation only when observed roles justify one.
 * 4. Return a watchlist brief plus evidence-backed proof roles.
 */

import {
  fetchCompanyJobs,
  type CompanyResolutionKind,
  type FetchAttempt,
  type FetchAttemptStatus,
  type Job,
  type JobBoardSource,
  type SourceInputMode,
  type UnsupportedSourcePattern,
} from "@/lib/api/boards";
import { runStratumAnalysis, type StratumAnalysisResult } from "@/lib/ai/unified-analyzer";
import {
  type ApprovedWatchlistLabel,
  buildApprovedWatchlistSummary,
  deriveApprovedWatchlistLabel,
} from "@/lib/signals/watchlistTaxonomy";
import type { WatchlistMonitoringSnapshot } from "@/lib/watchlists/repository";

export interface DepartmentBreakdown {
  department: string;
  count: number;
  sampleJobs: Job[];
}

export type StratumResultState =
  | "supported_provider_matched_with_observed_openings"
  | "supported_provider_matched_with_zero_observed_openings"
  | "unsupported_ats_or_source_pattern"
  | "ambiguous_company_match"
  | "provider_failure"
  | "no_matched_provider_found";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";
export type SourceCoverageCompleteness =
  | "single_matched_provider_only"
  | "matched_provider_zero_observed_roles"
  | "unsupported_source_pattern"
  | "inconclusive_due_to_provider_failure"
  | "no_supported_provider_match";

export type ProofRoleGrounding = "exact" | "partial" | "fallback" | "none";
export type BriefArtifactOrigin = "live" | "saved";
export type CompanyResolutionState =
  | "direct_confirmed_match"
  | "alias_confirmed_match"
  | "fallback_match"
  | "ambiguous_low_confidence_match"
  | "no_supported_match";

export interface ProviderAttemptSummary {
  source: JobBoardSource;
  status: FetchAttemptStatus;
  jobsCount: number;
  tokensTried: string[];
  errorMessages: string[];
  usedForBrief: boolean;
  note: string;
}

interface ConfidenceAssessment {
  level: ConfidenceLevel;
  explanation: string;
}

interface CoverageAssessment {
  completeness: SourceCoverageCompleteness;
  explanation: string;
}

interface ProofRoleSelection {
  roles: Job[];
  grounding: ProofRoleGrounding;
  requestedRoleCount: number;
  exactMatches: number;
  partialMatches: number;
  explanation: string;
}

interface ResolutionAssessment {
  state: CompanyResolutionState;
  explanation: string;
  matchedCompanyName: string;
}

function formatSourceLabel(source: JobBoardSource | null | undefined): string {
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
      return "a supported provider";
  }
}

function formatSourceList(sources: JobBoardSource[]): string {
  const labels = Array.from(new Set(sources)).map((source) => formatSourceLabel(source));

  if (labels.length === 0) return "supported providers";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function uniqueSourcesWithStatus(
  providerSummaries: ProviderAttemptSummary[],
  statuses: FetchAttemptStatus[]
): JobBoardSource[] {
  return providerSummaries
    .filter((summary) => statuses.includes(summary.status))
    .map((summary) => summary.source);
}

function buildProviderAttemptSummaries(args: {
  attempts: FetchAttempt[];
  matchedSource: JobBoardSource | null;
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
}): ProviderAttemptSummary[] {
  const { attempts, matchedSource, sourceInputMode, requestedSourceHint } = args;
  const sources: JobBoardSource[] = ["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"];

  return sources.map((source) => {
    const sourceAttempts = attempts.filter((attempt) => attempt.source === source);
    const statuses = sourceAttempts.map((attempt) => attempt.status);
    const status: FetchAttemptStatus = statuses.includes("jobs_found")
      ? "jobs_found"
      : statuses.includes("zero_jobs")
        ? "zero_jobs"
        : statuses.includes("error")
          ? "error"
          : statuses.includes("not_found")
            ? "not_found"
            : statuses.includes("not_attempted_after_match")
              ? "not_attempted_after_match"
              : "not_applicable";
    const tokensTried = Array.from(
      new Set(
        sourceAttempts
          .filter(
            (attempt) =>
              attempt.status !== "not_applicable" && attempt.status !== "not_attempted_after_match"
          )
          .map((attempt) => attempt.token)
          .filter(Boolean)
      )
    );
    const errorMessages = Array.from(
      new Set(
        sourceAttempts
          .map((attempt) => attempt.errorMessage?.trim())
          .filter((message): message is string => Boolean(message))
      )
    );
    const jobsCount = sourceAttempts.reduce((max, attempt) => Math.max(max, attempt.jobsCount), 0);
    const usedForBrief = matchedSource === source && (status === "jobs_found" || status === "zero_jobs");

    let note = "This provider was not attempted.";
    switch (status) {
      case "jobs_found":
        note = `Returned ${jobsCount} observed open role${jobsCount === 1 ? "" : "s"} and anchors this brief.`;
        break;
      case "zero_jobs":
        note = "Matched this provider but observed zero current openings there at fetch time.";
        break;
      case "not_found":
        note = "No supported board or token match was confirmed on this provider.";
        break;
      case "error":
        note = "This provider request failed during the search.";
        break;
      case "not_applicable":
        note =
          sourceInputMode === "supported_source_input" && requestedSourceHint
            ? `Not attempted because the query specified ${formatSourceLabel(requestedSourceHint)} directly.`
            : "Not attempted because it was outside the supported-source path for this query.";
        break;
      case "not_attempted_after_match":
        note = "Not attempted because Stratum stopped after the first provider returned openings.";
        break;
    }

    return {
      source,
      status,
      jobsCount,
      tokensTried,
      errorMessages,
      usedForBrief,
      note,
    };
  });
}

function aggregateJobsByDepartment(jobs: Job[], sampleSize = 4): DepartmentBreakdown[] {
  const byDept = new Map<string, Job[]>();

  for (const job of jobs) {
    const department = job.department?.trim() || "Unknown";
    if (!byDept.has(department)) byDept.set(department, []);
    byDept.get(department)!.push(job);
  }

  return Array.from(byDept.entries())
    .map(([department, deptJobs]) => ({
      department,
      count: deptJobs.length,
      sampleJobs: deptJobs.slice(0, sampleSize),
    }))
    .sort((a, b) => b.count - a.count);
}

function calculateEngineeringVsSalesRatio(jobs: Job[]): string {
  if (jobs.length === 0) return "-";

  let engineering = 0;
  let sales = 0;

  const engKeywords = [
    "engineer",
    "engineering",
    "developer",
    "development",
    "programmer",
    "software",
    "tech",
    "technical",
    "devops",
    "sre",
    "infrastructure",
    "platform",
    "backend",
    "frontend",
    "fullstack",
    "full-stack",
    "qa",
    "quality assurance",
    "test",
    "testing",
    "security engineer",
    "data engineer",
    "ml engineer",
    "ai engineer",
  ];

  const salesKeywords = [
    "sales",
    "account executive",
    "account manager",
    "business development",
    "bdr",
    "sdr",
    "revenue",
    "revenue operations",
    "revops",
    "customer success",
    "account management",
    "partnership",
    "partnerships",
    "business development",
    "bd",
  ];

  for (const job of jobs) {
    const titleLower = job.title.toLowerCase();
    const deptLower = (job.department || "").toLowerCase();
    const combined = `${titleLower} ${deptLower}`;

    const isEng = engKeywords.some((keyword) => combined.includes(keyword));
    const isSales = salesKeywords.some((keyword) => combined.includes(keyword));

    if (isEng && !isSales) engineering++;
    else if (isSales && !isEng) sales++;
    else if (isEng && isSales) {
      if (deptLower.includes("engineering") || deptLower.includes("tech")) engineering++;
      else if (deptLower.includes("sales") || deptLower.includes("revenue")) sales++;
      else engineering++;
    }
  }

  if (engineering === 0 && sales === 0) return "-";
  if (engineering === 0) return `0:${sales}`;
  if (sales === 0) return `${engineering}:0`;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(engineering, sales);
  const engSimplified = engineering / divisor;
  const salesSimplified = sales / divisor;

  if (engSimplified <= 5 && salesSimplified <= 5) {
    return `${engSimplified}:${salesSimplified}`;
  }

  const ratio = sales / engineering;
  return ratio >= 1 ? `1:${ratio.toFixed(1)}` : `${(1 / ratio).toFixed(1)}:1`;
}

function normalizeRoleTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function selectProofRoles(jobs: Job[], notableRoles?: string[], limit = 5): ProofRoleSelection {
  if (jobs.length === 0) {
    return {
      roles: [],
      grounding: "none",
      requestedRoleCount: 0,
      exactMatches: 0,
      partialMatches: 0,
      explanation: "No proof roles are available because no observed roles were returned.",
    };
  }

  const selected: Job[] = [];
  const usedIndexes = new Set<number>();
  const requestedTitles = (notableRoles ?? [])
    .map((role) => normalizeRoleTitle(role))
    .filter(Boolean);
  let exactMatches = 0;
  let partialMatches = 0;

  for (const requestedTitle of requestedTitles) {
    const exactIndex = jobs.findIndex(
      (job, index) => !usedIndexes.has(index) && normalizeRoleTitle(job.title) === requestedTitle
    );

    if (exactIndex !== -1) {
      usedIndexes.add(exactIndex);
      selected.push(jobs[exactIndex]);
      exactMatches++;
      if (selected.length === limit) break;
      continue;
    }

    const partialIndex = jobs.findIndex(
      (job, index) =>
        !usedIndexes.has(index) &&
        (normalizeRoleTitle(job.title).includes(requestedTitle) ||
          requestedTitle.includes(normalizeRoleTitle(job.title)))
    );

    if (partialIndex === -1) continue;

    usedIndexes.add(partialIndex);
    selected.push(jobs[partialIndex]);
    partialMatches++;

    if (selected.length === limit) break;
  }

  for (const [index, job] of jobs.entries()) {
    if (usedIndexes.has(index)) continue;
    selected.push(job);
    if (selected.length === limit) break;
  }

  if (requestedTitles.length === 0) {
    return {
      roles: selected,
      grounding: "fallback",
      requestedRoleCount: 0,
      exactMatches,
      partialMatches,
      explanation:
        "The read did not return grounded proof-role titles, so Stratum is showing the first observed roles instead.",
    };
  }

  if (exactMatches === requestedTitles.length) {
    return {
      roles: selected,
      grounding: "exact",
      requestedRoleCount: requestedTitles.length,
      exactMatches,
      partialMatches,
      explanation: `The read is grounded in ${exactMatches} displayed proof roles matched exactly by title.`,
    };
  }

  if (exactMatches + partialMatches > 0) {
    return {
      roles: selected,
      grounding: "partial",
      requestedRoleCount: requestedTitles.length,
      exactMatches,
      partialMatches,
      explanation: `The read is only partially grounded: ${exactMatches + partialMatches} of ${requestedTitles.length} role titles from the read matched displayed proof roles.`,
    };
  }

  return {
    roles: selected,
    grounding: "fallback",
    requestedRoleCount: requestedTitles.length,
    exactMatches,
    partialMatches,
    explanation:
      "The read could not be grounded to model-picked role titles, so Stratum falls back to the first observed roles.",
  };
}

function deriveCompanyResolutionAssessment(args: {
  companyName: string;
  source: JobBoardSource | null;
  resolutionKind: CompanyResolutionKind | null;
  matchedAs?: string;
  normalizedToken: string;
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
  attempts: FetchAttempt[];
}): ResolutionAssessment {
  const {
    companyName,
    source,
    resolutionKind,
    matchedAs,
    normalizedToken,
    sourceInputMode,
    requestedSourceHint,
    attempts,
  } = args;
  const matchedCompanyName = matchedAs?.trim() || companyName.trim();

  if (!source || !resolutionKind) {
    return {
      state: "no_supported_match",
      explanation:
        sourceInputMode === "supported_source_input" && requestedSourceHint
          ? `Stratum could not confirm the explicit ${formatSourceLabel(requestedSourceHint)} source from the query.`
          : "Stratum could not confirm a supported ATS match for this query.",
      matchedCompanyName,
    };
  }

  if (resolutionKind === "direct") {
    return {
      state: "direct_confirmed_match",
      explanation:
        sourceInputMode === "supported_source_input"
          ? `The query specified ${formatSourceLabel(source)} directly and Stratum matched that same source token.`
          : "The requested company name resolved directly to the matched ATS token.",
      matchedCompanyName,
    };
  }

  if (resolutionKind === "alias") {
    return {
      state: "alias_confirmed_match",
      explanation: `The requested company name resolved through a known alias before matching ${formatSourceLabel(source)}${matchedAs ? ` (${matchedAs})` : ""}.`,
      matchedCompanyName,
    };
  }

  const normalizedTokenHadStructuredSignal = attempts.some(
    (attempt) =>
      attempt.token === normalizedToken &&
      (attempt.status === "jobs_found" || attempt.status === "zero_jobs")
  );

  if (normalizedTokenHadStructuredSignal) {
    return {
      state: "ambiguous_low_confidence_match",
      explanation: `Stratum only found evidence after switching away from the requested token${matchedAs ? ` to ${matchedAs}` : ""}, and earlier attempts produced conflicting source signals.`,
      matchedCompanyName,
    };
  }

  return {
    state: "fallback_match",
    explanation: `Stratum only matched after falling back to an alternate ATS token${matchedAs ? ` (${matchedAs})` : ""}. Treat the company match as weak.`,
    matchedCompanyName,
  };
}

function deriveResultState(args: {
  jobs: Job[];
  source: JobBoardSource | null;
  attempts: FetchAttempt[];
  companyResolutionState: CompanyResolutionState;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
}): StratumResultState {
  const { jobs, source, attempts, companyResolutionState, unsupportedSourcePattern } = args;

  if (jobs.length > 0 && companyResolutionState === "ambiguous_low_confidence_match") {
    return "ambiguous_company_match";
  }

  if (jobs.length > 0) {
    return "supported_provider_matched_with_observed_openings";
  }

  if (
    source &&
    attempts.some((attempt) => attempt.source === source && attempt.status === "zero_jobs")
  ) {
    return "supported_provider_matched_with_zero_observed_openings";
  }

  if (unsupportedSourcePattern) {
    return "unsupported_ats_or_source_pattern";
  }

  if (attempts.some((attempt) => attempt.status === "error")) {
    return "provider_failure";
  }

  return "no_matched_provider_found";
}

function deriveCompanyMatchConfidence(args: {
  source: JobBoardSource | null;
  companyResolutionState: CompanyResolutionState;
}): ConfidenceAssessment {
  const { source, companyResolutionState } = args;

  if (!source || companyResolutionState === "no_supported_match") {
    return {
      level: "none",
      explanation: "Stratum could not confirm a supported ATS match for this search.",
    };
  }

  switch (companyResolutionState) {
    case "direct_confirmed_match":
      return {
        level: "high",
        explanation: "The company match is direct and confirmed on the matched ATS source.",
      };
    case "alias_confirmed_match":
      return {
        level: "medium",
        explanation: "The company match depends on a known alias rather than a direct token match.",
      };
    case "fallback_match":
      return {
        level: "low",
        explanation: "The company match depends on a fallback ATS token rather than a direct or alias match.",
      };
    case "ambiguous_low_confidence_match":
      return {
        level: "low",
        explanation: "The company match depends on a weak or conflicting ATS token resolution.",
      };
  }
}

function buildResultStateExplanation(args: {
  state: StratumResultState;
  source: JobBoardSource | null;
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
}): string {
  const { state, source, sourceInputMode, requestedSourceHint, unsupportedSourcePattern } = args;

  switch (state) {
    case "supported_provider_matched_with_observed_openings":
      return `Stratum confirmed ${formatSourceLabel(source)} and observed current openings there.`;
    case "supported_provider_matched_with_zero_observed_openings":
      return `Stratum confirmed ${formatSourceLabel(source)} but observed zero current openings there at fetch time.`;
    case "unsupported_ats_or_source_pattern":
      return `This query appears to point to an unsupported ATS or source pattern${unsupportedSourcePattern ? ` (${unsupportedSourcePattern})` : ""}.`;
    case "ambiguous_company_match":
      return "Stratum observed openings, but the company resolution remained weak enough that the watchlist read is withheld.";
    case "provider_failure":
      return sourceInputMode === "supported_source_input" && requestedSourceHint
        ? `The explicit ${formatSourceLabel(requestedSourceHint)} source from the query failed during fetch, so Stratum cannot treat absence as evidence.`
        : "Supported provider requests failed, so Stratum cannot treat absence as evidence.";
    case "no_matched_provider_found":
      return sourceInputMode === "supported_source_input" && requestedSourceHint
        ? `The explicit ${formatSourceLabel(requestedSourceHint)} source from the query did not confirm a supported match.`
        : "Stratum did not confirm any supported ATS provider for this query.";
  }
}

function buildProviderFailureExplanation(providerSummaries: ProviderAttemptSummary[]): string {
  const failedSources = uniqueSourcesWithStatus(providerSummaries, ["error"]);
  if (failedSources.length === 0) {
    return "No provider request failures were recorded during this search.";
  }

  return `${failedSources.length} provider request${failedSources.length === 1 ? "" : "s"} failed during this search: ${formatSourceList(failedSources)}.`;
}

function buildUnsupportedSourcePatternExplanation(
  unsupportedSourcePattern: UnsupportedSourcePattern | null
): string | null {
  if (!unsupportedSourcePattern) return null;

  return `Unsupported-source detection is best-effort and based on recognizable source patterns in the query string. It is not a full source classifier.`;
}

function deriveSourceCoverageAssessment(args: {
  state: StratumResultState;
  source: JobBoardSource | null;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
  providerSummaries: ProviderAttemptSummary[];
}): CoverageAssessment {
  const { state, source, unsupportedSourcePattern, sourceInputMode, requestedSourceHint, providerSummaries } = args;
  const failedSources = uniqueSourcesWithStatus(providerSummaries, ["error"]);
  const notAttemptedAfterMatch = uniqueSourcesWithStatus(providerSummaries, ["not_attempted_after_match"]);

  switch (state) {
    case "supported_provider_matched_with_observed_openings":
    case "ambiguous_company_match": {
      if (sourceInputMode === "supported_source_input" && requestedSourceHint) {
        return {
          completeness: "single_matched_provider_only",
          explanation: `Stratum used only ${formatSourceLabel(source)} because the query specified that source directly. Other supported providers were not attempted, so this remains one-provider, point-in-time evidence only.`,
        };
      }

      if (notAttemptedAfterMatch.length > 0) {
        return {
          completeness: "single_matched_provider_only",
          explanation: `Stratum used ${formatSourceLabel(source)} and then stopped after the first provider returned openings. ${formatSourceList(notAttemptedAfterMatch)} were not attempted, so this is still one-provider, point-in-time evidence only.`,
        };
      }

      if (failedSources.length > 0) {
        return {
          completeness: "single_matched_provider_only",
          explanation: `Stratum used ${formatSourceLabel(source)}, but ${formatSourceList(failedSources)} failed during the search. This remains narrow, one-provider evidence rather than full company coverage.`,
        };
      }

      return {
        completeness: "single_matched_provider_only",
        explanation: `Stratum observed openings from ${formatSourceLabel(source)} only. This is one-provider, point-in-time evidence and not full company coverage.`,
      };
    }
    case "supported_provider_matched_with_zero_observed_openings":
      return {
        completeness: "matched_provider_zero_observed_roles",
        explanation:
          sourceInputMode === "supported_source_input" && requestedSourceHint
            ? `Stratum checked only ${formatSourceLabel(source)} because the query specified that source directly and observed zero current openings there at fetch time.`
            : `Stratum matched ${formatSourceLabel(source)} but observed zero current openings there at fetch time. This does not cover unsupported or untried sources.`,
      };
    case "unsupported_ats_or_source_pattern":
      return {
        completeness: "unsupported_source_pattern",
        explanation: `This query appears to point to an ATS/source pattern Stratum does not support${unsupportedSourcePattern ? ` (${unsupportedSourcePattern})` : ""}. No supported provider match was inferred from it.`,
      };
    case "provider_failure":
      return {
        completeness: "inconclusive_due_to_provider_failure",
        explanation:
          failedSources.length > 0
            ? `Provider coverage is inconclusive because ${formatSourceList(failedSources)} failed during the search.`
            : "Provider coverage is inconclusive because supported provider requests failed.",
      };
    case "no_matched_provider_found":
      return {
        completeness: "no_supported_provider_match",
        explanation:
          sourceInputMode === "supported_source_input" && requestedSourceHint
            ? `Stratum checked the explicit ${formatSourceLabel(requestedSourceHint)} source from the query and did not confirm a match there. This says nothing about other providers.`
            : "Stratum did not confirm any of its supported ATS providers for this search. That is not evidence that the company has no openings.",
      };
  }
}

function deriveWatchlistReadConfidence(args: {
  state: StratumResultState;
  jobs: Job[];
  proofRoleSelection: ProofRoleSelection;
  companyMatchConfidence: ConfidenceLevel;
  analysis: StratumAnalysisResult | null;
}): ConfidenceAssessment {
  const { state, jobs, proofRoleSelection, companyMatchConfidence, analysis } = args;

  if (state === "supported_provider_matched_with_zero_observed_openings") {
    return {
      level: "none",
      explanation: "No watchlist read is shown because the matched provider exposed zero current openings.",
    };
  }

  if (state === "unsupported_ats_or_source_pattern") {
    return {
      level: "none",
      explanation: "No watchlist read is shown because the query points to an unsupported ATS/source pattern.",
    };
  }

  if (state === "provider_failure") {
    return {
      level: "none",
      explanation: "No watchlist read is shown because provider fetches failed.",
    };
  }

  if (state === "no_matched_provider_found") {
    return {
      level: "none",
      explanation: "No watchlist read is shown because Stratum did not confirm a supported provider for this search.",
    };
  }

  if (!analysis) {
    return {
      level: "none",
      explanation: "No watchlist read is shown because interpretation generation failed.",
    };
  }

  if (companyMatchConfidence === "low") {
    return {
      level: "low",
      explanation: "Read confidence is low because the company match depends on an indirect ATS token.",
    };
  }

  if (jobs.length < 3) {
    return {
      level: "low",
      explanation: `Read confidence is low because only ${jobs.length} observed role${jobs.length === 1 ? "" : "s"} anchor this brief.`,
    };
  }

  if (proofRoleSelection.grounding === "fallback") {
    return {
      level: "low",
      explanation: "Read confidence is low because the brief could not be cleanly grounded to model-picked role titles.",
    };
  }

  const proofRoles = proofRoleSelection.roles;
  const proofRolesWithTimestamps = proofRoles.filter((role) => role.sourceTimestamp).length;
  const timestampCoverageRatio =
    proofRoles.length > 0 ? proofRolesWithTimestamps / proofRoles.length : 0;

  if (
    companyMatchConfidence === "high" &&
    jobs.length >= 5 &&
    proofRoleSelection.grounding === "exact" &&
    proofRoleSelection.exactMatches >= 2 &&
    timestampCoverageRatio >= 0.5
  ) {
    return {
      level: "high",
      explanation:
        "Read confidence is high for this product because the match is direct, the role count is not thin, grounding is exact, and multiple proof roles expose provider timestamps.",
    };
  }

  return {
    level: "medium",
    explanation:
      proofRoleSelection.grounding === "partial"
        ? "Read confidence is medium because the brief is only partially grounded in the displayed proof roles."
        : proofRolesWithTimestamps === 0
          ? "Read confidence is medium because the provider did not expose timestamps for the displayed proof roles."
          : "Read confidence is medium because the role pattern is visible but still limited to one matched provider.",
  };
}

function buildNoReadResult(args: {
  companyName: string;
  jobs: Job[];
  proofRoleSelection: ProofRoleSelection;
  hiringMix: DepartmentBreakdown[];
  engineeringVsSalesRatio: string;
  analysisTimeMs: number;
  apiSource: JobBoardSource | null;
  matchedAs?: string;
  resultState: StratumResultState;
  resultStateExplanation: string;
  companyMatchConfidence: ConfidenceAssessment;
  companyResolution: ResolutionAssessment;
  sourceCoverage: CoverageAssessment;
  resolutionKind: CompanyResolutionKind | null;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  unsupportedSourcePatternExplanation: string | null;
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
  attempts: FetchAttempt[];
  providerSummaries: ProviderAttemptSummary[];
  providerFailureExplanation: string;
}): StratumResult {
  const {
    companyName,
    jobs,
    proofRoleSelection,
    hiringMix,
    engineeringVsSalesRatio,
    analysisTimeMs,
    apiSource,
    matchedAs,
    resultState,
    resultStateExplanation,
    companyMatchConfidence,
    companyResolution,
    sourceCoverage,
    resolutionKind,
    unsupportedSourcePattern,
    unsupportedSourcePatternExplanation,
    sourceInputMode,
    requestedSourceHint,
    attempts,
    providerSummaries,
    providerFailureExplanation,
  } = args;

  let strategicVerdict = "Watchlist read withheld";
  let summary = "Stratum could not produce a grounded watchlist read for this result.";
  let watchlistReadExplanation = "No watchlist read is available.";

  switch (resultState) {
    case "supported_provider_matched_with_zero_observed_openings":
      strategicVerdict = "Zero observed openings on matched provider";
      summary = `Stratum matched ${formatSourceLabel(apiSource)} for this search but observed zero current openings there at fetch time. This is not the same as saying the company is not hiring.`;
      watchlistReadExplanation =
        "Interpretation is withheld because there are no observed openings to interpret on the matched provider.";
      break;
    case "unsupported_ats_or_source_pattern":
      strategicVerdict = "Unsupported ATS or source pattern";
      summary = `This query appears to point to an ATS/source pattern Stratum does not support${unsupportedSourcePattern ? ` (${unsupportedSourcePattern})` : ""}. No watchlist read was generated.`;
      watchlistReadExplanation =
        "Interpretation is withheld because the query points outside Stratum's supported ATS set.";
      break;
    case "provider_failure":
      strategicVerdict = "Provider fetch failure";
      summary = "Stratum could not complete supported provider fetches reliably enough to produce a watchlist read. This result is inconclusive.";
      watchlistReadExplanation =
        "Interpretation is withheld because provider fetches failed and absence cannot be trusted.";
      break;
    case "no_matched_provider_found":
      strategicVerdict = "No supported ATS match confirmed";
      summary = `Stratum could not confirm a supported ATS provider for "${companyName}". This does not mean the company has no openings.`;
      watchlistReadExplanation =
        "Interpretation is withheld because no supported provider match was confirmed.";
      break;
    case "ambiguous_company_match":
      strategicVerdict = "Indirect company match";
      summary = `Stratum found openings only after falling back to an alternate ATS token${matchedAs ? ` (${matchedAs})` : ""}. Treat this brief as tentative.`;
      watchlistReadExplanation =
        "Interpretation is withheld because the company match is indirect and could point at the wrong ATS token.";
      break;
    case "supported_provider_matched_with_observed_openings":
      break;
  }

  return {
    companyName,
    jobs,
    proofRoles: proofRoleSelection.roles,
    providerAttempts: attempts,
    providerAttemptSummaries: providerSummaries,
    proofRoleGrounding: proofRoleSelection.grounding,
    proofRoleGroundingExplanation: proofRoleSelection.explanation,
    hiringMix,
    hiringVelocity: "Unknown",
    strategicVerdict,
    engineeringVsSalesRatio,
    keywordFindings: [],
    notableRoles: undefined,
    summary,
    analyzedAt: new Date().toISOString(),
    analysisTimeMs,
    apiSource,
    matchedAs,
    matchedCompanyName: companyResolution.matchedCompanyName,
    resultState,
    resultStateExplanation,
    companyMatchConfidence: companyMatchConfidence.level,
    companyMatchExplanation: companyMatchConfidence.explanation,
    companyResolutionState: companyResolution.state,
    companyResolutionExplanation: companyResolution.explanation,
    sourceCoverageCompleteness: sourceCoverage.completeness,
    sourceCoverageExplanation: sourceCoverage.explanation,
    watchlistReadConfidence: "none",
    watchlistReadExplanation,
    resolutionKind,
    sourceInputMode,
    requestedSourceHint,
    providerFailures: attempts.filter((attempt) => attempt.status === "error").length,
    providerFailureExplanation,
    unsupportedSourcePattern,
    unsupportedSourcePatternExplanation,
    artifactOrigin: "live",
  };
}

function buildWatchlistSummary(args: {
  label: ApprovedWatchlistLabel;
  jobs: Job[];
  proofRoles: Job[];
  apiSource: JobBoardSource | null;
  confidence: ConfidenceLevel;
  companyMatchConfidence: ConfidenceLevel;
  proofRoleSelection: ProofRoleSelection;
}): string {
  const { label, jobs, proofRoles, apiSource, confidence, companyMatchConfidence, proofRoleSelection } = args;

  return buildApprovedWatchlistSummary({
    label,
    jobs,
    proofRoles,
    apiSource,
    watchlistReadConfidence: confidence,
    companyMatchConfidence,
    proofRoleGrounding: proofRoleSelection.grounding,
  });
}

export interface StratumResult {
  companyName: string;
  jobs: Job[];
  proofRoles: Job[];
  providerAttempts: FetchAttempt[];
  providerAttemptSummaries: ProviderAttemptSummary[];
  proofRoleGrounding: ProofRoleGrounding;
  proofRoleGroundingExplanation: string;
  hiringMix: DepartmentBreakdown[];
  hiringVelocity: string;
  strategicVerdict: string;
  engineeringVsSalesRatio: string;
  keywordFindings: string[];
  notableRoles?: string[];
  summary: string;
  thoughtSummary?: string;
  analyzedAt: string;
  analysisTimeMs: number;
  apiSource?: JobBoardSource | null;
  matchedAs?: string;
  resultStateExplanation: string;
  resultState: StratumResultState;
  companyMatchConfidence: ConfidenceLevel;
  companyMatchExplanation: string;
  companyResolutionState: CompanyResolutionState;
  companyResolutionExplanation: string;
  sourceCoverageCompleteness: SourceCoverageCompleteness;
  sourceCoverageExplanation: string;
  watchlistReadConfidence: ConfidenceLevel;
  watchlistReadExplanation: string;
  resolutionKind: CompanyResolutionKind | null;
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
  providerFailures: number;
  providerFailureExplanation: string;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  unsupportedSourcePatternExplanation: string | null;
  artifactOrigin: BriefArtifactOrigin;
  loadedFromCache?: boolean;
  cachedAt?: string;
  briefId?: string;
  watchlistEntryId?: string;
  watchlistId?: string;
  watchlistName?: string;
  matchedCompanyName?: string;
  briefCreatedAt?: string;
  briefUpdatedAt?: string;
  limitsSnapshot?: string[];
  manualRefreshRequested?: boolean;
  manualRefreshBypassedCache?: boolean;
  watchlistMonitoring?: WatchlistMonitoringSnapshot & {
    briefPosition?: "latest" | "previous" | "older";
  };
}

export class StratumInvestigator {
  private startTime = 0;

  async investigate(companyName: string): Promise<StratumResult> {
    this.startTime = Date.now();
    const trimmed = companyName.trim();
    if (!trimmed) throw new Error("Company name is required");
    if (
      process.env.STRATUM_E2E_MODE === "1" &&
      process.env.STRATUM_E2E_THROW_QUERY?.trim() === trimmed
    ) {
      throw new Error("Simulated E2E monitoring failure.");
    }

    const fetchResult = await fetchCompanyJobs(trimmed);
    const {
      jobs,
      source: apiSource,
      matchedAs,
      resolutionKind,
      attempts,
      normalizedToken,
      sourceInputMode,
      requestedSourceHint,
      unsupportedSourcePattern,
    } = fetchResult;
    const elapsed = Date.now() - this.startTime;
    const hiringMix = aggregateJobsByDepartment(jobs);
    const deterministicRatio = calculateEngineeringVsSalesRatio(jobs);
    const providerSummaries = buildProviderAttemptSummaries({
      attempts,
      matchedSource: apiSource ?? null,
      sourceInputMode,
      requestedSourceHint,
    });
    const companyResolution = deriveCompanyResolutionAssessment({
      companyName: trimmed,
      source: apiSource,
      resolutionKind,
      matchedAs,
      normalizedToken,
      sourceInputMode,
      requestedSourceHint,
      attempts,
    });
    const resultState = deriveResultState({
      jobs,
      source: apiSource,
      attempts,
      companyResolutionState: companyResolution.state,
      unsupportedSourcePattern,
    });
    const resultStateExplanation = buildResultStateExplanation({
      state: resultState,
      source: apiSource,
      sourceInputMode,
      requestedSourceHint,
      unsupportedSourcePattern,
    });
    const companyMatchConfidence = deriveCompanyMatchConfidence({
      source: apiSource,
      companyResolutionState: companyResolution.state,
    });
    const sourceCoverage = deriveSourceCoverageAssessment({
      state: resultState,
      source: apiSource,
      unsupportedSourcePattern,
      sourceInputMode,
      requestedSourceHint,
      providerSummaries,
    });
    const providerFailureExplanation = buildProviderFailureExplanation(providerSummaries);
    const unsupportedSourcePatternExplanation =
      buildUnsupportedSourcePatternExplanation(unsupportedSourcePattern);

    if (resultState !== "supported_provider_matched_with_observed_openings" && resultState !== "ambiguous_company_match") {
      return buildNoReadResult({
        companyName: trimmed,
        jobs,
        proofRoleSelection: selectProofRoles(jobs),
        hiringMix,
        engineeringVsSalesRatio: deterministicRatio,
        analysisTimeMs: elapsed,
        apiSource,
        matchedAs,
        resultState,
        resultStateExplanation,
        companyMatchConfidence,
        companyResolution,
        sourceCoverage,
        resolutionKind,
        unsupportedSourcePattern,
        unsupportedSourcePatternExplanation,
        sourceInputMode,
        requestedSourceHint,
        attempts,
        providerSummaries,
        providerFailureExplanation,
      });
    }

    const analysis: StratumAnalysisResult | null = await runStratumAnalysis(trimmed, jobs);
    const proofRoleSelection = selectProofRoles(jobs, analysis?.notableRoles);
    const watchlistReadConfidence = deriveWatchlistReadConfidence({
      state: resultState,
      jobs,
      proofRoleSelection,
      companyMatchConfidence: companyMatchConfidence.level,
      analysis,
    });

    if (!analysis) {
      return {
        companyName: trimmed,
        jobs,
        proofRoles: proofRoleSelection.roles,
        providerAttempts: attempts,
        providerAttemptSummaries: providerSummaries,
        proofRoleGrounding: proofRoleSelection.grounding,
        proofRoleGroundingExplanation: proofRoleSelection.explanation,
        hiringMix,
        hiringVelocity: "Unknown",
        strategicVerdict: "Watchlist read unavailable",
        engineeringVsSalesRatio: deterministicRatio,
        keywordFindings: [],
        notableRoles: undefined,
        summary: "Stratum observed open roles but could not complete a usable watchlist read for this result. Use the proof roles as the primary output.",
        analyzedAt: new Date().toISOString(),
        analysisTimeMs: elapsed,
        apiSource,
        matchedAs,
        matchedCompanyName: companyResolution.matchedCompanyName,
        resultState,
        resultStateExplanation,
        companyMatchConfidence: companyMatchConfidence.level,
        companyMatchExplanation: companyMatchConfidence.explanation,
        companyResolutionState: companyResolution.state,
        companyResolutionExplanation: companyResolution.explanation,
        sourceCoverageCompleteness: sourceCoverage.completeness,
        sourceCoverageExplanation: sourceCoverage.explanation,
        watchlistReadConfidence: watchlistReadConfidence.level,
        watchlistReadExplanation: watchlistReadConfidence.explanation,
        resolutionKind,
        sourceInputMode,
        requestedSourceHint,
        providerFailures: attempts.filter((attempt) => attempt.status === "error").length,
        providerFailureExplanation,
        unsupportedSourcePattern,
        unsupportedSourcePatternExplanation,
        artifactOrigin: "live",
      };
    }

    const restrainedVerdict = deriveApprovedWatchlistLabel({
      jobs,
      companyMatchConfidence: companyMatchConfidence.level,
      watchlistReadConfidence: watchlistReadConfidence.level,
    });
    const restrainedSummary = buildWatchlistSummary({
      label: restrainedVerdict,
      jobs,
      proofRoles: proofRoleSelection.roles,
      apiSource,
      confidence: watchlistReadConfidence.level,
      companyMatchConfidence: companyMatchConfidence.level,
      proofRoleSelection,
    });
    const restrainedVelocity =
      watchlistReadConfidence.level === "high" || watchlistReadConfidence.level === "medium"
        ? analysis.hiringVelocity
        : "Unknown";

    return {
      companyName: trimmed,
      jobs,
      proofRoles: proofRoleSelection.roles,
      providerAttempts: attempts,
      providerAttemptSummaries: providerSummaries,
      proofRoleGrounding: proofRoleSelection.grounding,
      proofRoleGroundingExplanation: proofRoleSelection.explanation,
      hiringMix,
      hiringVelocity: restrainedVelocity,
      strategicVerdict: restrainedVerdict,
      engineeringVsSalesRatio: deterministicRatio,
      keywordFindings: analysis.keywordFindings,
      notableRoles: analysis.notableRoles,
      summary: restrainedSummary,
      thoughtSummary: analysis.thoughtSummary,
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
      apiSource,
      matchedAs,
      matchedCompanyName: companyResolution.matchedCompanyName,
      resultState,
      resultStateExplanation,
      companyMatchConfidence: companyMatchConfidence.level,
      companyMatchExplanation: companyMatchConfidence.explanation,
      companyResolutionState: companyResolution.state,
      companyResolutionExplanation: companyResolution.explanation,
      sourceCoverageCompleteness: sourceCoverage.completeness,
      sourceCoverageExplanation: sourceCoverage.explanation,
      watchlistReadConfidence: watchlistReadConfidence.level,
      watchlistReadExplanation: watchlistReadConfidence.explanation,
      resolutionKind,
      sourceInputMode,
      requestedSourceHint,
      providerFailures: attempts.filter((attempt) => attempt.status === "error").length,
      providerFailureExplanation,
      unsupportedSourcePattern,
      unsupportedSourcePatternExplanation,
      artifactOrigin: "live",
    };
  }
}
