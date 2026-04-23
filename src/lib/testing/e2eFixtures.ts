import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stratumBriefs } from "@/db/schema/stratumBriefs";
import {
  stratumWatchlistEntries,
  stratumWatchlists,
} from "@/db/schema/stratumWatchlists";
import type { Job } from "@/lib/api/boards";
import type { StratumResult } from "@/lib/services/StratumInvestigator";
import { createMonitoringAttemptEvent } from "@/lib/watchlists/monitoringEventRepository";
import { recordMonitoringAttempt } from "@/lib/watchlists/monitoringAttemptRecorder";

export interface SeededE2eFixtures {
  providerFailureBriefId: string;
  ambiguousBriefId: string;
  phase9HistoryWatchlistId: string;
  phase9HistoryEntryId: string;
  phase9OlderBriefId: string;
  phase9PreviousBriefId: string;
  phase9LatestBriefId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

const tenantlessCompatibilityScope = {
  tenantlessCompatibility: true as const,
  compatibilityReason: "e2e_fixture",
};

function toDate(value: string): Date {
  return new Date(value);
}

function sanitizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeRole(
  title: string,
  overrides: Partial<{
    location: string | null;
    department: string | null;
    source: "GREENHOUSE";
    roleId: string | null;
    roleIdType: string | null;
    requisitionId: string | null;
    jobUrl: string | null;
    applyUrl: string | null;
    sourceTimestamp: string | null;
    sourceTimestampType: "updated_at" | null;
    observedAt: string;
  }> = {}
): Job {
  return {
    title,
    location: "Remote",
    department: "Engineering",
    source: "GREENHOUSE",
    roleId: randomUUID().slice(0, 8),
    roleIdType: "posting_id",
    requisitionId: null,
    jobUrl: `https://boards.greenhouse.io/example/jobs/${randomUUID().slice(0, 6)}`,
    applyUrl: `https://boards.greenhouse.io/example/jobs/${randomUUID().slice(0, 6)}`,
    sourceTimestamp: nowIso(),
    sourceTimestampType: "updated_at",
    observedAt: nowIso(),
    ...overrides,
  } as Job;
}

async function insertSyntheticBrief(args: {
  queriedCompanyName: string;
  matchedCompanyName: string;
  resultState: "provider_failure" | "ambiguous_company_match";
  strategicVerdict: string;
  summary: string;
  companyMatchConfidence: "none" | "low";
  companyMatchExplanation: string;
  companyResolutionState: "no_supported_match" | "ambiguous_low_confidence_match";
  companyResolutionExplanation: string;
  sourceCoverageCompleteness: "inconclusive_due_to_provider_failure" | "single_matched_provider_only";
  sourceCoverageExplanation: string;
  watchlistReadExplanation: string;
  providerFailures: number;
  jobs?: Job[];
  proofRoles?: Job[];
}): Promise<string> {
  const briefId = randomUUID();
  const createdAt = nowIso();
  const updatedAt = createdAt;
  const jobs = args.jobs ?? [];
  const proofRoles = args.proofRoles ?? [];
  const limitsSnapshot = [
    args.sourceCoverageExplanation,
    args.watchlistReadExplanation,
    "Stratum reflects supported ATS openings only. It is not a full company view.",
    "One matched provider is not full company coverage.",
  ];

  const resultSnapshot = {
    companyName: args.queriedCompanyName,
    jobs,
    proofRoles,
    providerAttempts: [],
    providerAttemptSummaries:
      args.resultState === "provider_failure"
        ? [
            {
              source: "GREENHOUSE",
              status: "error",
              jobsCount: 0,
              tokensTried: ["example"],
              errorMessages: ["Greenhouse: 500"],
              usedForBrief: false,
              note: "This provider request failed during the search.",
            },
            {
              source: "LEVER",
              status: "not_found",
              jobsCount: 0,
              tokensTried: ["example"],
              errorMessages: [],
              usedForBrief: false,
              note: "No supported board or token match was confirmed on this provider.",
            },
          ]
        : [
            {
              source: "GREENHOUSE",
              status: "jobs_found",
              jobsCount: jobs.length,
              tokensTried: ["example-fallback"],
              errorMessages: [],
              usedForBrief: true,
              note: `Returned ${jobs.length} observed open role${jobs.length === 1 ? "" : "s"} and anchors this brief.`,
            },
          ],
    proofRoleGrounding: proofRoles.length > 0 ? "fallback" : "none",
    proofRoleGroundingExplanation:
      proofRoles.length > 0
        ? "The read could not be grounded to model-picked role titles, so Stratum falls back to the displayed proof roles."
        : "No proof roles are available because no observed roles were returned.",
    hiringMix: [],
    hiringVelocity: "Unknown",
    strategicVerdict: args.strategicVerdict,
    engineeringVsSalesRatio: "-",
    keywordFindings: [],
    summary: args.summary,
    analyzedAt: createdAt,
    analysisTimeMs: 0,
    apiSource: args.resultState === "ambiguous_company_match" ? "GREENHOUSE" : null,
    matchedAs: args.matchedCompanyName,
    matchedCompanyName: args.matchedCompanyName,
    resultState: args.resultState,
    resultStateExplanation:
      args.resultState === "provider_failure"
        ? "Supported provider requests failed, so Stratum cannot treat absence as evidence."
        : "Stratum observed openings, but the company resolution remained weak enough that the watchlist read is withheld.",
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    companyResolutionState: args.companyResolutionState,
    companyResolutionExplanation: args.companyResolutionExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: args.sourceCoverageExplanation,
    watchlistReadConfidence: "none",
    watchlistReadExplanation: args.watchlistReadExplanation,
    resolutionKind: args.resultState === "ambiguous_company_match" ? "fallback" : null,
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    providerFailures: args.providerFailures,
    providerFailureExplanation: args.providerFailures
      ? `${args.providerFailures} provider request failed during this search.`
      : "No provider request failures were recorded during this search.",
    unsupportedSourcePattern: null,
    unsupportedSourcePatternExplanation: null,
    artifactOrigin: "saved",
    loadedFromCache: false,
    cachedAt: undefined,
    briefId,
    briefCreatedAt: createdAt,
    briefUpdatedAt: updatedAt,
    limitsSnapshot,
  } as StratumResult;

  await db.insert(stratumBriefs).values({
    id: briefId,
    watchlistEntryId: null,
    queriedCompanyName: args.queriedCompanyName,
    matchedCompanyName: args.matchedCompanyName,
    atsSourceUsed: args.resultState === "ambiguous_company_match" ? "GREENHOUSE" : null,
    resultState: args.resultState,
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: args.sourceCoverageExplanation,
    watchlistReadLabel: args.strategicVerdict,
    watchlistReadSummary: args.summary,
    watchlistReadConfidence: "none",
    watchlistReadExplanation: args.watchlistReadExplanation,
    proofRoleGrounding: proofRoles.length > 0 ? "fallback" : "none",
    proofRoleGroundingExplanation:
      proofRoles.length > 0
        ? "The read could not be grounded to model-picked role titles, so Stratum falls back to the displayed proof roles."
        : "No proof roles are available because no observed roles were returned.",
    jobsObservedCount: jobs.length,
    proofRolesSnapshot: sanitizeJson(proofRoles),
    limitsSnapshot: sanitizeJson(limitsSnapshot),
    resultSnapshot: sanitizeJson(resultSnapshot),
    unsupportedSourcePattern: null,
    providerFailures: args.providerFailures,
    createdAt: toDate(createdAt),
    updatedAt: toDate(updatedAt),
  });

  return briefId;
}

async function insertSavedObservedBrief(args: {
  watchlistEntryId: string;
  queriedCompanyName: string;
  matchedCompanyName: string;
  strategicVerdict: string;
  summary: string;
  watchlistReadConfidence: "low" | "medium" | "high";
  watchlistReadExplanation: string;
  companyMatchConfidence: "high" | "medium" | "low";
  companyMatchExplanation: string;
  sourceCoverageCompleteness: "single_matched_provider_only";
  sourceCoverageExplanation: string;
  proofRoleGrounding: "partial" | "exact";
  proofRoleGroundingExplanation: string;
  jobs: Job[];
  proofRoles: Job[];
  createdAt: string;
  updatedAt?: string;
}): Promise<string> {
  const briefId = randomUUID();
  const updatedAt = args.updatedAt ?? args.createdAt;
  const limitsSnapshot = [
    args.sourceCoverageExplanation,
    args.watchlistReadExplanation,
    "Stratum reflects supported ATS openings only. It is not a full company view.",
    "One matched provider is not full company coverage.",
  ];

  const resultSnapshot = {
    companyName: args.queriedCompanyName,
    jobs: args.jobs,
    proofRoles: args.proofRoles,
    providerAttempts: [
      {
        token: "phase9-example",
        source: "GREENHOUSE",
        status: "jobs_found",
        jobsCount: args.jobs.length,
      },
    ],
    providerAttemptSummaries: [
      {
        source: "GREENHOUSE",
        status: "jobs_found",
        jobsCount: args.jobs.length,
        tokensTried: ["phase9-example"],
        errorMessages: [],
        usedForBrief: true,
        note: `Returned ${args.jobs.length} observed open role${args.jobs.length === 1 ? "" : "s"} and anchors this brief.`,
      },
    ],
    proofRoleGrounding: args.proofRoleGrounding,
    proofRoleGroundingExplanation: args.proofRoleGroundingExplanation,
    hiringMix: [],
    hiringVelocity: "Unknown",
    strategicVerdict: args.strategicVerdict,
    engineeringVsSalesRatio: "-",
    keywordFindings: [],
    notableRoles: args.proofRoles.map((role) => role.title),
    summary: args.summary,
    analyzedAt: args.createdAt,
    analysisTimeMs: 0,
    apiSource: "GREENHOUSE",
    matchedAs: args.matchedCompanyName,
    matchedCompanyName: args.matchedCompanyName,
    resultState: "supported_provider_matched_with_observed_openings",
    resultStateExplanation: "Stratum confirmed Greenhouse and observed current openings there.",
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    companyResolutionState: "direct_confirmed_match",
    companyResolutionExplanation: "The requested company name resolved directly to the matched ATS token.",
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: args.sourceCoverageExplanation,
    watchlistReadConfidence: args.watchlistReadConfidence,
    watchlistReadExplanation: args.watchlistReadExplanation,
    resolutionKind: "direct",
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    providerFailures: 0,
    providerFailureExplanation: "No provider request failures were recorded during this search.",
    unsupportedSourcePattern: null,
    unsupportedSourcePatternExplanation: null,
    artifactOrigin: "saved",
    loadedFromCache: false,
    cachedAt: undefined,
    briefId,
    watchlistEntryId: args.watchlistEntryId,
    briefCreatedAt: args.createdAt,
    briefUpdatedAt: updatedAt,
    limitsSnapshot,
  } as StratumResult;

  await db.insert(stratumBriefs).values({
    id: briefId,
    watchlistEntryId: args.watchlistEntryId,
    queriedCompanyName: args.queriedCompanyName,
    matchedCompanyName: args.matchedCompanyName,
    atsSourceUsed: "GREENHOUSE",
    resultState: "supported_provider_matched_with_observed_openings",
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: args.sourceCoverageExplanation,
    watchlistReadLabel: args.strategicVerdict,
    watchlistReadSummary: args.summary,
    watchlistReadConfidence: args.watchlistReadConfidence,
    watchlistReadExplanation: args.watchlistReadExplanation,
    proofRoleGrounding: args.proofRoleGrounding,
    proofRoleGroundingExplanation: args.proofRoleGroundingExplanation,
    jobsObservedCount: args.jobs.length,
    proofRolesSnapshot: sanitizeJson(args.proofRoles),
    limitsSnapshot: sanitizeJson(limitsSnapshot),
    resultSnapshot: sanitizeJson(resultSnapshot),
    unsupportedSourcePattern: null,
    providerFailures: 0,
    createdAt: toDate(args.createdAt),
    updatedAt: toDate(updatedAt),
  });

  return briefId;
}

export async function seedE2eFixtures(runKey: string): Promise<SeededE2eFixtures> {
  const phase9HistoryQuery = `Phase9 History Company ${runKey}`;
  const phase9HistoryWatchlistName = `Phase 9 Watchlist ${runKey}`;

  const providerFailureBriefId = await insertSyntheticBrief({
    queriedCompanyName: `Provider Failure ${runKey}`,
    matchedCompanyName: `Provider Failure ${runKey}`,
    resultState: "provider_failure",
    strategicVerdict: "Provider fetch failure",
    summary:
      "Stratum could not complete supported provider fetches reliably enough to produce a watchlist read. This result is inconclusive.",
    companyMatchConfidence: "none",
    companyMatchExplanation: "Stratum could not confirm a supported ATS match for this search.",
    companyResolutionState: "no_supported_match",
    companyResolutionExplanation: "Stratum could not confirm a supported ATS match for this query.",
    sourceCoverageCompleteness: "inconclusive_due_to_provider_failure",
    sourceCoverageExplanation: "Provider coverage is inconclusive because Greenhouse failed during the search.",
    watchlistReadExplanation:
      "Interpretation is withheld because provider fetches failed and absence cannot be trusted.",
    providerFailures: 1,
  });

  const ambiguousJobs = [makeRole("Backend Engineer"), makeRole("Site Reliability Engineer")];
  const ambiguousBriefId = await insertSyntheticBrief({
    queriedCompanyName: `Weak Match ${runKey}`,
    matchedCompanyName: "Example Fallback",
    resultState: "ambiguous_company_match",
    strategicVerdict: "Indirect company match",
    summary:
      "Stratum found openings only after falling back to an alternate ATS token (Example Fallback). Treat this brief as tentative.",
    companyMatchConfidence: "low",
    companyMatchExplanation:
      "The company match depends on a weak or conflicting ATS token resolution.",
    companyResolutionState: "ambiguous_low_confidence_match",
    companyResolutionExplanation:
      "Stratum only found evidence after switching away from the requested token to Example Fallback, and earlier attempts produced conflicting source signals.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation:
      "Stratum used Greenhouse and then stopped after the first provider returned openings. This remains one-provider, point-in-time evidence only.",
    watchlistReadExplanation:
      "Interpretation is withheld because the company match is indirect and could point at the wrong ATS token.",
    providerFailures: 0,
    jobs: ambiguousJobs,
    proofRoles: ambiguousJobs,
  });

  const watchlistId = randomUUID();
  const entryId = randomUUID();
  const createdAt = nowIso();

  await db.insert(stratumWatchlists).values({
    id: watchlistId,
    name: phase9HistoryWatchlistName,
    slug: `phase9-history-${runKey}`,
    createdAt: toDate(createdAt),
    updatedAt: toDate(createdAt),
  });

  await db.insert(stratumWatchlistEntries).values({
    id: entryId,
    watchlistId,
    requestedQuery: phase9HistoryQuery,
    normalizedQuery: phase9HistoryQuery.toLowerCase(),
    latestBriefId: null,
    latestMatchedCompanyName: null,
    latestResultState: null,
    latestWatchlistReadLabel: null,
    latestWatchlistReadConfidence: null,
    latestAtsSourceUsed: null,
    latestBriefCreatedAt: null,
    latestBriefUpdatedAt: null,
    createdAt: toDate(createdAt),
    updatedAt: toDate(createdAt),
  });

  const olderCreatedAt = "2026-03-28T09:00:00.000Z";
  const previousCreatedAt = "2026-03-29T09:00:00.000Z";
  const latestCreatedAt = "2026-03-30T09:00:00.000Z";
  const olderRoles = [makeRole("Platform Engineer")];
  const previousRoles = [makeRole("Platform Engineer"), makeRole("Product Designer")];
  const latestRoles = [
    makeRole("Platform Engineer"),
    makeRole("Product Designer"),
    makeRole("Account Executive", { department: "Go-To-Market" }),
  ];

  const phase9OlderBriefId = await insertSavedObservedBrief({
    watchlistEntryId: entryId,
    queriedCompanyName: phase9HistoryQuery,
    matchedCompanyName: "Phase9 History Company",
    strategicVerdict: "Initial technical signal",
    summary: "Observed roles were still narrow and technical in this saved brief.",
    watchlistReadConfidence: "low",
    watchlistReadExplanation: "Read confidence is low because only one observed role anchors this brief.",
    companyMatchConfidence: "medium",
    companyMatchExplanation: "The company match depends on a clean but still single-provider signal.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation:
      "Stratum used Greenhouse and then stopped after the first provider returned openings. This remains one-provider, point-in-time evidence only.",
    proofRoleGrounding: "partial",
    proofRoleGroundingExplanation:
      "The read is only partially grounded: 1 of 2 role titles from the read matched displayed proof roles.",
    jobs: olderRoles,
    proofRoles: olderRoles,
    createdAt: olderCreatedAt,
  });

  const phase9PreviousBriefId = await insertSavedObservedBrief({
    watchlistEntryId: entryId,
    queriedCompanyName: phase9HistoryQuery,
    matchedCompanyName: "Phase9 History Company",
    strategicVerdict: "Focused product hiring",
    summary: "Observed roles remained focused around product and engineering in this saved brief.",
    watchlistReadConfidence: "low",
    watchlistReadExplanation: "Read confidence is low because the displayed proof roles are still thin.",
    companyMatchConfidence: "low",
    companyMatchExplanation: "The company match depends on a weaker single-provider match than the latest brief.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation:
      "Stratum used Greenhouse and then stopped after the first provider returned openings. This remains one-provider, point-in-time evidence only.",
    proofRoleGrounding: "partial",
    proofRoleGroundingExplanation:
      "The read is only partially grounded: 2 of 3 role titles from the read matched displayed proof roles.",
    jobs: previousRoles,
    proofRoles: previousRoles,
    createdAt: previousCreatedAt,
  });

  const phase9LatestBriefId = await insertSavedObservedBrief({
    watchlistEntryId: entryId,
    queriedCompanyName: phase9HistoryQuery,
    matchedCompanyName: "Phase9 History Company",
    strategicVerdict: "Broader product and GTM buildout",
    summary: "Observed roles widened beyond product into commercial hiring in this saved brief.",
    watchlistReadConfidence: "medium",
    watchlistReadExplanation:
      "Read confidence is medium because the role pattern is visible but still limited to one matched provider.",
    companyMatchConfidence: "medium",
    companyMatchExplanation: "The company match is direct on the matched ATS source.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation:
      "Stratum used Greenhouse and then stopped after the first provider returned openings. This remains one-provider, point-in-time evidence only.",
    proofRoleGrounding: "exact",
    proofRoleGroundingExplanation:
      "The read is grounded in 3 displayed proof roles matched exactly by title.",
    jobs: [...latestRoles, makeRole("Revenue Operations Manager", { department: "Go-To-Market" })],
    proofRoles: latestRoles,
    createdAt: latestCreatedAt,
  });

  await db
    .update(stratumWatchlistEntries)
    .set({
      latestBriefId: phase9LatestBriefId,
      latestMatchedCompanyName: "Phase9 History Company",
      latestResultState: "supported_provider_matched_with_observed_openings",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
      latestWatchlistReadConfidence: "medium",
      latestAtsSourceUsed: "GREENHOUSE",
      latestBriefCreatedAt: toDate(latestCreatedAt),
      latestBriefUpdatedAt: toDate(latestCreatedAt),
      updatedAt: toDate(latestCreatedAt),
    })
    .where(eq(stratumWatchlistEntries.id, entryId));

  await createMonitoringAttemptEvent({
    watchlistEntryId: entryId,
    scope: tenantlessCompatibilityScope,
    requestedQuery: phase9HistoryQuery,
    attemptOrigin: "manual_refresh",
    outcomeStatus: "saved_brief_created",
    relatedBriefId: phase9OlderBriefId,
    resultState: "supported_provider_matched_with_observed_openings",
    matchedCompanyName: "Phase9 History Company",
    atsSourceUsed: "GREENHOUSE",
    watchlistReadLabel: "Initial technical signal",
    watchlistReadConfidence: "low",
    companyMatchConfidence: "medium",
    sourceCoverageCompleteness: "single_matched_provider_only",
    createdAt: toDate(olderCreatedAt),
  });

  await createMonitoringAttemptEvent({
    watchlistEntryId: entryId,
    scope: tenantlessCompatibilityScope,
    requestedQuery: phase9HistoryQuery,
    attemptOrigin: "manual_refresh",
    outcomeStatus: "saved_brief_created",
    relatedBriefId: phase9PreviousBriefId,
    resultState: "supported_provider_matched_with_observed_openings",
    matchedCompanyName: "Phase9 History Company",
    atsSourceUsed: "GREENHOUSE",
    watchlistReadLabel: "Focused product hiring",
    watchlistReadConfidence: "low",
    companyMatchConfidence: "low",
    sourceCoverageCompleteness: "single_matched_provider_only",
    createdAt: toDate(previousCreatedAt),
  });

  await recordMonitoringAttempt({
    watchlistEntryId: entryId,
    scope: tenantlessCompatibilityScope,
    requestedQuery: phase9HistoryQuery,
    attemptOrigin: "manual_refresh",
    outcomeStatus: "saved_brief_created",
    relatedBriefId: phase9LatestBriefId,
    resultState: "supported_provider_matched_with_observed_openings",
    matchedCompanyName: "Phase9 History Company",
    atsSourceUsed: "GREENHOUSE",
    watchlistReadLabel: "Broader product and GTM buildout",
    watchlistReadConfidence: "medium",
    companyMatchConfidence: "medium",
    sourceCoverageCompleteness: "single_matched_provider_only",
    createdAt: toDate(latestCreatedAt),
  });

  await createMonitoringAttemptEvent({
    watchlistEntryId: entryId,
    scope: tenantlessCompatibilityScope,
    requestedQuery: phase9HistoryQuery,
    attemptOrigin: "watchlist_rerun",
    outcomeStatus: "reused_cached_result",
    relatedBriefId: phase9LatestBriefId,
    resultState: "supported_provider_matched_with_observed_openings",
    matchedCompanyName: "Phase9 History Company",
    atsSourceUsed: "GREENHOUSE",
    watchlistReadLabel: "Broader product and GTM buildout",
    watchlistReadConfidence: "medium",
    companyMatchConfidence: "medium",
    sourceCoverageCompleteness: "single_matched_provider_only",
    createdAt: toDate("2026-03-31T09:00:00.000Z"),
  });

  await createMonitoringAttemptEvent({
    watchlistEntryId: entryId,
    scope: tenantlessCompatibilityScope,
    requestedQuery: phase9HistoryQuery,
    attemptOrigin: "manual_refresh",
    outcomeStatus: "failed",
    errorSummary: "Simulated provider timeout during a manual refresh.",
    createdAt: toDate("2026-04-01T09:00:00.000Z"),
  });

  return {
    providerFailureBriefId,
    ambiguousBriefId,
    phase9HistoryWatchlistId: watchlistId,
    phase9HistoryEntryId: entryId,
    phase9OlderBriefId,
    phase9PreviousBriefId,
    phase9LatestBriefId,
  };
}
