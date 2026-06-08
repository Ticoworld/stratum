import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { bootstrapUser } from "@/lib/auth/bootstrapUser";
import { db } from "@/db/client";
import { stratumBriefs } from "@/db/schema/stratumBriefs";
import { stratumMonitoringEvents } from "@/db/schema/stratumMonitoringEvents";
import { stratumNotificationCandidates } from "@/db/schema/stratumNotificationCandidates";
import { stratumWatchlistEntries, stratumWatchlists } from "@/db/schema/stratumWatchlists";
import type { SignalVerdict } from "@/lib/signals/signalVerdict";
import type { StratumNotificationChangeType } from "@/lib/watchlists/notifications";
import type { StratumResult, StratumResultState } from "@/lib/services/StratumInvestigator";
import { isEnabledTestRoute } from "@/lib/testing/testRoutes";

type SeededRow = {
  entryId: string;
  companyName: string;
  briefId: string | null;
};

function toDate(value: number): Date {
  return new Date(value);
}

function buildResultSnapshot(args: {
  briefId: string;
  companyName: string;
  matchedCompanyName: string;
  resultState: StratumResultState;
  strategicVerdict: string;
  summary: string;
  companyMatchConfidence: "high" | "medium" | "low";
  companyMatchExplanation: string;
  sourceCoverageCompleteness:
    | "single_matched_provider_only"
    | "matched_provider_zero_observed_roles"
    | "unsupported_source_pattern"
    | "inconclusive_due_to_provider_failure"
    | "no_supported_provider_match";
  sourceCoverageExplanation: string;
  watchlistReadConfidence: "high" | "medium" | "low" | "none";
  watchlistReadExplanation: string;
  proofRoleGrounding: "exact" | "partial" | "fallback" | "none";
  proofRoleGroundingExplanation: string;
  providerFailures: number;
  atsSourceUsed: "ASHBY" | "GREENHOUSE" | "LEVER" | "WORKABLE" | null;
  createdAt: string;
}): StratumResult {
  return {
    companyName: args.companyName,
    jobs: [],
    proofRoles: [],
    providerAttempts: [],
    providerAttemptSummaries: [],
    proofRoleGrounding: args.proofRoleGrounding,
    proofRoleGroundingExplanation: args.proofRoleGroundingExplanation,
    hiringMix: [],
    functionalMix: [],
    hiringVelocity: "Unknown",
    strategicVerdict: args.strategicVerdict,
    engineeringVsSalesRatio: "-",
    keywordFindings: [],
    summary: args.summary,
    analyzedAt: args.createdAt,
    analysisTimeMs: 0,
    apiSource: args.atsSourceUsed,
    matchedAs: args.matchedCompanyName,
    matchedCompanyName: args.matchedCompanyName,
    resultState: args.resultState,
    resultStateExplanation: args.summary,
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    companyResolutionState:
      args.resultState === "unsupported_ats_or_source_pattern" ||
      args.resultState === "provider_failure" ||
      args.resultState === "no_matched_provider_found"
        ? "no_supported_match"
        : "direct_confirmed_match",
    companyResolutionExplanation: args.companyMatchExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: args.sourceCoverageExplanation,
    watchlistReadConfidence: args.watchlistReadConfidence,
    watchlistReadExplanation: args.watchlistReadExplanation,
    resolutionKind:
      args.resultState === "unsupported_ats_or_source_pattern" ||
      args.resultState === "provider_failure" ||
      args.resultState === "no_matched_provider_found"
        ? null
        : "direct",
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    providerFailures: args.providerFailures,
    providerFailureExplanation:
      args.providerFailures > 0
        ? "One provider failed."
        : "No provider request failures were recorded during this search.",
    unsupportedSourcePattern: null,
    unsupportedSourcePatternExplanation: null,
    artifactOrigin: "saved",
    loadedFromCache: false,
    cachedAt: undefined,
    briefId: args.briefId,
    briefCreatedAt: args.createdAt,
    briefUpdatedAt: args.createdAt,
    limitsSnapshot: [],
  };
}

async function insertSeedBrief(args: {
  watchlistEntryId: string;
  companyName: string;
  matchedCompanyName: string;
  atsSourceUsed: "ASHBY" | "GREENHOUSE" | "LEVER" | "WORKABLE" | null;
  resultState: StratumResultState;
  signalVerdict: SignalVerdict;
  signalVerdictAlertPriority: "immediate" | "digest" | "source_issue" | null;
  signalVerdictHeadline: string;
  signalVerdictReason: string;
  strategicVerdict: string;
  summary: string;
  watchlistReadConfidence: "high" | "medium" | "low" | "none";
  watchlistReadExplanation: string;
  companyMatchConfidence: "high" | "medium" | "low";
  companyMatchExplanation: string;
  sourceCoverageCompleteness:
    | "single_matched_provider_only"
    | "matched_provider_zero_observed_roles"
    | "unsupported_source_pattern"
    | "inconclusive_due_to_provider_failure"
    | "no_supported_provider_match";
  sourceCoverageExplanation: string;
  proofRoleGrounding: "exact" | "partial" | "fallback" | "none";
  proofRoleGroundingExplanation: string;
  providerFailures: number;
  jobsObservedCount?: number;
  createdAt: Date;
}): Promise<string> {
  const briefId = randomUUID();
  const createdAt = args.createdAt.toISOString();
  const resultSnapshot = buildResultSnapshot({
    briefId,
    companyName: args.companyName,
    matchedCompanyName: args.matchedCompanyName,
    resultState: args.resultState,
    strategicVerdict: args.strategicVerdict,
    summary: args.summary,
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: args.sourceCoverageExplanation,
    watchlistReadConfidence: args.watchlistReadConfidence,
    watchlistReadExplanation: args.watchlistReadExplanation,
    proofRoleGrounding: args.proofRoleGrounding,
    proofRoleGroundingExplanation: args.proofRoleGroundingExplanation,
    providerFailures: args.providerFailures,
    atsSourceUsed: args.atsSourceUsed,
    createdAt,
  });

  await db.insert(stratumBriefs).values({
    id: briefId,
    watchlistEntryId: args.watchlistEntryId,
    queriedCompanyName: args.companyName,
    matchedCompanyName: args.matchedCompanyName,
    atsSourceUsed: args.atsSourceUsed,
    resultState: args.resultState,
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
    jobsObservedCount: args.jobsObservedCount ?? 0,
    proofRolesSnapshot: [],
    limitsSnapshot: [],
    resultSnapshot,
    unsupportedSourcePattern: null,
    providerFailures: args.providerFailures,
    signalVerdict: args.signalVerdict,
    signalVerdictAlertPriority: args.signalVerdictAlertPriority,
    signalVerdictHeadline: args.signalVerdictHeadline,
    signalVerdictReason: args.signalVerdictReason,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  });

  return briefId;
}

async function insertSeedEntry(args: {
  watchlistId: string;
  entryId: string;
  companyName: string;
  briefId: string | null;
  resultState: StratumResultState | null;
  watchlistReadLabel: string | null;
  watchlistReadConfidence: "high" | "medium" | "low" | "none" | null;
  latestAtsSourceUsed: "ASHBY" | "GREENHOUSE" | "LEVER" | "WORKABLE" | null;
  matchedCompanyName: string | null;
  createdAt: Date;
}): Promise<void> {
  const createdAt = args.createdAt;
  await db.insert(stratumWatchlistEntries).values({
    id: args.entryId,
    watchlistId: args.watchlistId,
    requestedQuery: args.companyName,
    normalizedQuery: args.companyName.trim().toLowerCase(),
    latestBriefId: args.briefId,
    latestMatchedCompanyName: args.matchedCompanyName,
    latestResultState: args.resultState,
    latestWatchlistReadLabel: args.watchlistReadLabel,
    latestWatchlistReadConfidence: args.watchlistReadConfidence,
    latestAtsSourceUsed: args.latestAtsSourceUsed,
    latestBriefCreatedAt: args.briefId ? createdAt : null,
    latestBriefUpdatedAt: args.briefId ? createdAt : null,
    createdAt,
    updatedAt: createdAt,
  });
}

async function insertAlertEvent(args: {
  watchlistId: string;
  watchlistEntryId: string;
  requestedQuery: string;
  briefId: string | null;
  resultState: StratumResultState | null;
  watchlistReadLabel: string | null;
  watchlistReadConfidence: "high" | "medium" | "low" | "none" | null;
  atsSourceUsed: "ASHBY" | "GREENHOUSE" | "LEVER" | "WORKABLE" | null;
  alertPriority: "immediate" | "digest" | "source_issue";
  summary: string;
  outcomeStatus: "saved_brief_created" | "failed";
  createdAt: Date;
}): Promise<void> {
  const eventId = randomUUID();
  await db.insert(stratumMonitoringEvents).values({
    id: eventId,
    watchlistEntryId: args.watchlistEntryId,
    requestedQuery: args.requestedQuery,
    attemptKind: "refresh",
    attemptOrigin: "manual_refresh",
    outcomeStatus: args.outcomeStatus,
    relatedBriefId: args.briefId,
    resultState: args.resultState,
    matchedCompanyName: args.requestedQuery,
    atsSourceUsed: args.atsSourceUsed,
    watchlistReadLabel: args.watchlistReadLabel,
    watchlistReadConfidence: args.watchlistReadConfidence,
    companyMatchConfidence: "high",
    sourceCoverageCompleteness: "single_matched_provider_only",
    errorSummary: args.outcomeStatus === "failed" ? args.summary : null,
    createdAt: args.createdAt,
  });

  await db.insert(stratumNotificationCandidates).values({
    id: randomUUID(),
    watchlistEntryId: args.watchlistEntryId,
    monitoringEventId: eventId,
    relatedBriefId: args.briefId,
    attemptOrigin: "manual_refresh",
    candidateKind: "meaningful_monitoring_change",
    status: "unread",
    changeTypes:
      args.alertPriority === "source_issue"
        ? (["refresh_failed"] as StratumNotificationChangeType[])
        : (["result_state_changed", "saved_brief_material_change"] as StratumNotificationChangeType[]),
    summary: args.summary,
    alertPriority: args.alertPriority,
    createdAt: args.createdAt,
  });

  await db
    .update(stratumWatchlistEntries)
    .set({ updatedAt: args.createdAt })
    .where(eq(stratumWatchlistEntries.id, args.watchlistEntryId));

  await db
    .update(stratumWatchlists)
    .set({ updatedAt: args.createdAt })
    .where(eq(stratumWatchlists.id, args.watchlistId));
}

async function seedWatchlistActionCopyFixture(runKey: string): Promise<{
  ownerPersona: {
    userId: string;
    tenantId: string;
    role: "owner";
    email: string;
    name: string;
  };
  watchlistId: string;
  rows: Record<string, SeededRow>;
}> {
  const owner = await bootstrapUser({
    email: `owner-a+${runKey}@example.com`,
    name: "Owner A",
    provider: "google",
    providerSubject: `owner-a-${runKey}`,
  });

  const watchlistId = randomUUID();
  const watchlistCreatedAt = toDate(Date.now() - 60 * 60 * 1000);

  await db.insert(stratumWatchlists).values({
    id: watchlistId,
    tenantId: owner.tenantId,
    name: `Action Inbox ${runKey}`,
    slug: `action-inbox-${runKey}`,
    createdAt: watchlistCreatedAt,
    updatedAt: watchlistCreatedAt,
  });

  const baseTime = Date.now() - 30 * 60 * 1000;
  const rows: Record<string, SeededRow> = {};

  rows.noBrief = {
    entryId: randomUUID(),
    companyName: "No Brief Co",
    briefId: null,
  };
  await insertSeedEntry({
    watchlistId,
    entryId: rows.noBrief.entryId,
    companyName: rows.noBrief.companyName,
    briefId: null,
    resultState: null,
    watchlistReadLabel: null,
    watchlistReadConfidence: null,
    latestAtsSourceUsed: null,
    matchedCompanyName: null,
    createdAt: toDate(baseTime - 6 * 60 * 1000),
  });

  rows.watch = {
    entryId: randomUUID(),
    companyName: "Ramp",
    briefId: null,
  };
  rows.watch.briefId = await insertSeedBrief({
    watchlistEntryId: rows.watch.entryId,
    companyName: rows.watch.companyName,
    matchedCompanyName: rows.watch.companyName,
    atsSourceUsed: "ASHBY",
    resultState: "supported_provider_matched_with_observed_openings",
    signalVerdict: "watch",
    signalVerdictAlertPriority: "digest",
    signalVerdictHeadline: "WATCH",
    signalVerdictReason: "Sales-led first scan.",
    strategicVerdict: "Broader product and GTM buildout",
    summary: "Sales hiring is visible, with engineering roles still active.",
    watchlistReadConfidence: "medium",
    watchlistReadExplanation: "This is a first scan with a clear GTM lean.",
    companyMatchConfidence: "high",
    companyMatchExplanation: "The ATS source matched directly.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation: "Ashby only. Not full company coverage.",
    proofRoleGrounding: "exact",
    proofRoleGroundingExplanation: "The read is grounded in the displayed proof roles.",
    providerFailures: 0,
    jobsObservedCount: 111,
    createdAt: toDate(baseTime - 5 * 60 * 1000),
  });
  await insertSeedEntry({
    watchlistId,
    entryId: rows.watch.entryId,
    companyName: rows.watch.companyName,
    briefId: rows.watch.briefId,
    resultState: "supported_provider_matched_with_observed_openings",
    watchlistReadLabel: "Broader product and GTM buildout",
    watchlistReadConfidence: "medium",
    latestAtsSourceUsed: "ASHBY",
    matchedCompanyName: rows.watch.companyName,
    createdAt: toDate(baseTime - 5 * 60 * 1000),
  });

  rows.act = {
    entryId: randomUUID(),
    companyName: "Act Co",
    briefId: null,
  };
  rows.act.briefId = await insertSeedBrief({
    watchlistEntryId: rows.act.entryId,
    companyName: rows.act.companyName,
    matchedCompanyName: rows.act.companyName,
    atsSourceUsed: "ASHBY",
    resultState: "supported_provider_matched_with_observed_openings",
    signalVerdict: "act",
    signalVerdictAlertPriority: "immediate",
    signalVerdictHeadline: "ACT",
    signalVerdictReason: "Sales hiring increased since last scan.",
    strategicVerdict: "Broader product and GTM buildout",
    summary: "Sales hiring increased enough to act on.",
    watchlistReadConfidence: "high",
    watchlistReadExplanation: "The second scan showed a stronger commercial push.",
    companyMatchConfidence: "high",
    companyMatchExplanation: "The ATS source matched directly.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation: "Ashby only. Not full company coverage.",
    proofRoleGrounding: "exact",
    proofRoleGroundingExplanation: "The read is grounded in the displayed proof roles.",
    providerFailures: 0,
    createdAt: toDate(baseTime - 4 * 60 * 1000),
  });
  await insertSeedEntry({
    watchlistId,
    entryId: rows.act.entryId,
    companyName: rows.act.companyName,
    briefId: rows.act.briefId,
    resultState: "supported_provider_matched_with_observed_openings",
    watchlistReadLabel: "Broader product and GTM buildout",
    watchlistReadConfidence: "high",
    latestAtsSourceUsed: "ASHBY",
    matchedCompanyName: rows.act.companyName,
    createdAt: toDate(baseTime - 4 * 60 * 1000),
  });
  await insertAlertEvent({
    watchlistId,
    watchlistEntryId: rows.act.entryId,
    requestedQuery: rows.act.companyName,
    briefId: rows.act.briefId,
    resultState: "supported_provider_matched_with_observed_openings",
    watchlistReadLabel: "Broader product and GTM buildout",
    watchlistReadConfidence: "high",
    atsSourceUsed: "ASHBY",
    alertPriority: "immediate",
    summary: "Result state changed from no prior scan to observed openings.",
    outcomeStatus: "saved_brief_created",
    createdAt: toDate(baseTime - 3 * 60 * 1000),
  });

  rows.verify = {
    entryId: randomUUID(),
    companyName: "Stripe",
    briefId: null,
  };
  rows.verify.briefId = await insertSeedBrief({
    watchlistEntryId: rows.verify.entryId,
    companyName: rows.verify.companyName,
    matchedCompanyName: rows.verify.companyName,
    atsSourceUsed: "WORKABLE",
    resultState: "unsupported_ats_or_source_pattern",
    signalVerdict: "verify_source",
    signalVerdictAlertPriority: "source_issue",
    signalVerdictHeadline: "VERIFY SOURCE",
    signalVerdictReason: "The source needs checking before the brief is useful.",
    strategicVerdict: "Source needs verification",
    summary: "The source pattern is not supported yet.",
    watchlistReadConfidence: "low",
    watchlistReadExplanation: "The source path could not be trusted for a stable read.",
    companyMatchConfidence: "low",
    companyMatchExplanation: "The source path is unsupported.",
    sourceCoverageCompleteness: "unsupported_source_pattern",
    sourceCoverageExplanation: "This source is not supported yet.",
    proofRoleGrounding: "none",
    proofRoleGroundingExplanation: "No proof roles are available for an unsupported source path.",
    providerFailures: 0,
    createdAt: toDate(baseTime - 2 * 60 * 1000),
  });
  await insertSeedEntry({
    watchlistId,
    entryId: rows.verify.entryId,
    companyName: rows.verify.companyName,
    briefId: rows.verify.briefId,
    resultState: "unsupported_ats_or_source_pattern",
    watchlistReadLabel: "Source needs verification",
    watchlistReadConfidence: "low",
    latestAtsSourceUsed: "WORKABLE",
    matchedCompanyName: rows.verify.companyName,
    createdAt: toDate(baseTime - 2 * 60 * 1000),
  });

  rows.sourceAlert = {
    entryId: randomUUID(),
    companyName: "Problem Co",
    briefId: null,
  };
  rows.sourceAlert.briefId = await insertSeedBrief({
    watchlistEntryId: rows.sourceAlert.entryId,
    companyName: rows.sourceAlert.companyName,
    matchedCompanyName: rows.sourceAlert.companyName,
    atsSourceUsed: "GREENHOUSE",
    resultState: "supported_provider_matched_with_observed_openings",
    signalVerdict: "watch",
    signalVerdictAlertPriority: "digest",
    signalVerdictHeadline: "WATCH",
    signalVerdictReason: "Still watching this company.",
    strategicVerdict: "Broader product and GTM buildout",
    summary: "The company is still on watch, but the latest scan failed.",
    watchlistReadConfidence: "medium",
    watchlistReadExplanation: "The last readable brief still looked like a watch case.",
    companyMatchConfidence: "high",
    companyMatchExplanation: "The ATS source matched directly.",
    sourceCoverageCompleteness: "single_matched_provider_only",
    sourceCoverageExplanation: "Ashby only. Not full company coverage.",
    proofRoleGrounding: "exact",
    proofRoleGroundingExplanation: "The read is grounded in the displayed proof roles.",
    providerFailures: 0,
    createdAt: toDate(baseTime - 100 * 1000),
  });
  await insertSeedEntry({
    watchlistId,
    entryId: rows.sourceAlert.entryId,
    companyName: rows.sourceAlert.companyName,
    briefId: rows.sourceAlert.briefId,
    resultState: "provider_failure",
    watchlistReadLabel: "Broader product and GTM buildout",
    watchlistReadConfidence: "medium",
    latestAtsSourceUsed: "GREENHOUSE",
    matchedCompanyName: rows.sourceAlert.companyName,
    createdAt: toDate(baseTime - 100 * 1000),
  });
  await insertAlertEvent({
    watchlistId,
    watchlistEntryId: rows.sourceAlert.entryId,
    requestedQuery: rows.sourceAlert.companyName,
    briefId: rows.sourceAlert.briefId,
    resultState: "provider_failure",
    watchlistReadLabel: "Broader product and GTM buildout",
    watchlistReadConfidence: "medium",
    atsSourceUsed: "GREENHOUSE",
    alertPriority: "source_issue",
    summary: "Manual refresh failed and did not replace the current monitoring state.",
    outcomeStatus: "failed",
    createdAt: toDate(baseTime - 90 * 1000),
  });

  rows.wait = {
    entryId: randomUUID(),
    companyName: "SmallCo",
    briefId: null,
  };
  rows.wait.briefId = await insertSeedBrief({
    watchlistEntryId: rows.wait.entryId,
    companyName: rows.wait.companyName,
    matchedCompanyName: rows.wait.companyName,
    atsSourceUsed: "GREENHOUSE",
    resultState: "supported_provider_matched_with_zero_observed_openings",
    signalVerdict: "wait",
    signalVerdictAlertPriority: null,
    signalVerdictHeadline: "WAIT",
    signalVerdictReason: "Not enough signal yet.",
    strategicVerdict: "Tentative hiring signal",
    summary: "The signal is still too thin to act on.",
    watchlistReadConfidence: "low",
    watchlistReadExplanation: "The signal is present, but it is still too thin.",
    companyMatchConfidence: "medium",
    companyMatchExplanation: "The ATS source matched directly.",
    sourceCoverageCompleteness: "matched_provider_zero_observed_roles",
    sourceCoverageExplanation: "The matched provider showed zero current openings.",
    proofRoleGrounding: "none",
    proofRoleGroundingExplanation: "No proof roles are available because no strong read emerged.",
    providerFailures: 0,
    createdAt: toDate(baseTime - 80 * 1000),
  });
  await insertSeedEntry({
    watchlistId,
    entryId: rows.wait.entryId,
    companyName: rows.wait.companyName,
    briefId: rows.wait.briefId,
    resultState: "supported_provider_matched_with_zero_observed_openings",
    watchlistReadLabel: "Tentative hiring signal",
    watchlistReadConfidence: "low",
    latestAtsSourceUsed: "GREENHOUSE",
    matchedCompanyName: rows.wait.companyName,
    createdAt: toDate(baseTime - 80 * 1000),
  });

  rows.ignore = {
    entryId: randomUUID(),
    companyName: "TinyCo",
    briefId: null,
  };
  rows.ignore.briefId = await insertSeedBrief({
    watchlistEntryId: rows.ignore.entryId,
    companyName: rows.ignore.companyName,
    matchedCompanyName: rows.ignore.companyName,
    atsSourceUsed: "GREENHOUSE",
    resultState: "no_matched_provider_found",
    signalVerdict: "ignore",
    signalVerdictAlertPriority: null,
    signalVerdictHeadline: "IGNORE",
    signalVerdictReason: "No useful hiring signal.",
    strategicVerdict: "Thin hiring signal",
    summary: "There is no useful hiring signal here yet.",
    watchlistReadConfidence: "none",
    watchlistReadExplanation: "No signal worth surfacing yet.",
    companyMatchConfidence: "low",
    companyMatchExplanation: "No supported provider matched cleanly.",
    sourceCoverageCompleteness: "no_supported_provider_match",
    sourceCoverageExplanation: "No supported provider match was found.",
    proofRoleGrounding: "none",
    proofRoleGroundingExplanation: "No proof roles are available because no supported match was found.",
    providerFailures: 0,
    createdAt: toDate(baseTime - 70 * 1000),
  });
  await insertSeedEntry({
    watchlistId,
    entryId: rows.ignore.entryId,
    companyName: rows.ignore.companyName,
    briefId: rows.ignore.briefId,
    resultState: "no_matched_provider_found",
    watchlistReadLabel: "Thin hiring signal",
    watchlistReadConfidence: "none",
    latestAtsSourceUsed: "GREENHOUSE",
    matchedCompanyName: rows.ignore.companyName,
    createdAt: toDate(baseTime - 70 * 1000),
  });

  return {
    ownerPersona: {
      userId: owner.userId,
      tenantId: owner.tenantId,
      role: "owner",
      email: `owner-a+${runKey}@example.com`,
      name: "Owner A",
    },
    watchlistId,
    rows,
  };
}

export async function POST(request: Request) {
  if (!isEnabledTestRoute(request)) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const runKey =
      typeof body?.runKey === "string" && body.runKey.trim() ? body.runKey.trim() : null;

    if (!runKey) {
      return NextResponse.json(
        { success: false, error: "runKey is required." },
        { status: 400 }
      );
    }

    const data = await seedWatchlistActionCopyFixture(runKey);

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Watchlist action-copy fixture failed.",
      },
      { status: 500 }
    );
  }
}
