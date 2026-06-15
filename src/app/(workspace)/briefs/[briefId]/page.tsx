import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck, MapPin, Layers, Info, History } from "lucide-react";
import { buildSignInRedirectPath, requireAuthSession } from "@/lib/auth/session";
import { getStratumBriefById } from "@/lib/briefs/repository";
import { buildSourceScopeSummary, formatHiringPatternDisplay, formatSourceLabel } from "@/lib/briefs/presentation";
import { buildProviderDiagnosticsView } from "@/lib/briefs/providerDiagnostics";
import { buildWhatChangedDisplay } from "@/lib/briefs/whatChangedDisplay";
import { getWatchlistBriefReplayContext } from "@/lib/watchlists/repository";
import {
  deriveBriefPublicReadiness,
  formatHiringMixBucketLabel,
  computeFunctionalMix,
  type ApprovedWatchlistLabel,
  type WatchlistConfidenceLevel,
  type WatchlistProofGrounding,
  type ChangeSignificance,
  type ChangeDirection,
} from "@/lib/signals/watchlistTaxonomy";
import { deriveSignalVerdict, type SignalVerdictResult } from "@/lib/signals/signalVerdict";
import type { StratumResultState } from "@/lib/services/StratumInvestigator";

type BriefPageProps = {
  params: Promise<{
    briefId: string;
  }>;
};

// --- Helpers ---

function formatDateTimeValue(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGeographySpread(roles: any[]) {
  const counts: Record<string, number> = {};
  roles.forEach((r) => {
    const loc = r.location || "Remote/Unspecified";
    counts[loc] = (counts[loc] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function formatBucketForSentence(bucket: string): string {
  if (bucket === "Sales") return "Sales";
  return formatHiringMixBucketLabel(bucket);
}

function buildExecutiveSummarySentences(args: {
  companyName: string;
  hiringMix: [string, number][];
  observedCount: number;
  sourceLabel: string;
  hiringPattern: string;
}): string[] {
  const { companyName, hiringMix, observedCount, sourceLabel, hiringPattern } = args;
  if (observedCount <= 0) {
    return [
      `Stratum found no open roles on ${sourceLabel}.`,
      "No hiring pattern is visible from this source.",
    ];
  }

  const top = hiringMix[0];
  const second = hiringMix[1];
  const foundSentence = `Stratum found ${observedCount} open role${observedCount === 1 ? "" : "s"} on ${sourceLabel}.`;

  if (hiringPattern === "Mixed" || hiringPattern === "No clear lead" || !top) {
    return [
      foundSentence,
      "Hiring is spread across several teams. No single area clearly leads.",
    ];
  }

  const topLabel = formatBucketForSentence(top[0]);
  const secondClause = second
    ? `, with ${formatBucketForSentence(second[0])} second (${second[1]})`
    : "";
  const countSentence = `${topLabel} has the most open roles (${top[1]})${secondClause}.`;
  const technicalClause =
    top[0] === "Sales" && second?.[0] === "Engineering"
      ? "with technical hiring still active"
      : second?.[0] === "Engineering"
        ? "with technical roles still active"
        : "with other teams hiring at lower volume";

  return [
    foundSentence,
    countSentence,
    `${companyName} is hiring most heavily in ${topLabel}, ${technicalClause}.`,
  ];
}

function buildWhyThisMattersSentences(args: {
  hiringMix: [string, number][];
  hiringPattern: string;
  hasPriorComparison: boolean;
}): string[] {
  const { hiringMix, hiringPattern, hasPriorComparison } = args;
  const top = hiringMix[0];

  if (!hasPriorComparison) {
    if (hiringPattern.endsWith("-led") && top?.[0] === "Sales") {
      return [
        "This is the first scan. Use it as the starting point.",
        "Sales leads the hiring mix. The next scan will show if hiring grows, slows down, or shifts to another team.",
      ];
    }

    const sentences = ["This is the first scan. Use it as the starting point."];
    if (hiringPattern.endsWith("-led") && top) {
      sentences.push(
        `${formatBucketForSentence(top[0])} leads the hiring mix. The next scan will show if hiring grows, slows down, or shifts to another team.`
      );
    } else {
      sentences.push("Hiring is spread across several teams. The next scan will show if hiring grows, slows down, or shifts to another team.");
    }
    return sentences;
  }

  if (hiringPattern.endsWith("-led") && top) {
    return [
      `${formatBucketForSentence(top[0])} leads the hiring mix.`,
      "Use the next scan to see whether that push grows, slows down, or shifts to another team.",
    ];
  }

  return [
    "Hiring is spread across several teams. No single area clearly leads.",
    "Use the next scan to see whether the mix changes.",
  ];
}

function formatSignalVerdictHeadline(
  verdict: SignalVerdictResult,
  changeSignificance: ChangeSignificance,
  changeDirection: ChangeDirection
): string {
  if (verdict.verdict !== "watch") return verdict.headline;
  if (changeSignificance === "baseline") return "First scan";
  if (changeSignificance === "limited_comparison") return "Limited history";
  if (changeSignificance === "minor_change") return "Minor movement";
  if (changeDirection === "mix_shift") return "Mix shift";
  if (changeDirection === "geography_shift") return "Geography shift";
  if (changeDirection === "replacement_churn") return "Replacement churn";
  if (
    verdict.headline &&
    verdict.headline !== "Worth watching" &&
    verdict.headline !== "Meaningful movement" &&
    verdict.headline !== "First baseline established"
  ) {
    return verdict.headline;
  }
  return "Watch next scan";
}

function formatSignalVerdictReason(
  verdict: SignalVerdictResult,
  changeSignificance: ChangeSignificance
): string {
  if (verdict.verdict === "watch" && changeSignificance === "baseline") {
    return "No previous scan to compare yet.";
  }
  return verdict.reason;
}

function buildWhatChangedParagraphs(summary: string): string[] {
  const trimmed = summary.trim();
  if (!trimmed.startsWith("Small change since last scan.")) {
    return [summary];
  }

  const sentences =
    trimmed
      .match(/[^.]+(?:\.|$)/g)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? [];

  if (sentences.length === 4) {
    return [sentences[0], `${sentences[1]} ${sentences[2]}`, sentences[3]];
  }

  if (sentences.length >= 3) {
    return sentences;
  }

  return [summary];
}

// --- Components ---

function BriefSection({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: "var(--border)" }}>
        {Icon && <Icon className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />}
        <h2 className="text-[12px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
          {title}
        </h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function StratumBriefPage({ params }: BriefPageProps) {
  const { briefId } = await params;
  let session;
  try {
    session = await requireAuthSession();
  } catch {
    redirect(buildSignInRedirectPath(`/briefs/${briefId}`));
  }

  const brief = await getStratumBriefById(briefId, { tenantId: session.tenantId });
  if (!brief) notFound();

  const replayContext = brief.watchlistEntryId
    ? await getWatchlistBriefReplayContext({
        scope: { tenantId: session.tenantId },
        watchlistEntryId: brief.watchlistEntryId,
        briefId: brief.id,
      })
    : null;

  const monitoring = replayContext?.monitoring ?? null;
  const allJobs = brief.resultSnapshot?.jobs || [];
  const hasFullData = allJobs.length > 0;
  const roles = brief.proofRolesSnapshot || [];
  const exampleJobs = roles.slice(0, 5);
  const providerDiagnostics = buildProviderDiagnosticsView(brief.resultSnapshot);
  const sourceLimit = buildSourceScopeSummary(brief.resultSnapshot);
  
  const hiringMix = computeFunctionalMix(hasFullData ? allJobs : roles);
  const geography = getGeographySpread(hasFullData ? allJobs : roles);
  const hiringPattern = formatHiringPatternDisplay(hiringMix);

  // Editorial Hero Logic
  const sourceLabel = formatSourceLabel(brief.atsSourceUsed);
  const observedCount = brief.jobsObservedCount ?? allJobs.length ?? roles.length;
  const heroPattern =
    hiringPattern.endsWith("-led")
      ? `${hiringPattern} hiring`
      : hiringPattern === "Mixed"
        ? "Mixed hiring"
        : "Active hiring";
  const heroSentence = observedCount > 0
    ? `${heroPattern} from ${observedCount} ${sourceLabel} jobs.`
    : "No active hiring signals detected for this company.";
  
  // If a role has no roleId/jobUrl, it is omitted — scoring degrades gracefully.
  const summarySentences = buildExecutiveSummarySentences({
    companyName: brief.matchedCompanyName,
    hiringMix,
    observedCount,
    sourceLabel,
    hiringPattern,
  });
  const interpretationSentences = buildWhyThisMattersSentences({
    hiringMix,
    hiringPattern,
    hasPriorComparison: !!monitoring?.comparisonAvailable,
  });
  const readiness = deriveBriefPublicReadiness({
    jobsCount: observedCount,
    watchlistReadConfidence: brief.watchlistReadConfidence as WatchlistConfidenceLevel,
    companyMatchConfidence: brief.companyMatchConfidence as WatchlistConfidenceLevel,
    proofRoleGrounding: brief.proofRoleGrounding as WatchlistProofGrounding,
    label: brief.watchlistReadLabel as ApprovedWatchlistLabel,
    hasComparison: !!monitoring?.comparisonAvailable,
    hasMaterialChange: !!monitoring?.diff?.hasMaterialChange,
    hasSignificantChange: !!monitoring?.diff?.hasSignificantChange,
    significanceDrivers: (monitoring?.diff?.significanceDrivers ?? []) as Array<"count" | "roles" | "mix" | "geography">,
    comparisonStrength: (monitoring?.diff?.comparisonStrength ?? "unavailable") as "standard" | "weak" | "unavailable",
    changeDirection: (monitoring?.diff?.changeDirection ?? (monitoring?.comparisonAvailable ? "minor_movement" : "baseline")) as ChangeDirection,
  });

  // Phase 6E-2: prefer persisted Signal Verdict (stored at notification-creation
  // time when the diff was available). Fall back to render-time computation for
  // legacy briefs that pre-date this phase or whose verdict update failed.
  const signalVerdict: SignalVerdictResult = brief.signalVerdict
    ? {
        verdict: brief.signalVerdict,
        headline: brief.signalVerdictHeadline ?? "Worth watching",
        reason: brief.signalVerdictReason ?? "",
        alertPriority: (brief.signalVerdictAlertPriority ?? "digest") as SignalVerdictResult["alertPriority"],
      }
    : deriveSignalVerdict({
        evidenceQuality: readiness.evidenceQuality,
        signalClarity: readiness.signalClarity,
        changeSignificance: readiness.changeSignificance,
        changeDirection: readiness.changeDirection,
        companyMatchConfidence: brief.companyMatchConfidence as WatchlistConfidenceLevel,
        watchlistReadConfidence: brief.watchlistReadConfidence as WatchlistConfidenceLevel,
        proofRoleGrounding: brief.proofRoleGrounding as WatchlistProofGrounding,
        resultState: brief.resultState as StratumResultState,
        jobsObservedCount: observedCount,
      });
  const signalVerdictHeadline = formatSignalVerdictHeadline(
    signalVerdict,
    readiness.changeSignificance,
    readiness.changeDirection
  );
  const signalVerdictReason = formatSignalVerdictReason(
    signalVerdict,
    readiness.changeSignificance
  );

  // Verdict display label (e.g. "verify_source" → "VERIFY SOURCE")
  const formatVerdict = (v: string) =>
    v === "verify_source" ? "VERIFY SOURCE" : v.toUpperCase();

  // Verdict-level colors — minimal, no emojis
  const verdictColors = {
    act:           { border: "rgba(34, 197, 94, 0.3)",   bg: "rgba(34, 197, 94, 0.05)",  text: "rgb(21, 128, 61)" },
    watch:         { border: "rgba(59, 130, 246, 0.3)",  bg: "rgba(59, 130, 246, 0.04)", text: "rgb(29, 78, 216)" },
    wait:          { border: "var(--border)",             bg: "var(--surface)",           text: "var(--foreground-muted)" },
    verify_source: { border: "rgba(245, 158, 11, 0.3)",  bg: "rgba(245, 158, 11, 0.04)", text: "rgb(146, 64, 14)" },
    ignore:        { border: "var(--border)",             bg: "var(--surface)",           text: "var(--foreground-muted)" },
  } as const;
  const vc = verdictColors[signalVerdict.verdict];

  const formatChangeSignificance = (sig: string) => {
    switch (sig) {
      case "meaningful_change": return "Meaningful update";
      case "minor_change": return "Minor movement";
      case "baseline": return "First scan";
      case "limited_comparison": return "Limited history";
      default: return sig;
    }
  };

  const formatChangeEvent = (sig: ChangeSignificance, dir: ChangeDirection) => {
    if (sig === "baseline") return "First scan";
    if (sig === "limited_comparison") return "Limited history";
    
    switch (dir) {
      case "expansion": return "Meaningful expansion";
      case "contraction": return "Hiring contraction";
      case "replacement_churn": return "Replacement churn";
      case "mix_shift": return "Strategic mix shift";
      case "geography_shift": return "Geography shift";
      case "minor_movement": return "Minor movement";
      default: return formatChangeSignificance(sig);
    }
  };

  // Support chips: four facts that give context below the verdict.
  // Snapshot and Public Use are demoted — Snapshot moves to "Source and trust"
  // below; Public Use is no longer the hero gate.
  const supportFacts = [
    ["Source", sourceLabel],
    ["Jobs", observedCount.toString()],
    ["Hiring pattern", hiringPattern],
    ["Change", formatChangeEvent(readiness.changeSignificance, readiness.changeDirection)],
  ] as const;
  const localFallbackAnalysisUsed =
    Array.isArray(brief.resultSnapshot?.keywordFindings) &&
    brief.resultSnapshot.keywordFindings.some((finding) => finding.startsWith("Local fallback analysis"));
  const aiFallbackNote = localFallbackAnalysisUsed
    ? "AI enrichment was unavailable for this brief. Stratum used basic analysis instead."
    : null;

  const whatChangedDisplay = buildWhatChangedDisplay({
    briefPosition: monitoring?.briefPosition ?? null,
    comparisonAvailable: monitoring?.comparisonAvailable ?? false,
    comparisonStrength: (monitoring?.comparisonStrength ?? "unavailable") as "standard" | "weak" | "unavailable",
    comparisonSummary: monitoring?.comparisonSummary ?? null,
    comparisonNotes: monitoring?.diff?.comparisonNotes ?? [],
  });

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 lg:px-6 lg:py-4">
        
        {/* Navigation */}
        <div className="mb-1.5 flex items-center justify-between">
          {monitoring?.watchlistId && monitoring?.entryId ? (
            <Link
              href={`/watchlists/${monitoring.watchlistId}/entries/${monitoring.entryId}`}
              className="inline-flex items-center gap-2 text-[12px] font-medium transition-colors hover:text-[var(--accent)]"
              style={{ color: "var(--foreground-secondary)" }}
            >
              <ArrowLeft className="h-3 w-3" />
              Back to entry
            </Link>
          ) : monitoring?.watchlistId ? (
            <Link
              href={`/watchlists?watchlistId=${monitoring.watchlistId}`}
              className="inline-flex items-center gap-2 text-[12px] font-medium transition-colors hover:text-[var(--accent)]"
              style={{ color: "var(--foreground-secondary)" }}
            >
              <ArrowLeft className="h-3 w-3" />
              Back to watchlist
            </Link>
          ) : <div />}
        </div>

        {/* Hero */}
        <header className="mb-5 space-y-3">
          <div className="space-y-0.5">
            <h1 className="break-words text-[2.2rem] font-bold tracking-[-0.04em] lg:text-[3.2rem]" style={{ color: "var(--foreground)" }}>
              {brief.matchedCompanyName}
            </h1>
            <p className="max-w-[48rem] break-words text-[1rem] leading-6" style={{ color: "var(--foreground-secondary)" }}>
              {heroSentence}
            </p>
          </div>

          {/* Signal Verdict — dominant hero status */}
          <div className="rounded-xl border px-5 py-4" style={{ borderColor: vc.border, backgroundColor: vc.bg }}>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase mb-1.5" style={{ color: vc.text }}>
              {formatVerdict(signalVerdict.verdict)}
            </p>
            <p className="text-[14px] font-semibold leading-5" style={{ color: "var(--foreground)" }}>
              {signalVerdictHeadline}
            </p>
            <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
              {signalVerdictReason}
            </p>
          </div>

          {/* Support chips */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {supportFacts.map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-[var(--surface)] px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <p className="text-[10px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                  {label}
                </p>
                <p className="mt-1 break-words text-[13px] font-medium leading-5" style={{ color: "var(--foreground)" }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
          {aiFallbackNote && (
            <p className="text-[12px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
              {aiFallbackNote}
            </p>
          )}
        </header>



        <div className="grid grid-cols-1 gap-8">
          
          {/* Executive Summary & Interpretation */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.45fr_0.85fr]">
            <div className="space-y-5">
              <BriefSection title="Executive summary" icon={Info}>
                <div className="space-y-3">
                  {summarySentences.map((sentence, idx) => (
                    <p key={idx} className="text-[15px] leading-7" style={{ color: "var(--foreground)" }}>
                      {sentence}
                    </p>
                  ))}
                </div>
              </BriefSection>

              <BriefSection title="Why this matters" icon={Layers}>
                <div className="rounded-2xl border bg-[rgba(59,130,246,0.02)] p-4" style={{ borderColor: "rgba(59,130,246,0.12)" }}>
                  <div className="space-y-2">
                    {interpretationSentences.map((sentence, idx) => (
                      <p key={idx} className="text-[14px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
                        {sentence}
                      </p>
                    ))}
                  </div>
                </div>
              </BriefSection>

              <BriefSection title="Example jobs" icon={ShieldCheck}>
                <div className="space-y-1.5">
                  {exampleJobs.map((role, idx) => (
                    <div key={idx} className="group flex items-start gap-3 rounded-xl border bg-[var(--surface)] px-3 py-2.5 transition-colors hover:border-[var(--accent)]" style={{ borderColor: "var(--border)" }}>
                      <div className="mt-0.5 w-8 shrink-0 text-[11px] font-medium tabular-nums" style={{ color: "var(--foreground-muted)" }}>
                        {String(idx + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <h3 className="break-words text-[13px] font-semibold leading-5" style={{ color: "var(--foreground)" }}>{role.title}</h3>
                        <p className="break-words text-[11px]" style={{ color: "var(--foreground-secondary)" }}>
                          {role.department || "General"} / {role.location || "Remote"}
                        </p>
                      </div>
                      {role.jobUrl && (
                        <a
                          href={role.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto shrink-0 self-center opacity-30 transition-opacity group-hover:opacity-100"
                          aria-label={`Open ${role.title}`}
                        >
                          <ExternalLink className="h-3 w-3" style={{ color: "var(--foreground-muted)" }} />
                        </a>
                      )}
                    </div>
                  ))}
                  {exampleJobs.length === 0 && <p className="text-sm opacity-40">No example jobs available</p>}
                </div>
              </BriefSection>
            </div>

            <BriefSection title="Hiring mix and geography" icon={MapPin}>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.02em] opacity-40">Hiring mix {!hasFullData && <span className="lowercase font-normal italic">(examples only)</span>}</h3>
                  <div className="space-y-1.5">
                    {hiringMix.map(([bucket, count]) => (
                      <div key={bucket} className="flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)" }}>
                        <span className="font-medium" style={{ color: "var(--foreground-secondary)" }}>{formatHiringMixBucketLabel(bucket)}</span>
                        <span className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{count}</span>
                      </div>
                    ))}
                    {hiringMix.length === 0 && <p className="text-xs italic opacity-40">No signal identified</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.02em] opacity-40">Geography {!hasFullData && <span className="lowercase font-normal italic">(examples only)</span>}</h3>
                  <div className="space-y-1.5">
                    {geography.map(([loc, count]) => (
                      <div key={loc} className="flex items-center justify-between rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--border)" }}>
                        <span className="truncate pr-4" style={{ color: "var(--foreground-muted)" }}>{loc}</span>
                        <span className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{count}</span>
                      </div>
                    ))}
                    {geography.length === 0 && <p className="text-xs italic opacity-40">No geographic pattern identified</p>}
                  </div>
                </div>
              </div>
            </BriefSection>
          </div>

          {/* What Changed */}
          {whatChangedDisplay.kind !== "baseline" && (
            <BriefSection title="What changed" icon={History}>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                {whatChangedDisplay.kind === "archived" && (
                  <p className="text-[13px] leading-6 font-medium" style={{ color: "var(--foreground-secondary)" }}>
                    No scoped comparison is available for this archived brief. The current watchlist comparison reflects newer briefs.
                  </p>
                )}
                {whatChangedDisplay.kind === "weak_caveat" && (
                  <div className="space-y-2">
                    {whatChangedDisplay.heading && (
                      <p className="text-[10px] font-semibold tracking-[0.04em] uppercase opacity-50" style={{ color: "var(--foreground-muted)" }}>
                        {whatChangedDisplay.heading}
                      </p>
                    )}
                    <p className="text-[13px] leading-5 font-medium" style={{ color: "var(--foreground-secondary)" }}>
                      {whatChangedDisplay.caveat}
                    </p>
                    <details className="group">
                      <summary className="cursor-pointer text-[11px] font-medium tracking-[0.02em] opacity-30 hover:opacity-60">
                        Show detailed change log
                      </summary>
                      <p className="mt-2 text-[12px] leading-5 opacity-60" style={{ color: "var(--foreground-muted)" }}>
                        {whatChangedDisplay.fullSummary}
                      </p>
                    </details>
                  </div>
                )}
                {whatChangedDisplay.kind === "standard" && (() => {
                  const whatChangedParagraphs = buildWhatChangedParagraphs(whatChangedDisplay.summary);

                  return (
                    <div className="space-y-1.5">
                      {whatChangedDisplay.heading && (
                        <p className="text-[10px] font-semibold tracking-[0.04em] uppercase opacity-50" style={{ color: "var(--foreground-muted)" }}>
                          {whatChangedDisplay.heading}
                        </p>
                      )}
                      {whatChangedParagraphs.length > 1 ? (
                        <div className="space-y-3">
                          {whatChangedParagraphs.map((paragraph, index) => (
                            <p
                              key={`${index}-${paragraph}`}
                              className="text-[14px] leading-6 font-medium"
                              style={{ color: "var(--foreground)" }}
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[14px] leading-6 font-medium" style={{ color: "var(--foreground)" }}>
                          {whatChangedDisplay.summary}
                        </p>
                      )}
                      {whatChangedDisplay.comparisonStrength !== "standard" && whatChangedDisplay.comparisonStrength !== "unavailable" && (
                        <p className="text-[10px] font-medium tracking-[0.02em] opacity-40">
                          Comparison strength: {whatChangedDisplay.comparisonStrength}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </BriefSection>
          )}

          {/* Bottom Layer: Evidence & Trust */}
          <div className="space-y-5 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <BriefSection title="Source and trust">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium tracking-[0.02em] opacity-45">Source used</p>
                  <p className="text-[12px] font-medium">{sourceLabel}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium tracking-[0.02em] opacity-45">Date</p>
                  <p className="text-[12px] font-medium">{formatDateTimeValue(brief.createdAt)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium tracking-[0.02em] opacity-45">Source limit</p>
                  <p className="text-[12px] font-medium leading-5">{sourceLimit}</p>
                </div>
              </div>
            </BriefSection>

            <details className="group rounded-[24px] border bg-[var(--surface)] p-6 lg:p-7" style={{ borderColor: "var(--border)" }}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 transition-colors hover:text-[var(--accent)]">
                <div className="space-y-1">
                  <h2 className="text-[13px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                    Scan details for support
                  </h2>
                  <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                    Shows source checks and scan details. Share with support if something looks wrong.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium tracking-[0.02em] opacity-25">
                  <span className="group-open:hidden">Show details</span>
                  <span className="hidden group-open:block">Hide details</span>
                </div>
              </summary>

              <div className="mt-4">
                {providerDiagnostics.hasDiagnostics ? (
                  <div className="space-y-3">
                    {providerDiagnostics.rows.map((row) => {
                      const isSkippedProvider = row.status === "not_attempted_after_match";

                      return (
                        <article
                          key={row.source}
                          className="rounded-2xl border px-4 py-4"
                          style={{
                            background: "var(--background)",
                            borderColor: "var(--border)",
                          }}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                                {row.sourceLabel}
                              </p>
                              <p className="text-[13px] font-medium leading-6" style={{ color: "var(--foreground)" }}>
                                Status: {row.statusLabel}
                              </p>
                            </div>
                            {!isSkippedProvider && (
                              <div
                                className="rounded-full border px-3 py-1 text-[11px] font-medium"
                                style={{
                                  borderColor: "var(--border)",
                                  color: row.usedForBrief ? "var(--foreground)" : "var(--foreground-secondary)",
                                }}
                              >
                                {row.usedForBrief ? "Used for this brief" : "Not used for this brief"}
                              </div>
                            )}
                          </div>

                          {isSkippedProvider ? (
                            <p className="mt-3 text-[11px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                              {row.note}
                            </p>
                          ) : (
                            <>
                              <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] leading-5 sm:grid-cols-2 lg:grid-cols-3">
                                <p style={{ color: "var(--foreground-secondary)" }}>
                                  <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                    Jobs found
                                  </span>{" "}
                                  {row.jobsCount}
                                </p>
                                <p style={{ color: "var(--foreground-secondary)" }}>
                                  <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                    Used for this brief
                                  </span>{" "}
                                  {row.usedForBrief ? "yes" : "no"}
                                </p>
                                <p className="sm:col-span-2 lg:col-span-3" style={{ color: "var(--foreground-secondary)" }}>
                                  <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                    Note
                                  </span>{" "}
                                  {row.note}
                                </p>
                              </div>

                              {(() => {
                                const runnableAttempts = row.attempts.filter(
                                  (a) => a.status !== "not_attempted_after_match" && a.status !== "not_applicable"
                                );
                                if (runnableAttempts.length === 0) return null;
                                return (
                                  <div className="mt-4 space-y-2">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                                      Scan attempts
                                    </p>
                                    <div className="space-y-2">
                                      {runnableAttempts.map((attempt, index) => (
                                        <div
                                          key={`${row.source}-${index}`}
                                          className="rounded-xl border px-3 py-3"
                                          style={{
                                            background: "var(--surface)",
                                            borderColor: "var(--border)",
                                          }}
                                        >
                                          <p className="text-[11px] font-medium leading-5" style={{ color: "var(--foreground)" }}>
                                            Check {index + 1}: {attempt.statusLabel}
                                          </p>
                                          <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] leading-5 sm:grid-cols-2 lg:grid-cols-3">
                                            {attempt.providerErrorKind ? (
                                              <p style={{ color: "var(--foreground-secondary)" }}>
                                                <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                                  Source issue
                                                </span>{" "}
                                                {attempt.providerErrorKind}
                                              </p>
                                            ) : null}
                                            {attempt.httpStatus !== null ? (
                                              <p style={{ color: "var(--foreground-secondary)" }}>
                                                <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                                  HTTP status
                                                </span>{" "}
                                                {attempt.httpStatus}
                                              </p>
                                            ) : null}
                                            {attempt.attemptCount !== null ? (
                                              <p style={{ color: "var(--foreground-secondary)" }}>
                                                <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                                  Checks
                                                </span>{" "}
                                                {attempt.attemptCount}
                                              </p>
                                            ) : null}
                                            {attempt.retryCount !== null ? (
                                              <p style={{ color: "var(--foreground-secondary)" }}>
                                                <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                                  Retries
                                                </span>{" "}
                                                {attempt.retryCount}
                                              </p>
                                            ) : null}
                                            {attempt.durationMs !== null ? (
                                              <p style={{ color: "var(--foreground-secondary)" }}>
                                                <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                                  Scan time
                                                </span>{" "}
                                                {attempt.durationMs} ms
                                              </p>
                                            ) : null}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] leading-6" style={{ color: "var(--foreground-muted)" }}>
                    No scan details were stored for this brief.
                  </p>
                )}
              </div>
            </details>
          </div>

        </div>
      </div>
    </div>
  );
}
