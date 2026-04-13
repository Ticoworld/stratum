import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getStratumBriefById } from "@/lib/briefs/repository";
import { buildStratumLimitations, formatSourceLabel } from "@/lib/briefs/presentation";
import { getScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { getWatchlistBriefReplayContext } from "@/lib/watchlists/repository";
import { attachWatchlistMonitoringToResult } from "@/lib/watchlists/monitoring";
import {
  formatMonitoringAttemptOriginLabel,
  formatMonitoringAttemptOutcomeLabel,
} from "@/lib/watchlists/monitoringEvents";
import { formatWatchlistScheduleCadenceLabel } from "@/lib/watchlists/schedules";

type BriefPageProps = {
  params: Promise<{
    briefId: string;
  }>;
};

function formatDateTimeValue(value: string | null | undefined): string {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCoverageLabel(value: string | null | undefined): string {
  switch (value) {
    case "single_matched_provider_only":
      return "One matched provider only";
    case "matched_provider_zero_observed_roles":
      return "Matched provider, zero roles";
    case "unsupported_source_pattern":
      return "Unsupported ATS/source pattern";
    case "inconclusive_due_to_provider_failure":
      return "Inconclusive because of provider failure";
    case "no_supported_provider_match":
      return "No supported provider match";
    default:
      return "Unknown";
  }
}

function formatResultStateLabel(value: string): string {
  switch (value) {
    case "supported_provider_matched_with_observed_openings":
      return "Observed openings";
    case "supported_provider_matched_with_zero_observed_openings":
      return "Matched provider, zero openings";
    case "unsupported_ats_or_source_pattern":
      return "Unsupported source pattern";
    case "ambiguous_company_match":
      return "Ambiguous company match";
    case "provider_failure":
      return "Provider failure";
    case "no_matched_provider_found":
      return "No supported match";
    default:
      return value;
  }
}

function formatConfidenceLabel(value: string): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
      return "None";
    default:
      return value;
  }
}

function formatProofGroundingLabel(value: string): string {
  switch (value) {
    case "exact":
      return "Exact";
    case "partial":
      return "Partial";
    case "fallback":
      return "Fallback";
    default:
      return "None";
  }
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border bg-[var(--surface)]" style={{ borderColor: "var(--border)" }}>
      <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
          {title}
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
          {description}
        </p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-[var(--background)] p-4" style={{ borderColor: "var(--border)" }}>
      <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {value}
      </p>
    </div>
  );
}

export default async function StratumBriefPage({ params }: BriefPageProps) {
  const { briefId } = await params;
  const brief = await getStratumBriefById(briefId);
  const automationStatus = getScheduledAutomationStatus();

  if (!brief) {
    notFound();
  }

  const replayContext = brief.watchlistEntryId
    ? await getWatchlistBriefReplayContext({
        watchlistEntryId: brief.watchlistEntryId,
        briefId: brief.id,
      })
    : null;
  const monitoring = replayContext?.monitoring ?? null;
  const resultSnapshot = attachWatchlistMonitoringToResult(
    {
      ...brief.resultSnapshot,
      watchlistEntryId: brief.watchlistEntryId ?? brief.resultSnapshot.watchlistEntryId,
    },
    monitoring
  );
  const limitations = brief.limitsSnapshot.length > 0 ? brief.limitsSnapshot : buildStratumLimitations(brief.resultSnapshot);

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6 lg:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
              Saved brief artifact
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
              {brief.matchedCompanyName}
            </h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              This is a saved snapshot, not the live monitoring surface.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {monitoring?.watchlistId ? (
              <Link
                href={`/watchlists?watchlistId=${monitoring.watchlistId}${monitoring.entryId ? `&entryId=${monitoring.entryId}` : ""}`}
                className="inline-flex items-center gap-2 rounded border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                <ArrowLeft className="h-3 w-3" />
                Back to watchlist
              </Link>
            ) : null}
            {monitoring?.latestBriefId ? (
              <Link
                href={`/briefs/${monitoring.latestBriefId}`}
                className="inline-flex items-center gap-2 rounded border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                Open latest saved brief
              </Link>
            ) : null}
            {monitoring?.lastMonitoringAttemptMatchedCompanyName ? (
              <span className="rounded border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}>
                Latest monitoring context: {monitoring.lastMonitoringAttemptMatchedCompanyName}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Stat label="Brief ID" value={brief.id} />
          <Stat label="Saved" value={formatDateTimeValue(brief.createdAt)} />
          <Stat label="Result state" value={formatResultStateLabel(brief.resultState)} />
          <Stat label="Source coverage" value={formatCoverageLabel(brief.sourceCoverageCompleteness)} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4">
            <Section
              title="Artifact summary"
              description="What Stratum saved at the moment this brief was created."
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Stat label="Requested query" value={brief.queriedCompanyName} />
                  <Stat label="Matched company" value={brief.matchedCompanyName} />
                  <Stat label="ATS source" value={formatSourceLabel(brief.atsSourceUsed)} />
                  <Stat label="Watchlist read" value={brief.watchlistReadLabel} />
                </div>

                <div className="rounded border bg-[var(--background)] p-4" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                    Snapshot text
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                    {brief.watchlistReadSummary}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                    {brief.watchlistReadExplanation}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Stat label="Read confidence" value={formatConfidenceLabel(brief.watchlistReadConfidence)} />
                  <Stat label="Grounding" value={formatProofGroundingLabel(brief.proofRoleGrounding)} />
                </div>

                <div className="rounded border bg-[var(--background)] p-4" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                    Artifact notice
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                    {brief.resultSnapshot.artifactOrigin === "saved"
                      ? "This page is replaying a stored brief artifact. It is not recomputing the result."
                      : "This brief came from a live monitoring result and is shown as a saved snapshot."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <span style={{ color: "var(--foreground-muted)" }}>
                      {automationStatus.label}
                    </span>
                    <span style={{ color: "var(--foreground-muted)" }}>
                      Saved at {formatDateTimeValue(brief.createdAt)}
                    </span>
                    {brief.updatedAt !== brief.createdAt ? (
                      <span style={{ color: "var(--foreground-muted)" }}>
                        Updated at {formatDateTimeValue(brief.updatedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </Section>

            <Section
              title="Evidence and grounding"
              description="Source-proven roles and the concrete evidence that backed the brief."
            >
              {brief.proofRolesSnapshot.length > 0 ? (
                <div className="space-y-3">
                  {brief.proofRolesSnapshot.map((role, index) => (
                    <div
                      key={`${role.title}-${role.roleId ?? index}`}
                      className="rounded border bg-[var(--background)] p-4"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                            Evidence {index + 1}
                          </p>
                          <h2 className="mt-2 text-base font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                            {role.title}
                          </h2>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                            {formatSourceLabel(role.source)}
                            {role.department ? ` / ${role.department}` : ""}
                            {role.location ? ` / ${role.location}` : ""}
                          </p>
                        </div>
                        <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                          {role.roleId ? <p>{role.roleId}</p> : null}
                          {role.requisitionId ? <p>{role.requisitionId}</p> : null}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Stat label="Source timestamp" value={role.sourceTimestamp ? formatDateTimeValue(role.sourceTimestamp) : "Unknown"} />
                        <Stat label="Observed by Stratum" value={role.observedAt ? formatDateTimeValue(role.observedAt) : "Unknown"} />
                      </div>
                      {role.jobUrl ? (
                        <a
                          href={role.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-xs transition-colors hover:text-[var(--accent)]"
                          style={{ color: "var(--foreground-secondary)" }}
                        >
                          Open posting
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                  No proof roles were saved with this brief.
                </p>
              )}
            </Section>
          </div>

          <div className="space-y-4">
            <Section
              title="Historical context"
              description="How this saved brief sits relative to the current watchlist record, if that link exists."
            >
              <div className="space-y-3">
                <Stat
                  label="Saved brief state"
                  value={`This artifact is ${resultSnapshot.artifactOrigin === "saved" ? "replayed from storage" : "a saved snapshot of a live result"}.`}
                />
                <Stat
                  label="Current monitoring context"
                  value={
                    monitoring
                      ? `${monitoring.latestStateSummary} / ${formatWatchlistScheduleCadenceLabel(monitoring.schedule.cadence)}`
                      : "No watchlist context available"
                  }
                />
                <Stat
                  label="Recent monitoring attempt"
                  value={
                    monitoring?.lastMonitoringAttemptOrigin && monitoring.lastMonitoringAttemptOutcome
                      ? `${formatMonitoringAttemptOriginLabel(monitoring.lastMonitoringAttemptOrigin)} / ${formatMonitoringAttemptOutcomeLabel(monitoring.lastMonitoringAttemptOutcome)}`
                      : "No recent monitoring attempt"
                  }
                />
                {monitoring?.latestNotificationCandidateSummary ? (
                  <Stat label="Recent inbox signal" value={monitoring.latestNotificationCandidateSummary} />
                ) : null}
              </div>
            </Section>

            <Section title="Limits and caveats" description="What this artifact does not prove.">
              <ul className="space-y-3">
                {limitations.map((item, index) => (
                  <li
                    key={`${index}-${item}`}
                    className="rounded border bg-[var(--background)] p-3 text-sm leading-relaxed"
                    style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Quick links" description="Contextual navigation only. No editing controls.">
              <div className="flex flex-wrap gap-2 text-xs">
                {monitoring?.watchlistId ? (
                  <Link
                    href={`/watchlists?watchlistId=${monitoring.watchlistId}${monitoring.entryId ? `&entryId=${monitoring.entryId}` : ""}`}
                    className="rounded border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                  >
                    Open related watchlist
                  </Link>
                ) : null}
                {brief.watchlistEntryId ? (
                  <Link
                    href={`/watchlists?entryId=${brief.watchlistEntryId}`}
                    className="rounded border px-3 py-2 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                  >
                    Open related entry
                  </Link>
                ) : null}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
