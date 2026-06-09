import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { encode } from "next-auth/jwt";
import { bootstrapUser } from "@/lib/auth/bootstrapUser";
import { phase1Env } from "@/lib/env";
import { db } from "@/db/client";
import { stratumBriefs } from "@/db/schema/stratumBriefs";
import {
  stratumWatchlistEntries,
  stratumWatchlists,
} from "@/db/schema/stratumWatchlists";
import type { Job } from "@/lib/api/boards";
import type { SignalVerdict, SignalVerdictAlertPriority } from "@/lib/signals/signalVerdict";
import type {
  ConfidenceLevel,
  ProofRoleGrounding,
  SourceCoverageCompleteness,
  StratumResult,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";
import type { DepartmentBreakdown } from "@/lib/signals/watchlistTaxonomy";
import { isEnabledTestRoute } from "@/lib/testing/testRoutes";

const DEMO_EMAIL = "ramp-act-demo@example.com";
const DEMO_NAME = "Ramp ACT Demo";
const DEMO_PROVIDER_SUBJECT = "ramp-act-demo";
const DEMO_QUERY = "Ramp ACT Demo";
const DEMO_SOURCE = "GREENHOUSE" as const;
const DEMO_WATCHLIST_SLUG = "default";
const DEMO_WATCHLIST_NAME = "Default Watchlist";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SOURCE_SCOPE_EXPLANATION = "Greenhouse only. Not full company coverage.";
const WATCHLIST_LIMITS = [
  SOURCE_SCOPE_EXPLANATION,
  "Stratum reflects supported ATS openings only. It is not a full company view.",
  "One matched provider is not full company coverage.",
];

type SeededWatchlistActDemo = {
  userId: string;
  tenantId: string;
  watchlistId: string;
  entryId: string;
  previousBriefId: string;
  latestBriefId: string;
  watchlistUrl: string;
  entryUrl: string;
  sessionCookieName: string;
  sessionCookieValue: string;
  sessionCookieSecure: boolean;
};

type SeedTransaction = Pick<typeof db, "select" | "insert" | "update" | "delete">;

type DemoDepartment = "Sales" | "Engineering" | "Product";

const ROLE_TITLES: Record<DemoDepartment, string[]> = {
  Sales: [
    "Sales Development Representative",
    "Account Executive",
    "Revenue Operations Manager",
    "Customer Success Manager",
    "Partnerships Manager",
    "Enterprise Account Executive",
  ],
  Engineering: [
    "Backend Engineer",
    "Platform Engineer",
    "Data Engineer",
    "Infrastructure Engineer",
    "Security Engineer",
  ],
  Product: [
    "Product Manager",
    "Product Designer",
    "Product Operations Manager",
    "User Researcher",
  ],
};

function sanitizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function createDemoJob(args: {
  department: DemoDepartment;
  index: number;
  createdAt: string;
}): Job {
  const titles = ROLE_TITLES[args.department];
  const title = `${titles[(args.index - 1) % titles.length]} ${args.index}`;
  const roleId = `${args.department.toLowerCase()}-${String(args.index).padStart(3, "0")}`;

  return {
    title,
    location: "Remote",
    department: args.department,
    source: DEMO_SOURCE,
    roleId,
    roleIdType: "posting_id",
    requisitionId: null,
    jobUrl: `https://boards.greenhouse.io/ramp-act-demo/jobs/${roleId}`,
    applyUrl: `https://boards.greenhouse.io/ramp-act-demo/jobs/${roleId}/apply`,
    sourceTimestamp: args.createdAt,
    sourceTimestampType: "updated_at",
    observedAt: args.createdAt,
  };
}

function buildJobs(
  salesCount: number,
  engineeringCount: number,
  productCount: number,
  createdAt: string
): Job[] {
  const jobs: Job[] = [];

  for (let index = 1; index <= salesCount; index += 1) {
    jobs.push(createDemoJob({ department: "Sales", index, createdAt }));
  }

  for (let index = 1; index <= engineeringCount; index += 1) {
    jobs.push(createDemoJob({ department: "Engineering", index, createdAt }));
  }

  for (let index = 1; index <= productCount; index += 1) {
    jobs.push(createDemoJob({ department: "Product", index, createdAt }));
  }

  return jobs;
}

function buildDepartmentBreakdowns(jobs: Job[]): DepartmentBreakdown[] {
  const grouped = new Map<string, Job[]>();

  for (const job of jobs) {
    const department = (job.department ?? "Other").trim() || "Other";
    const current = grouped.get(department) ?? [];
    current.push(job);
    grouped.set(department, current);
  }

  return [...grouped.entries()]
    .map(([department, departmentJobs]) => ({
      department,
      count: departmentJobs.length,
      sampleJobs: departmentJobs.slice(0, 3),
    }))
    .sort((left, right) => right.count - left.count || left.department.localeCompare(right.department));
}

function buildFunctionalMix(hiringMix: DepartmentBreakdown[]): [string, number][] {
  return hiringMix.map((bucket) => [bucket.department, bucket.count] as [string, number]);
}

function buildProofRoles(jobs: Job[]): Job[] {
  const salesRoles = jobs.filter((job) => job.department === "Sales");
  return salesRoles.slice(0, 5);
}

function buildResultStateExplanation(resultState: StratumResultState): string {
  switch (resultState) {
    case "supported_provider_matched_with_observed_openings":
      return "Stratum confirmed Greenhouse and observed current openings there.";
    case "supported_provider_matched_with_zero_observed_openings":
      return "Stratum matched the provider but observed zero openings there.";
    case "unsupported_ats_or_source_pattern":
      return "The source pattern is not supported.";
    case "provider_failure":
      return "Supported provider fetches failed.";
    case "no_matched_provider_found":
      return "No supported provider match was confirmed.";
    case "ambiguous_company_match":
      return "Stratum only found evidence after falling back to an alternate ATS token.";
  }

  return "Stratum result state.";
}

function buildSeedResultSnapshot(args: {
  briefId: string;
  watchlistEntryId: string;
  watchlistId: string;
  watchlistName: string;
  companyName: string;
  matchedCompanyName: string;
  resultState: StratumResultState;
  strategicVerdict: string;
  summary: string;
  companyMatchConfidence: ConfidenceLevel;
  companyMatchExplanation: string;
  sourceCoverageCompleteness: SourceCoverageCompleteness;
  watchlistReadConfidence: ConfidenceLevel;
  watchlistReadExplanation: string;
  proofRoleGrounding: ProofRoleGrounding;
  proofRoleGroundingExplanation: string;
  providerFailures: number;
  jobs: Job[];
  createdAt: string;
}): StratumResult {
  const proofRoles = buildProofRoles(args.jobs);
  const hiringMix = buildDepartmentBreakdowns(args.jobs);
  const functionalMix = buildFunctionalMix(hiringMix);

  return {
    companyName: args.companyName,
    jobs: sanitizeJson(args.jobs),
    proofRoles: sanitizeJson(proofRoles),
    providerAttempts: [
      {
        token: "ramp-act-demo",
        source: DEMO_SOURCE,
        status: "jobs_found",
        jobsCount: args.jobs.length,
      },
    ],
    providerAttemptSummaries: [
      {
        source: DEMO_SOURCE,
        status: "jobs_found",
        jobsCount: args.jobs.length,
        tokensTried: ["ramp-act-demo"],
        errorMessages: [],
        usedForBrief: true,
        note: `Returned ${args.jobs.length} observed open role${args.jobs.length === 1 ? "" : "s"}. Used for this brief.`,
      },
    ],
    proofRoleGrounding: args.proofRoleGrounding,
    proofRoleGroundingExplanation: args.proofRoleGroundingExplanation,
    hiringMix: sanitizeJson(hiringMix),
    functionalMix: sanitizeJson(functionalMix),
    hiringVelocity: "Unknown",
    strategicVerdict: args.strategicVerdict,
    engineeringVsSalesRatio: "-",
    keywordFindings: [],
    summary: args.summary,
    analyzedAt: args.createdAt,
    analysisTimeMs: 0,
    apiSource: DEMO_SOURCE,
    matchedAs: args.matchedCompanyName,
    matchedCompanyName: args.matchedCompanyName,
    resultState: args.resultState,
    resultStateExplanation: buildResultStateExplanation(args.resultState),
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    companyResolutionState: "direct_confirmed_match",
    companyResolutionExplanation: args.companyMatchExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: SOURCE_SCOPE_EXPLANATION,
    watchlistReadConfidence: args.watchlistReadConfidence,
    watchlistReadExplanation: args.watchlistReadExplanation,
    resolutionKind: "direct",
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    providerFailures: args.providerFailures,
    providerFailureExplanation: args.providerFailures > 0
      ? `${args.providerFailures} provider request failed during this search.`
      : "No provider request failures were recorded during this search.",
    unsupportedSourcePattern: null,
    unsupportedSourcePatternExplanation: null,
    artifactOrigin: "saved",
    loadedFromCache: false,
    briefId: args.briefId,
    watchlistEntryId: args.watchlistEntryId,
    watchlistId: args.watchlistId,
    watchlistName: args.watchlistName,
    briefCreatedAt: args.createdAt,
    briefUpdatedAt: args.createdAt,
    limitsSnapshot: sanitizeJson(WATCHLIST_LIMITS),
  };
}

async function createDemoBrief(
  tx: SeedTransaction,
  args: {
    watchlistEntryId: string;
    watchlistId: string;
    watchlistName: string;
    companyName: string;
    matchedCompanyName: string;
    resultState: StratumResultState;
    strategicVerdict: string;
    summary: string;
    watchlistReadConfidence: ConfidenceLevel;
    watchlistReadExplanation: string;
    companyMatchConfidence: ConfidenceLevel;
    companyMatchExplanation: string;
    sourceCoverageCompleteness: SourceCoverageCompleteness;
    proofRoleGrounding: ProofRoleGrounding;
    proofRoleGroundingExplanation: string;
    providerFailures: number;
    signalVerdict: SignalVerdict;
    signalVerdictAlertPriority: SignalVerdictAlertPriority;
    signalVerdictHeadline: string;
    signalVerdictReason: string;
    jobs: Job[];
    createdAt: Date;
  }
): Promise<string> {
  const briefId = randomUUID();
  const createdAt = toIso(args.createdAt);
  const resultSnapshot = buildSeedResultSnapshot({
    briefId,
    watchlistEntryId: args.watchlistEntryId,
    watchlistId: args.watchlistId,
    watchlistName: args.watchlistName,
    companyName: args.companyName,
    matchedCompanyName: args.matchedCompanyName,
    resultState: args.resultState,
    strategicVerdict: args.strategicVerdict,
    summary: args.summary,
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    watchlistReadConfidence: args.watchlistReadConfidence,
    watchlistReadExplanation: args.watchlistReadExplanation,
    proofRoleGrounding: args.proofRoleGrounding,
    proofRoleGroundingExplanation: args.proofRoleGroundingExplanation,
    providerFailures: args.providerFailures,
    jobs: args.jobs,
    createdAt,
  });

  await tx.insert(stratumBriefs).values({
    id: briefId,
    watchlistEntryId: args.watchlistEntryId,
    queriedCompanyName: args.companyName,
    matchedCompanyName: args.matchedCompanyName,
    atsSourceUsed: DEMO_SOURCE,
    resultState: args.resultState,
    companyMatchConfidence: args.companyMatchConfidence,
    companyMatchExplanation: args.companyMatchExplanation,
    sourceCoverageCompleteness: args.sourceCoverageCompleteness,
    sourceCoverageExplanation: SOURCE_SCOPE_EXPLANATION,
    watchlistReadLabel: args.strategicVerdict,
    watchlistReadSummary: args.summary,
    watchlistReadConfidence: args.watchlistReadConfidence,
    watchlistReadExplanation: args.watchlistReadExplanation,
    proofRoleGrounding: args.proofRoleGrounding,
    proofRoleGroundingExplanation: args.proofRoleGroundingExplanation,
    jobsObservedCount: args.jobs.length,
    proofRolesSnapshot: sanitizeJson(buildProofRoles(args.jobs)),
    limitsSnapshot: sanitizeJson(WATCHLIST_LIMITS),
    resultSnapshot: sanitizeJson(resultSnapshot),
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

async function seedWatchlistActDemoFixture(request: Request): Promise<SeededWatchlistActDemo> {
  const demoUser = await bootstrapUser({
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    provider: "google",
    providerSubject: DEMO_PROVIDER_SUBJECT,
  });

  const now = new Date();
  const previousCreatedAt = new Date(now.getTime() - 60 * 60 * 1000);
  const latestCreatedAt = new Date(now.getTime() - 5 * 60 * 1000);
  const previousJobs = buildJobs(50, 31, 30, toIso(previousCreatedAt));
  const latestJobs = buildJobs(68, 35, 32, toIso(latestCreatedAt));

  const secureCookie = new URL(request.url).protocol === "https:";
  const sessionCookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
  const sessionCookieValue = await encode({
    secret: phase1Env.AUTH_SECRET,
    salt: sessionCookieName,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      sub: demoUser.userId,
      userId: demoUser.userId,
      tenantId: demoUser.tenantId,
      role: "owner",
      name: DEMO_NAME,
      email: DEMO_EMAIL,
    },
  });

  const seed = await db.transaction(async (tx) => {
    const existingEntries = await tx
      .select({
        entryId: stratumWatchlistEntries.id,
      })
      .from(stratumWatchlistEntries)
      .innerJoin(stratumWatchlists, eq(stratumWatchlistEntries.watchlistId, stratumWatchlists.id))
      .where(eq(stratumWatchlists.tenantId, demoUser.tenantId));

    if (existingEntries.length > 0) {
      const entryIds = existingEntries.map((row) => row.entryId);
      await tx
        .delete(stratumBriefs)
        .where(inArray(stratumBriefs.watchlistEntryId, entryIds));
    }

    await tx.delete(stratumWatchlists).where(eq(stratumWatchlists.tenantId, demoUser.tenantId));

    const [watchlist] = await tx
      .insert(stratumWatchlists)
      .values({
        id: randomUUID(),
        tenantId: demoUser.tenantId,
        name: DEMO_WATCHLIST_NAME,
        slug: DEMO_WATCHLIST_SLUG,
        createdAt: latestCreatedAt,
        updatedAt: latestCreatedAt,
      })
      .returning();

    if (!watchlist) {
      throw new Error("Failed to seed the demo watchlist.");
    }

    const entryId = randomUUID();
    const previousBriefId = await createDemoBrief(tx, {
      watchlistEntryId: entryId,
      watchlistId: watchlist.id,
      watchlistName: watchlist.name,
      companyName: DEMO_QUERY,
      matchedCompanyName: DEMO_QUERY,
      resultState: "supported_provider_matched_with_observed_openings",
      strategicVerdict: "Sales-led first scan",
      summary: "Sales hiring is visible on the first scan.",
      watchlistReadConfidence: "medium",
      watchlistReadExplanation: "Wait for the next scan to see what changed.",
      companyMatchConfidence: "high",
      companyMatchExplanation: "The ATS source matched directly.",
      sourceCoverageCompleteness: "single_matched_provider_only",
      proofRoleGrounding: "exact",
      proofRoleGroundingExplanation: "The read is grounded in the displayed proof roles.",
      providerFailures: 0,
      signalVerdict: "watch",
      signalVerdictAlertPriority: "digest",
      signalVerdictHeadline: "WATCH",
      signalVerdictReason: "First scan complete. No previous scan to compare yet.",
      jobs: previousJobs,
      createdAt: previousCreatedAt,
    });

    const latestBriefId = await createDemoBrief(tx, {
      watchlistEntryId: entryId,
      watchlistId: watchlist.id,
      watchlistName: watchlist.name,
      companyName: DEMO_QUERY,
      matchedCompanyName: DEMO_QUERY,
      resultState: "supported_provider_matched_with_observed_openings",
      strategicVerdict: "Sales-led growth",
      summary: "Sales hiring grew from 50 to 68 jobs.",
      watchlistReadConfidence: "high",
      watchlistReadExplanation: "Use this for account timing.",
      companyMatchConfidence: "high",
      companyMatchExplanation: "The ATS source matched directly.",
      sourceCoverageCompleteness: "single_matched_provider_only",
      proofRoleGrounding: "exact",
      proofRoleGroundingExplanation: "The read is grounded in the displayed proof roles.",
      providerFailures: 0,
      signalVerdict: "act",
      signalVerdictAlertPriority: "immediate",
      signalVerdictHeadline: "ACT",
      signalVerdictReason: "Meaningful hiring expansion in a clear strategic area.",
      jobs: latestJobs,
      createdAt: latestCreatedAt,
    });

    await tx
      .insert(stratumWatchlistEntries)
      .values({
        id: entryId,
        watchlistId: watchlist.id,
        requestedQuery: DEMO_QUERY,
        normalizedQuery: DEMO_QUERY.trim().toLowerCase(),
        latestBriefId,
        latestMatchedCompanyName: DEMO_QUERY,
        latestResultState: "supported_provider_matched_with_observed_openings",
        latestWatchlistReadLabel: "Sales-led growth",
        latestWatchlistReadConfidence: "high",
        latestAtsSourceUsed: DEMO_SOURCE,
        latestBriefCreatedAt: latestCreatedAt,
        latestBriefUpdatedAt: latestCreatedAt,
        createdAt: latestCreatedAt,
        updatedAt: latestCreatedAt,
      });

    await tx
      .update(stratumWatchlists)
      .set({
        updatedAt: latestCreatedAt,
      })
      .where(eq(stratumWatchlists.id, watchlist.id));

    return {
      watchlistId: watchlist.id,
      entryId,
      previousBriefId,
      latestBriefId,
    };
  });

  return {
    userId: demoUser.userId,
    tenantId: demoUser.tenantId,
    watchlistId: seed.watchlistId,
    entryId: seed.entryId,
    previousBriefId: seed.previousBriefId,
    latestBriefId: seed.latestBriefId,
    watchlistUrl: `/watchlists?watchlistId=${seed.watchlistId}`,
    entryUrl: `/watchlists/${seed.watchlistId}/entries/${seed.entryId}`,
    sessionCookieName,
    sessionCookieValue,
    sessionCookieSecure: secureCookie,
  };
}

function buildResponseCookies(response: NextResponse, seeded: SeededWatchlistActDemo): void {
  response.cookies.set(seeded.sessionCookieName, seeded.sessionCookieValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: seeded.sessionCookieSecure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

async function handleRequest(request: Request, mode: "redirect" | "json") {
  if (!isEnabledTestRoute(request)) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  try {
    const seeded = await seedWatchlistActDemoFixture(request);

    if (mode === "redirect") {
      const response = NextResponse.redirect(new URL(seeded.watchlistUrl, request.url));
      response.headers.set("Cache-Control", "no-store");
      buildResponseCookies(response, seeded);
      return response;
    }

    const response = NextResponse.json({
      success: true,
      data: {
        userId: seeded.userId,
        tenantId: seeded.tenantId,
        watchlistId: seeded.watchlistId,
        entryId: seeded.entryId,
        previousBriefId: seeded.previousBriefId,
        latestBriefId: seeded.latestBriefId,
        watchlistUrl: seeded.watchlistUrl,
        entryUrl: seeded.entryUrl,
      },
      timestamp: new Date().toISOString(),
    });
    buildResponseCookies(response, seeded);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Watchlist ACT demo fixture failed.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRequest(request, "redirect");
}

export async function POST(request: Request) {
  return handleRequest(request, "json");
}
