import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck, MapPin, Layers, Info, History, ShieldAlert } from "lucide-react";
import { buildSignInRedirectPath, requireAuthSession } from "@/lib/auth/session";
import { getStratumBriefById } from "@/lib/briefs/repository";
import { buildStratumLimitations, formatSourceLabel } from "@/lib/briefs/presentation";
import { getWatchlistBriefReplayContext } from "@/lib/watchlists/repository";

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

function splitIntoSentences(value: string | null | undefined): string[] {
  if (!value) return [];

  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function mapToFunctionalBucket(role: { title: string; department?: string }): string {
  const text = `${role.title} ${role.department || ""}`.toLowerCase();
  
  if (/\b(sales|account|bdr|sdr|business development|revenue|growth)\b/.test(text)) return "Sales";
  if (/\b(engineer|developer|software|backend|frontend|fullstack|devops|sre|infrastructure|architect|data|machine learning|ai)\b/.test(text)) return "Engineering";
  if (/\b(product|ux|user experience|ui|owner)\b/.test(text)) return "Product";
  if (/\b(marketing|seo|content|social media|creative|brand|communications|pr)\b/.test(text)) return "Marketing";
  if (/\b(finance|accounting|accountant|controller|tax|audit|billing|payroll)\b/.test(text)) return "Finance";
  if (/\b(operations|ops|hr|people|talent|recruiter|recruiting|legal|compliance|admin|workplace)\b/.test(text)) return "Operations";
  if (/\b(head of|vp|director|chief|c-level|ceo|cto|cfo|coo|cmo|founder|president)\b/.test(text)) return "Leadership";
  
  return "Other";
}

function getHiringMix(roles: any[]) {
  const counts: Record<string, number> = {};
  roles.forEach((r) => {
    const bucket = mapToFunctionalBucket(r);
    counts[bucket] = (counts[bucket] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1]);
}

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

function getNotableOpenings(roles: any[]) {
  const signalKeywords = ["senior", "lead", "manager", "director", "head", "staff", "principal", "architect", "vp", "chief"];
  const notable = roles.filter((r) =>
    signalKeywords.some((k) => r.title.toLowerCase().includes(k))
  );
  return notable.length > 0 ? notable.slice(0, 8) : roles.slice(0, 8);
}

function getInterpretation(hiringMix: [string, number][], rawExplanation: string): string {
  // Strip pipeline language aggressively
  const systemKeywords = /\b(read confidence|grounding|proof|timestamp|match|direct|exact|provider|matched|confidence)\b/gi;
  let interpretation = rawExplanation.split(/[.!?]/).filter(s => !systemKeywords.test(s)).join(". ").trim();
  
  if (interpretation.length < 20) {
    // Synthesize grounded interpretation if the explanation is thin or system-heavy
    const topBuckets = hiringMix.slice(0, 3).map(([b]) => b.toLowerCase());
    if (topBuckets.length === 0) return "Observed hiring patterns suggest a coordinated functional focus across the organization.";
    
    const focus = topBuckets.join(", ");
    const isGTM = topBuckets.includes("sales") || topBuckets.includes("marketing") || topBuckets.includes("product");
    
    return `Visible hiring is concentrated across ${focus} roles, which suggests ${isGTM ? "continued go-to-market and product" : "coordinated organizational"} expansion rather than isolated backfill.`;
  }
  
  return interpretation.endsWith(".") ? interpretation : interpretation + ".";
}

// --- Components ---

function BriefSection({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
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
  const limitations =
    brief.limitsSnapshot.length > 0 ? brief.limitsSnapshot : buildStratumLimitations(brief.resultSnapshot);
  const roles = brief.proofRolesSnapshot || [];
  const hiringMix = getHiringMix(roles);
  const geography = getGeographySpread(roles);
  const notableOpenings = getNotableOpenings(roles);
  
  // Editorial Hero Logic
  const sourceLabel = formatSourceLabel(brief.atsSourceUsed);
  const topBuckets = hiringMix.slice(0, 2).map(([b]) => b.toLowerCase());
  const isGTMFocus = topBuckets.includes("sales") || topBuckets.includes("marketing");
  
  const heroSentence = roles.length > 0
    ? `${isGTMFocus ? "Go-to-market hiring read" : "Active hiring read"} from ${roles.length} ${sourceLabel} openings.`
    : "No active hiring signals detected for this company.";
  const summarySentences = splitIntoSentences(brief.watchlistReadSummary);
  const interpretationSentences = splitIntoSentences(getInterpretation(hiringMix, brief.watchlistReadExplanation));
  const heroFacts = [
    ["Snapshot", formatDateTimeValue(brief.createdAt)],
    ["Source", sourceLabel],
    ["Confidence", brief.watchlistReadConfidence],
    ["Proof basis", brief.proofRoleGrounding],
  ] as const;

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 lg:px-6 lg:py-4">
        
        {/* Navigation */}
        <div className="mb-1.5 flex items-center justify-between">
          {monitoring?.watchlistId ? (
            <Link
              href={`/watchlists?watchlistId=${monitoring.watchlistId}${monitoring.entryId ? `&entryId=${monitoring.entryId}` : ""}`}
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {heroFacts.map(([label, value]) => (
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
        </header>

        <div className="grid grid-cols-1 gap-8">
          
          {/* Executive Summary & Interpretation */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.45fr_0.85fr]">
            <div className="space-y-5">
              <BriefSection title="Executive summary" icon={Info}>
                <div className="space-y-3">
                  {summarySentences.length > 0 ? (
                    summarySentences.map((sentence, idx) => (
                      <p key={idx} className="text-[15px] leading-7" style={{ color: "var(--foreground)" }}>
                        {sentence}
                      </p>
                    ))
                  ) : (
                    <p className="text-[15px] leading-7" style={{ color: "var(--foreground)" }}>
                      {brief.watchlistReadSummary}
                    </p>
                  )}
                </div>
              </BriefSection>

              <BriefSection title="Why this matters" icon={Layers}>
                <div className="rounded-2xl border bg-[rgba(59,130,246,0.02)] p-4" style={{ borderColor: "rgba(59,130,246,0.12)" }}>
                  <div className="space-y-2">
                    {interpretationSentences.length > 0 ? (
                      interpretationSentences.map((sentence, idx) => (
                        <p key={idx} className="text-[14px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
                          {sentence}
                        </p>
                      ))
                    ) : (
                      <p className="text-[14px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
                        {getInterpretation(hiringMix, brief.watchlistReadExplanation)}
                      </p>
                    )}
                  </div>
                </div>
              </BriefSection>

              <BriefSection title="Notable openings" icon={ShieldCheck}>
                <div className="space-y-1.5">
                  {notableOpenings.map((role, idx) => (
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
                  {notableOpenings.length === 0 && <p className="text-sm opacity-40">No notable openings identified</p>}
                </div>
              </BriefSection>
            </div>

            <BriefSection title="Hiring mix and geography" icon={MapPin}>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.02em] opacity-40">Hiring mix</h3>
                  <div className="space-y-1.5">
                    {hiringMix.map(([bucket, count]) => (
                      <div key={bucket} className="flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)" }}>
                        <span className="font-medium" style={{ color: "var(--foreground-secondary)" }}>{bucket}</span>
                        <span className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{count}</span>
                      </div>
                    ))}
                    {hiringMix.length === 0 && <p className="text-xs italic opacity-40">No signal identified</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.02em] opacity-40">Geography</h3>
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
          <BriefSection title="What changed" icon={History}>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              {monitoring?.comparisonSummary ? (
                <div className="space-y-1.5">
                  <p className="text-[14px] leading-6 font-medium" style={{ color: "var(--foreground)" }}>
                    {monitoring.comparisonSummary}
                  </p>
                  {monitoring.comparisonStrength && (
                    <p className="text-[10px] font-medium tracking-[0.02em] opacity-40">
                      Comparison strength: {monitoring.comparisonStrength}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[13px] leading-6 font-medium" style={{ color: "var(--foreground-secondary)" }}>
                  This is the first saved brief for this company. No prior brief yet to compare against.
                </p>
              )}
            </div>
          </BriefSection>

          {/* Bottom Layer: Evidence & Trust */}
          <div className="space-y-5 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between transition-colors hover:text-[var(--accent)]" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground)" }}>Evidence archive</h2>
                  <span className="text-[10px] font-medium opacity-45" style={{ color: "var(--foreground-muted)" }}>{roles.length} roles</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.02em] opacity-25">
                  <span className="group-open:hidden">Show archive</span>
                  <span className="hidden group-open:block">Hide archive</span>
                </div>
              </summary>
              <div className="mt-3 space-y-1.5">
                {roles.map((role, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-3 truncate">
                      <span className="w-5 shrink-0 text-[10px] font-bold opacity-10">#{index + 1}</span>
                      <span className="font-semibold truncate" style={{ color: "var(--foreground)" }}>{role.title}</span>
                      <span className="opacity-20">/</span>
                      <span className="opacity-60 truncate">{role.department}</span>
                    </div>
                    {role.jobUrl && (
                      <a href={role.jobUrl} target="_blank" rel="noreferrer" className="ml-2 shrink-0">
                        <ExternalLink className="h-3 w-3 opacity-20 hover:opacity-100" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between transition-colors hover:text-[var(--accent)]" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>Source and trust</h2>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.02em] opacity-25">
                  <span className="group-open:hidden">Show details</span>
                  <span className="hidden group-open:block">Hide details</span>
                </div>
              </summary>
              <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium tracking-[0.02em] opacity-45">Snapshot</p>
                  <p className="text-[12px] font-medium">{formatDateTimeValue(brief.createdAt)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium tracking-[0.02em] opacity-45">Confidence</p>
                  <p className="text-[12px] font-medium capitalize">{brief.watchlistReadConfidence}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium tracking-[0.02em] opacity-45">Proof basis</p>
                  <p className="text-[12px] font-medium capitalize">{brief.proofRoleGrounding}</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-medium tracking-[0.02em] opacity-45">Brief ID</p>
                   <p className="text-[12px] font-mono opacity-40">{brief.id.slice(0, 12)}</p>
                </div>
                {limitations.length > 0 && (
                  <div className="col-span-full pt-2">
                    <p className="pb-2 text-[10px] font-medium tracking-[0.02em] opacity-30">Analysis caveats</p>
                    <ul className="grid grid-cols-1 gap-1 lg:grid-cols-2">
                      {limitations.map((l, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                          <ShieldAlert className="h-2.5 w-2.5 mt-0.5 shrink-0 opacity-20" />
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          </div>

        </div>
      </div>
    </div>
  );
;
}
