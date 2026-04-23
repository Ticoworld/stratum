import { formatSourceLabel } from "@/lib/briefs/presentation";
import { fetchCompanyJobs, type JobBoardSource, type SourceCandidateMatch } from "@/lib/api/boards";
import { formatWatchlistTargetIdentity } from "@/lib/watchlists/identity";
import type { CompanyResolutionKind, SourceInputMode, UnsupportedSourcePattern } from "@/lib/api/boards";

export type CompanyIntakeInputKind =
  | "company_name"
  | "company_website"
  | "linkedin_company_url"
  | "supported_source_url"
  | "unsupported_source_url";

export type CompanyIntakeSupportStatus = "supported" | "unsupported" | "unresolved";
export type CompanyIntakeConfidence = "high" | "medium" | "low";
export type CompanyIntakeCandidateStatus =
  | "jobs_found"
  | "zero_jobs"
  | "not_found"
  | "error"
  | "not_applicable"
  | "not_attempted_after_match";

export interface CompanyIntakeCandidate {
  source: JobBoardSource;
  label: string;
  status: CompanyIntakeCandidateStatus;
  note: string;
  rank: number;
}

export interface CompanyIntakeChoice {
  key: string;
  companyLabel: string;
  likelyCareersPage: string | null;
  atsProvider: string;
  confidence: CompanyIntakeConfidence;
  supportStatus: CompanyIntakeSupportStatus;
  explanation: string;
  matchedAs: string | null;
  source: JobBoardSource;
}

export interface CompanyIntakeResolution {
  input: string;
  inputKind: CompanyIntakeInputKind;
  canonicalCompanyLabel: string;
  trackingQuery: string;
  likelyCareersPage: string | null;
  atsProvider: string | null;
  supportStatus: CompanyIntakeSupportStatus;
  confidence: CompanyIntakeConfidence;
  explanation: string;
  sourceInputMode: SourceInputMode;
  requestedSourceHint: JobBoardSource | null;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  resolutionKind: CompanyResolutionKind | null;
  matchedAs: string | null;
  confidenceReason: string;
  nextStepHint: string;
  sourceCandidates: CompanyIntakeCandidate[];
  candidateChoices: CompanyIntakeChoice[];
  candidateChoiceRequired: boolean;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const SUPPORTED_PROVIDER_LABELS = new Set(["Greenhouse", "Lever", "Ashby", "Workable"]);

function isLinkedInCompanyUrl(value: string): boolean {
  return /(^|\/\/)([\w-]+\.)?linkedin\.com\/company\/?/i.test(value);
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function classifyInputKind(input: string, sourceProvider: string | null): CompanyIntakeInputKind {
  const parsed = tryParseUrl(input);
  if (!parsed) return "company_name";
  if (isLinkedInCompanyUrl(input)) return "linkedin_company_url";
  if (sourceProvider) {
    return SUPPORTED_PROVIDER_LABELS.has(sourceProvider)
      ? "supported_source_url"
      : "unsupported_source_url";
  }
  return "company_website";
}

function buildSourceUrl(source: JobBoardSource, token: string): string {
  switch (source) {
    case "GREENHOUSE":
      return `https://boards.greenhouse.io/${token}`;
    case "LEVER":
      return `https://jobs.lever.co/${token}`;
    case "ASHBY":
      return `https://jobs.ashbyhq.com/${token}`;
    case "WORKABLE":
      return `https://apply.workable.com/${token}`;
  }
}

function buildConfidence(args: {
  resolutionKind: CompanyResolutionKind | null;
  source: JobBoardSource | null;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  jobsCount: number;
  sourceInputMode: SourceInputMode;
}): CompanyIntakeConfidence {
  const { resolutionKind, source, unsupportedSourcePattern, jobsCount, sourceInputMode } = args;

  if (unsupportedSourcePattern) return "low";
  if (!source || !resolutionKind) return "low";

  if (jobsCount === 0 && source === "WORKABLE" && sourceInputMode !== "supported_source_input") {
    return "low";
  }

  if (resolutionKind === "direct") {
    return "high";
  }

  if (resolutionKind === "alias") return "medium";

  return "low";
}

function buildExplanation(args: {
  confidence: CompanyIntakeConfidence;
  supportStatus: CompanyIntakeSupportStatus;
  source: JobBoardSource | null;
  sourceUrl: string | null;
  resolutionKind: CompanyResolutionKind | null;
  matchedAs: string | null;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  requestedSourceHint: JobBoardSource | null;
  jobsCount: number;
  sourceInputMode: SourceInputMode;
}): string {
  const {
    confidence,
    supportStatus,
    source,
    sourceUrl,
    resolutionKind,
    matchedAs,
    unsupportedSourcePattern,
    requestedSourceHint,
    jobsCount,
    sourceInputMode,
  } = args;

  if (supportStatus === "unsupported") {
    return unsupportedSourcePattern
      ? `Stratum found a hiring surface, but it matches an unsupported source pattern (${unsupportedSourcePattern}). The source is visible, but it is not on a supported ATS path.`
      : "Stratum found a hiring surface, but it is not on a supported ATS path.";
  }

  if (supportStatus === "unresolved") {
    return requestedSourceHint
      ? `The specific ${formatSourceLabel(requestedSourceHint)} link you provided could not be confirmed or returned a dead/invalid response. Refine the URL or use a different source.`
      : "Stratum could not confidently resolve a supported hiring source from this input. Refine the company or use the manual ATS/careers URL fallback if you already know the source.";
  }

  if (!source || !sourceUrl) {
    return "Stratum found a likely hiring source, but the source could not be grounded cleanly enough yet.";
  }

  if (confidence === "high") {
    return `Stratum found a direct ${formatSourceLabel(source)} source and it looks directly usable.`;
  }

  if (confidence === "medium") {
    return resolutionKind === "alias"
      ? `Stratum found a likely ${formatSourceLabel(source)} source, but the company match depends on a known alias${matchedAs ? ` (${matchedAs})` : ""}. Confirming will create the tracked company and start a baseline capture.`
      : `Stratum found a likely ${formatSourceLabel(source)} source, but the source certainty is weaker than a direct match. Confirming will create the tracked company and start a baseline capture.`;
  }

  if (confidence === "low" && jobsCount === 0 && source === "WORKABLE" && sourceInputMode !== "supported_source_input") {
    return `Stratum found a likely ${formatSourceLabel(source)} source, but no openings are visible and the account may be a parked shell. Confirm only if you want to proceed with caution.`;
  }

  return `Stratum found a likely ${formatSourceLabel(source)} source, but the signal is too weak to treat as certain. Confirm only if you want to proceed with caution.`;
}

function buildConfidenceReason(args: {
  confidence: CompanyIntakeConfidence;
  supportStatus: CompanyIntakeSupportStatus;
  source: JobBoardSource | null;
  resolutionKind: CompanyResolutionKind | null;
  jobsCount: number;
  unsupportedSourcePattern: UnsupportedSourcePattern | null;
  requestedSourceHint: JobBoardSource | null;
}): string {
  const { confidence, supportStatus, source, resolutionKind, jobsCount, unsupportedSourcePattern, requestedSourceHint } = args;

  if (supportStatus === "unsupported") {
    return unsupportedSourcePattern
      ? `Visible careers source, but it matches ${unsupportedSourcePattern}, which Stratum does not treat as a supported ATS path.`
      : "Visible careers source, but it is outside Stratum's supported ATS paths.";
  }

  if (supportStatus === "unresolved") {
    return requestedSourceHint
      ? `The explicit ${formatSourceLabel(requestedSourceHint)} link returned an invalid or dead response.`
      : "No supported ATS path was confirmed, so the match stays cautious.";
  }

  if (!source) {
    return "A likely source was seen, but it could not be grounded to a supported ATS provider.";
  }

  if (confidence === "high") {
    return jobsCount > 0
      ? `Direct ${formatSourceLabel(source)} match with visible openings and a directly usable source.`
      : `Direct ${formatSourceLabel(source)} match with a directly usable source, even though no openings were visible at fetch time.`;
  }

  if (confidence === "medium") {
    if (jobsCount === 0) {
      return `Supported ${formatSourceLabel(source)} source identified, but no openings were visible at fetch time.`;
    }

    if (resolutionKind === "alias") {
      return `Supported ${formatSourceLabel(source)} source identified through a known alias, so the match is slightly weaker than a direct company match.`;
    }

    return `Supported ${formatSourceLabel(source)} source identified, but the match is weaker than a direct company-only confirmation.`;
  }

  if (jobsCount === 0 && source === "WORKABLE") {
    return `Supported ${formatSourceLabel(source)} source identified, but the evidence is only an empty account shell.`;
  }

  return `Supported ${formatSourceLabel(source)} source identified, but the signal is too weak to treat as certain.`;
}

function buildNextStepHint(args: {
  supportStatus: CompanyIntakeSupportStatus;
  confidence: CompanyIntakeConfidence;
  candidateChoiceRequired: boolean;
  likelyCareersPage: string | null;
}): string {
  const { supportStatus, confidence, candidateChoiceRequired, likelyCareersPage } = args;

  if (candidateChoiceRequired) {
    return "Choose one supported source before confirming.";
  }

  if (supportStatus === "unsupported") {
    return "Track only if you want a limited, unsupported target in the watchlist.";
  }

  if (supportStatus === "unresolved") {
    if (likelyCareersPage) {
      return "Review the detected source URL manually, or refine the company name to try again.";
    }
    return "Refine the company name, or paste a known ATS/careers URL to resolve manually.";
  }

  if (confidence === "low") {
    return "Confirm only if you are comfortable proceeding with a cautious match.";
  }

  if (confidence === "medium") {
    return "Confirm to create the target and start baseline capture with a modest confidence level.";
  }

  return "Confirm to create the tracked company and start baseline capture.";
}

function buildCandidateChoices(args: {
  candidateMatches: SourceCandidateMatch[];
  canonicalCompanyLabel: string;
  sourceInputMode: SourceInputMode;
  supportStatus: CompanyIntakeSupportStatus;
  requestedSourceHint: JobBoardSource | null;
  likelyCareersPage: string | null;
}): CompanyIntakeChoice[] {
  const { candidateMatches, canonicalCompanyLabel, sourceInputMode, supportStatus, requestedSourceHint, likelyCareersPage } = args;

  const choices = candidateMatches.map((candidate, index) => {
    const candidateLikelyCareersPage = buildSourceUrl(candidate.source, candidate.token);
    const confidence: CompanyIntakeConfidence =
      candidate.jobsCount === 0 && candidate.source === "WORKABLE" && sourceInputMode !== "supported_source_input"
        ? "low"
      : candidate.resolutionKind === "direct"
        ? "high"
        : candidate.resolutionKind === "alias"
          ? "medium"
          : "low";
          
    const explanation =
      candidate.jobsCount === 0
        ? `Supported ${formatSourceLabel(candidate.source)} source identified, but the evidence is only an empty account shell.`
      : candidate.resolutionKind === "direct"
        ? `Direct ${formatSourceLabel(candidate.source)} match with visible openings.`
        : candidate.resolutionKind === "alias"
          ? `Supported ${formatSourceLabel(candidate.source)} source found through a known alias${candidate.matchedAs ? ` (${candidate.matchedAs})` : ""}.`
          : `Supported ${formatSourceLabel(candidate.source)} source found, but the match is weaker than a direct company-only confirmation.`;

    return {
      key: `${candidate.source}-${candidate.token}-${index}`,
      companyLabel: canonicalCompanyLabel,
      likelyCareersPage: candidateLikelyCareersPage,
      atsProvider: formatSourceLabel(candidate.source),
      confidence,
      supportStatus: (supportStatus === "unsupported" ? "unsupported" : "supported") as CompanyIntakeSupportStatus,
      explanation:
        requestedSourceHint && sourceInputMode === "supported_source_input"
          ? `Explicit source hint: ${formatSourceLabel(requestedSourceHint)}. ${explanation}`
          : explanation,
      matchedAs: candidate.matchedAs,
      source: candidate.source,
    };
  });

  if (choices.length === 0 && likelyCareersPage) {
    choices.push({
      key: "fallback-hint",
      companyLabel: canonicalCompanyLabel,
      likelyCareersPage,
      atsProvider: "Unknown Provider",
      confidence: "low",
      supportStatus: (supportStatus === "unresolved" ? "unresolved" : "unsupported") as CompanyIntakeSupportStatus,
      explanation: "Detected external careers source URL, but ATS logic is unsupported or hidden.",
      matchedAs: null,
      source: null as any,
    });
  }

  return choices;
}

function buildSourceCandidates(args: {
  attempts: Array<{
    source: JobBoardSource;
    status: string;
    jobsCount: number;
    errorMessage?: string;
  }>;
  requestedSourceHint: JobBoardSource | null;
  source: JobBoardSource | null;
}): CompanyIntakeCandidate[] {
  const { attempts, requestedSourceHint, source } = args;

  return attempts.slice(0, 4).map((attempt, index) => {
    let note = "Checked while resolving the company.";

    switch (attempt.status) {
      case "jobs_found":
        note = "Openings were found on this source.";
        break;
      case "zero_jobs":
        note = "A supported source was confirmed, but no openings were visible.";
        break;
      case "not_found":
        note = "No supported match was confirmed on this source.";
        break;
      case "error":
        note = attempt.errorMessage ? `Provider request failed: ${attempt.errorMessage}.` : "Provider request failed.";
        break;
      case "not_applicable":
        note = requestedSourceHint === attempt.source
          ? "This source was the explicit source hint, so Stratum kept the check narrow."
          : "Not checked because a direct source had already been confirmed.";
        break;
      case "not_attempted_after_match":
        note = source
          ? "Stratum stopped after the first supported match and did not need this source."
          : "Not attempted after a prior match.";
        break;
    }

    return {
      source: attempt.source,
      label: formatSourceLabel(attempt.source),
      status: attempt.status as CompanyIntakeCandidateStatus,
      note,
      rank: index + 1,
    };
  });
}

export async function resolveCompanyIntake(input: string): Promise<CompanyIntakeResolution> {
  const trimmed = normalizeWhitespace(input);
  if (!trimmed) {
    throw new Error("Company or source input is required.");
  }

  const previewIdentity = formatWatchlistTargetIdentity(trimmed);
  const inputKind = classifyInputKind(trimmed, previewIdentity.sourceProvider);
  const queryForFetch =
    inputKind === "supported_source_url" || inputKind === "unsupported_source_url"
      ? trimmed
      : previewIdentity.primary !== "Unresolved target"
        ? previewIdentity.primary
        : trimmed;

  const fetchResult = await fetchCompanyJobs(queryForFetch);
  const canonicalCompanyLabel =
    fetchResult.matchedAs?.trim() ||
    (previewIdentity.primary !== "Unresolved target" ? previewIdentity.primary : trimmed);
  const supportStatus: CompanyIntakeSupportStatus = fetchResult.unsupportedSourcePattern
    ? "unsupported"
    : fetchResult.source
      ? "supported"
      : "unresolved";
  const atsProvider = fetchResult.source ? formatSourceLabel(fetchResult.source) : previewIdentity.sourceProvider;
  const likelyCareersPage =
    fetchResult.source && fetchResult.resolvedToken
      ? buildSourceUrl(fetchResult.source, fetchResult.resolvedToken)
      : inputKind === "supported_source_url" || inputKind === "unsupported_source_url"
        ? trimmed
        : null;
  const confidence = buildConfidence({
    resolutionKind: fetchResult.resolutionKind,
    source: fetchResult.source,
    unsupportedSourcePattern: fetchResult.unsupportedSourcePattern,
    jobsCount: fetchResult.jobs.length,
    sourceInputMode: fetchResult.sourceInputMode,
  });
  const confidenceReason = buildConfidenceReason({
    confidence,
    supportStatus,
    source: fetchResult.source,
    resolutionKind: fetchResult.resolutionKind,
    jobsCount: fetchResult.jobs.length,
    unsupportedSourcePattern: fetchResult.unsupportedSourcePattern,
    requestedSourceHint: fetchResult.requestedSourceHint,
  });
  const sourceCandidates = buildSourceCandidates({
    attempts: fetchResult.attempts,
    requestedSourceHint: fetchResult.requestedSourceHint,
    source: fetchResult.source,
  });
  const candidateChoices = buildCandidateChoices({
    candidateMatches: fetchResult.candidateMatches,
    canonicalCompanyLabel,
    sourceInputMode: fetchResult.sourceInputMode,
    supportStatus,
    requestedSourceHint: fetchResult.requestedSourceHint,
    likelyCareersPage,
  });
  
  const highMediumMatches = fetchResult.candidateMatches.filter(m => m.jobsCount > 0);
  const candidateChoiceRequired = supportStatus !== "unsupported" && supportStatus !== "unresolved" && highMediumMatches.length > 1;
  const nextStepHint = buildNextStepHint({
    supportStatus,
    confidence,
    candidateChoiceRequired,
    likelyCareersPage,
  });

  return {
    input: trimmed,
    inputKind,
    canonicalCompanyLabel,
    trackingQuery: canonicalCompanyLabel,
    likelyCareersPage,
    atsProvider,
    supportStatus,
    confidence,
    explanation: buildExplanation({
      confidence,
      supportStatus,
      source: fetchResult.source,
      sourceUrl: likelyCareersPage,
      resolutionKind: fetchResult.resolutionKind,
      matchedAs: fetchResult.matchedAs ?? null,
      unsupportedSourcePattern: fetchResult.unsupportedSourcePattern,
      requestedSourceHint: fetchResult.requestedSourceHint,
      jobsCount: fetchResult.jobs.length,
      sourceInputMode: fetchResult.sourceInputMode,
    }),
    sourceInputMode: fetchResult.sourceInputMode,
    requestedSourceHint: fetchResult.requestedSourceHint,
    unsupportedSourcePattern: fetchResult.unsupportedSourcePattern,
    resolutionKind: fetchResult.resolutionKind,
    matchedAs: fetchResult.matchedAs ?? null,
    confidenceReason,
    nextStepHint,
    sourceCandidates,
    candidateChoices,
    candidateChoiceRequired,
  };
}
