"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, Loader2, Search } from "lucide-react";
import { AnalysisSkeleton } from "@/components/ui/AnalysisSkeleton";
import { ServiceInterruptionModal } from "@/components/ui/ServiceInterruptionModal";
import { buildStratumLimitations, formatSourceLabel } from "@/lib/briefs/presentation";
import type { Job, JobSourceTimestampType } from "@/lib/api/boards";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import type {
  CompanyResolutionState,
  ConfidenceLevel,
  ProviderAttemptSummary,
  ProofRoleGrounding,
  SourceCoverageCompleteness,
  StratumResult,
  StratumResultState,
} from "@/lib/services/StratumInvestigator";
import {
  formatMonitoringAttemptOriginLabel,
  formatMonitoringAttemptOutcomeLabel,
} from "@/lib/watchlists/monitoringEvents";
import { formatWatchlistScheduleCadenceLabel } from "@/lib/watchlists/schedules";

const EXAMPLE_COMPANIES = ["Airbnb", "Stripe", "XAI"];

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatQueryDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/https?:\/\/|www\.|\/|\.com|\.io|\.jobs|\.app|\.co|\.hr|\.careers|jobs\./i.test(trimmed)) {
    return trimmed;
  }
  return toTitleCase(trimmed);
}

function normalizeLinkKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function formatConfidenceLabel(value: ConfidenceLevel): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "None";
  }
}

function formatCoverageLabel(value: SourceCoverageCompleteness): string {
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
  }
}

function formatProofGroundingLabel(value: ProofRoleGrounding): string {
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

function formatResultStateLabel(value: StratumResultState): string {
  switch (value) {
    case "supported_provider_matched_with_observed_openings":
      return "Supported provider matched with observed openings";
    case "supported_provider_matched_with_zero_observed_openings":
      return "Supported provider matched with zero observed openings";
    case "unsupported_ats_or_source_pattern":
      return "Unsupported ATS or source pattern";
    case "ambiguous_company_match":
      return "Weak or indirect company match";
    case "provider_failure":
      return "Provider failure";
    case "no_matched_provider_found":
      return "No supported provider matched";
  }
}

function formatResolutionStateLabel(value: CompanyResolutionState | undefined): string {
  switch (value) {
    case "direct_confirmed_match":
      return "Direct confirmed match";
    case "alias_confirmed_match":
      return "Alias-confirmed match";
    case "fallback_match":
      return "Fallback token match";
    case "ambiguous_low_confidence_match":
      return "Ambiguous low-confidence match";
    default:
      return "No supported match";
  }
}

function formatAttemptStatusLabel(value: ProviderAttemptSummary["status"] | undefined): string {
  switch (value) {
    case "jobs_found":
      return "Openings found";
    case "zero_jobs":
      return "Matched, zero openings";
    case "not_found":
      return "Not found";
    case "error":
      return "Request failed";
    case "not_applicable":
      return "Not applicable";
    case "not_attempted_after_match":
      return "Not attempted after first match";
    default:
      return "Unknown";
  }
}

function formatSourceTimestampLabel(type: JobSourceTimestampType | null): string {
  switch (type) {
    case "published_at":
      return "Published in source";
    case "updated_at":
      return "Updated in source";
    case "created_at":
      return "Created in source";
    default:
      return "Source timestamp";
  }
}

function formatRoleIdLabel(type: string | null): string {
  switch (type) {
    case "posting_id":
      return "Posting ID";
    case "internal_job_id":
      return "Internal job ID";
    case "job_id":
      return "Job ID";
    case "shortcode":
      return "Shortcode";
    default:
      return "Role ID";
  }
}

function formatDateValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTimeValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatScheduledNextRunValue(
  cadence: string | null | undefined,
  value: string | null | undefined
): string {
  if (cadence === "off" || !value) return "Not scheduled";

  const timestamp = new Date(value).getTime();
  if (!Number.isNaN(timestamp) && timestamp <= Date.now()) {
    return `Due now${formatDateTimeValue(value) ? ` (${formatDateTimeValue(value)})` : ""}`;
  }

  return formatDateTimeValue(value) ?? "Scheduled";
}

function getProviderAttemptSummaries(result: StratumResult): ProviderAttemptSummary[] {
  return Array.isArray(result.providerAttemptSummaries) ? result.providerAttemptSummaries : [];
}

function getCoverageSummary(result: StratumResult): string {
  const sourceLabel = formatSourceLabel(result.apiSource);
  const roleLabel = result.jobs.length === 1 ? "role" : "roles";
  const proofRoleLabel = result.proofRoles.length === 1 ? "proof role" : "proof roles";
  const resolutionExplanation = result.companyResolutionExplanation || "The company resolution is limited.";
  const resultStateExplanation = result.resultStateExplanation || "Stratum could not fully resolve this query.";
  const providerFailureExplanation =
    result.providerFailureExplanation || "Provider request failures should be treated cautiously.";
  const sourceCoverageExplanation = result.sourceCoverageExplanation || "Source coverage is narrow.";

  switch (result.resultState) {
    case "supported_provider_matched_with_observed_openings":
      return `Observed ${result.jobs.length} open ${roleLabel} from ${sourceLabel}. ${resolutionExplanation} ${result.proofRoles.length} ${proofRoleLabel} are shown below to anchor the brief.`;
    case "ambiguous_company_match":
      return `Observed ${result.jobs.length} open ${roleLabel}, but the company match remained weak. ${resolutionExplanation} ${result.proofRoles.length} ${proofRoleLabel} are shown below cautiously.`;
    case "supported_provider_matched_with_zero_observed_openings":
      return `${resultStateExplanation} ${sourceCoverageExplanation}`;
    case "unsupported_ats_or_source_pattern":
      return `${resultStateExplanation} ${sourceCoverageExplanation}`;
    case "provider_failure":
      return `${resultStateExplanation} ${providerFailureExplanation}`;
    case "no_matched_provider_found":
      return `${resultStateExplanation} ${sourceCoverageExplanation}`;
  }
}

function getWatchlistRead(result: StratumResult): {
  title: string;
  body: string;
  paceLabel?: string;
} {
  const paceLabel =
    result.watchlistReadConfidence !== "low" &&
    result.watchlistReadConfidence !== "none" &&
    result.hiringVelocity &&
    result.hiringVelocity !== "-" &&
    result.hiringVelocity !== "Unknown"
      ? result.hiringVelocity
      : undefined;

  return {
    title: result.strategicVerdict,
    body: result.summary,
    paceLabel,
  };
}

function getLimitations(result: StratumResult): string[] {
  if (Array.isArray(result.limitsSnapshot) && result.limitsSnapshot.length > 0) {
    return result.limitsSnapshot;
  }

  return buildStratumLimitations(result);
}

function getProofRolesEmptyMessage(result: StratumResult): string {
  switch (result.resultState) {
    case "supported_provider_matched_with_zero_observed_openings":
      return "The matched provider exposed zero current openings, so there are no proof roles to display.";
    case "unsupported_ats_or_source_pattern":
      return "No proof roles are available because this query points to an unsupported ATS/source pattern.";
    case "provider_failure":
      return "No proof roles are available because provider fetches failed.";
    case "no_matched_provider_found":
      return "No proof roles are available because no supported ATS provider match was confirmed.";
    default:
      return "No proof roles are available for this result.";
  }
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded border overflow-hidden"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        borderWidth: "1px",
      }}
    >
      <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-data uppercase tracking-[0.18em]" style={{ color: "var(--foreground)" }}>
          {title}
        </h2>
        <p className="mt-2 text-sm font-data leading-relaxed" style={{ color: "var(--foreground-muted)" }}>
          {description}
        </p>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function RoleField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-[10px] font-data uppercase tracking-[0.22em]"
        style={{ color: "var(--foreground-muted)" }}
      >
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {value}
      </p>
    </div>
  );
}

function ProofRoleCard({ role, index }: { role: Job; index: number }) {
  const sourceTimestamp = formatDateValue(role.sourceTimestamp);
  const observedAt = formatDateValue(role.observedAt);
  const jobPageLink = role.jobUrl;
  const applyLink = role.applyUrl && role.applyUrl !== role.jobUrl ? role.applyUrl : null;

  return (
    <li
      className="rounded border p-5"
      style={{
        background: "var(--background)",
        borderColor: "var(--border)",
        borderWidth: "1px",
      }}
    >
      <p
        className="text-[10px] font-data uppercase tracking-[0.22em]"
        style={{ color: "var(--foreground-muted)" }}
      >
        Proof Role {index + 1}
      </p>
      <h3 className="mt-2 text-lg font-semibold leading-snug" style={{ color: "var(--foreground)" }}>
        {role.title}
      </h3>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RoleField label="Source" value={formatSourceLabel(role.source)} />
        {role.department && <RoleField label="Department" value={role.department} />}
        {role.location && <RoleField label="Location" value={role.location} />}
        {role.roleId && <RoleField label={formatRoleIdLabel(role.roleIdType)} value={role.roleId} />}
        {role.requisitionId && <RoleField label="Requisition ID" value={role.requisitionId} />}
        {sourceTimestamp && (
          <RoleField label={formatSourceTimestampLabel(role.sourceTimestampType)} value={sourceTimestamp} />
        )}
        {observedAt && <RoleField label="Observed by Stratum" value={observedAt} />}
      </div>

      {(jobPageLink || applyLink) && (
        <div className="mt-5 flex flex-wrap gap-3">
          {jobPageLink && (
            <a
              href={jobPageLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-data uppercase tracking-[0.18em] transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              Open Posting
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {applyLink && (
            <a
              href={applyLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-data uppercase tracking-[0.18em] transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              Apply Link
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function ProviderAttemptCard({ summary }: { summary: ProviderAttemptSummary }) {
  return (
    <li
      className="rounded border p-4"
      style={{
        background: "var(--background)",
        borderColor: "var(--border)",
        borderWidth: "1px",
      }}
    >
      <p
        className="text-[10px] font-data uppercase tracking-[0.22em]"
        style={{ color: "var(--foreground-muted)" }}
      >
        {formatSourceLabel(summary.source)}
      </p>
      <p className="mt-3 text-sm font-data leading-snug" style={{ color: "var(--foreground)" }}>
        {formatAttemptStatusLabel(summary.status)}
      </p>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
        {summary.note}
      </p>
    </li>
  );
}

function getArtifactHeading(result: StratumResult): string {
  if (result.artifactOrigin === "saved") return "Saved brief";
  if (result.manualRefreshRequested && result.briefId) return "Manual refresh saved";
  if (result.manualRefreshRequested && !result.briefId) return "Manual refresh not saved";
  if (result.loadedFromCache) return "Cached live brief";
  if (!result.briefId) return "Live result not saved";
  return "Live result saved";
}

function getArtifactBody(result: StratumResult): string {
  const createdAt = formatDateTimeValue(result.briefCreatedAt);
  const cachedAt = formatDateTimeValue(result.cachedAt);

  if (result.artifactOrigin === "saved") {
    return createdAt
      ? `This is a saved brief artifact created on ${createdAt}. It is being replayed from storage, not recomputed from a fresh fetch.`
      : "This is a saved brief artifact being replayed from storage, not recomputed from a fresh fetch.";
  }

  if (result.loadedFromCache) {
    return cachedAt
      ? `This screen is using a cached live result from ${cachedAt}. It was not recomputed from a fresh fetch in this session.`
      : "This screen is using a cached live result. It was not recomputed from a fresh fetch in this session.";
  }

  if (result.manualRefreshRequested) {
    if (!result.briefId) {
      return "This manual refresh did not create a saved brief. Stratum still recorded the monitoring attempt for this tracked entry.";
    }

    return createdAt
      ? `This manual refresh created saved brief ${result.briefId} on ${createdAt}. Stratum compares it only against other saved briefs for this tracked entry.`
      : `This manual refresh created saved brief ${result.briefId}. Stratum compares it only against other saved briefs for this tracked entry.`;
  }

  if (!result.briefId) {
    return "This live result was not saved as a brief artifact.";
  }

  return createdAt
    ? `This live result was saved as brief ${result.briefId} on ${createdAt}. Reopen the saved artifact without rerunning the analysis.`
    : `This live result was saved as brief ${result.briefId}. Reopen the saved artifact without rerunning the analysis.`;
}

function formatBriefPositionLabel(
  value: "latest" | "previous" | "older" | undefined,
  comparisonAvailable: boolean
): string {
  switch (value) {
    case "latest":
      return comparisonAvailable ? "Current latest saved brief" : "Current latest saved brief";
    case "previous":
      return "Previous saved brief";
    case "older":
      return "Older saved brief";
    default:
      return "Tracked entry state";
  }
}

function formatComparisonStrengthLabel(value: "standard" | "weak" | "unavailable"): string {
  switch (value) {
    case "standard":
      return "Standard comparison";
    case "weak":
      return "Weak comparison";
    default:
      return "No comparison yet";
  }
}

function formatMonitoringStateBasisLabel(value: "saved_brief" | "latest_attempt_only" | "none"): string {
  switch (value) {
    case "saved_brief":
      return "Saved brief";
    case "latest_attempt_only":
      return "Attempt only";
    default:
      return "No monitoring state yet";
  }
}

function getWatchlistMonitoringMessage(result: StratumResult): string {
  const monitoring = result.watchlistMonitoring;
  if (!monitoring) {
    return "This result is not linked to a tracked entry.";
  }

  const lastRefreshedAt = formatDateTimeValue(monitoring.lastRefreshedAt);

  if (result.manualRefreshRequested && !result.briefId) {
    return monitoring.latestStateBasis === "saved_brief"
      ? lastRefreshedAt
        ? `This manual refresh did not create a saved brief, so the tracked entry still points to the last saved brief from ${lastRefreshedAt}.`
        : "This manual refresh did not create a saved brief, so the tracked entry still points to its last saved brief."
      : monitoring.latestStateSummary;
  }

  if (result.artifactOrigin === "saved") {
    if (monitoring.briefPosition === "previous") {
      return "A newer saved brief now exists for this tracked entry. This screen is replaying the previous saved brief only.";
    }

    if (monitoring.briefPosition === "older") {
      return "A newer saved brief now exists for this tracked entry. This screen is replaying an older saved brief only.";
    }

    return monitoring.latestStateBasis === "saved_brief" &&
      monitoring.lastMonitoringAttemptCreatedSavedBrief
      ? "This saved brief still matches the current latest saved brief for this tracked entry."
      : monitoring.latestStateSummary;
  }

  if (result.loadedFromCache) {
    return monitoring.latestStateSummary;
  }

  if (result.manualRefreshRequested && result.briefId) {
    return "This manual refresh created the current latest saved brief for this tracked entry.";
  }

  return monitoring.latestStateSummary;
}

function WatchlistMonitoringCard({
  result,
  automationStatus,
}: {
  result: StratumResult;
  automationStatus: StratumScheduledAutomationStatus;
}) {
  const monitoring = result.watchlistMonitoring;
  if (!monitoring) return null;

  const lastRefreshed = formatDateTimeValue(monitoring.lastRefreshedAt) ?? "No saved brief yet";
  const lastAttempt =
    formatDateTimeValue(monitoring.lastMonitoringAttemptAt) ?? "No monitoring attempt yet";
  const previousBrief = formatDateTimeValue(monitoring.previousBriefCreatedAt) ?? "No previous saved brief";
  const latestBrief = formatDateTimeValue(monitoring.latestBriefCreatedAt) ?? "No saved brief yet";
  const latestSource = monitoring.latestStateAtsSourceUsed
    ? formatSourceLabel(
        monitoring.latestStateAtsSourceUsed as "GREENHOUSE" | "LEVER" | "ASHBY" | "WORKABLE"
      )
    : monitoring.lastMonitoringAttemptAt
      ? "No ATS source captured"
      : "No supported ATS source matched";
  const isViewingCurrentLatest =
    Boolean(result.briefId) &&
    Boolean(monitoring.latestBriefId) &&
    result.briefId === monitoring.latestBriefId;

  return (
    <div
      className="rounded border p-4"
      style={{
        background: "var(--surface)",
        borderColor: monitoring.comparisonWeak ? "var(--accent)" : "var(--border)",
        borderWidth: "1px",
      }}
    >
        <p
          className="text-[10px] font-data uppercase tracking-[0.22em]"
          style={{ color: "var(--accent)" }}
        >
          Entry Monitoring
        </p>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
        {getWatchlistMonitoringMessage(result)}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Tracked query", value: monitoring.requestedQuery },
          {
            label: "Viewing",
            value: result.briefId
              ? formatBriefPositionLabel(monitoring.briefPosition, monitoring.comparisonAvailable)
              : "Live unsaved result",
          },
          { label: "Last saved refresh", value: lastRefreshed },
          { label: "Last monitoring attempt", value: lastAttempt },
          {
            label: "Latest attempt outcome",
            value: monitoring.lastMonitoringAttemptOutcome
              ? formatMonitoringAttemptOutcomeLabel(monitoring.lastMonitoringAttemptOutcome)
              : "No monitoring attempt yet",
          },
          {
            label: "Latest attempt origin",
            value: monitoring.lastMonitoringAttemptOrigin
              ? formatMonitoringAttemptOriginLabel(monitoring.lastMonitoringAttemptOrigin)
              : "No monitoring attempt yet",
          },
          {
            label: "Latest attempt saved brief",
            value: monitoring.lastMonitoringAttemptAt
              ? monitoring.lastMonitoringAttemptCreatedSavedBrief
                ? "Yes"
                : "No"
              : "No monitoring attempt yet",
          },
          {
            label: "Schedule",
            value: formatWatchlistScheduleCadenceLabel(monitoring.schedule.cadence),
          },
          {
            label: "Execution mode",
            value: automationStatus.label,
          },
          {
            label: "Next scheduled run",
            value: formatScheduledNextRunValue(
              monitoring.schedule.cadence,
              monitoring.schedule.nextRunAt
            ),
          },
          {
            label: "Last scheduled run",
            value:
              formatDateTimeValue(monitoring.schedule.lastScheduledRunAt) ?? "No scheduled run yet",
          },
          {
            label: "Last scheduled outcome",
            value: monitoring.schedule.lastScheduledOutcome
              ? formatMonitoringAttemptOutcomeLabel(monitoring.schedule.lastScheduledOutcome)
              : "No scheduled run yet",
          },
          {
            label: "Retry backoff",
            value: monitoring.schedule.retryBackoffActive ? "Active" : "Not active",
          },
          {
            label: "Unread notifications",
            value: String(monitoring.unreadNotificationCount),
          },
          { label: "Previous brief", value: previousBrief },
          { label: "Latest saved brief", value: latestBrief },
          {
            label: "Current state basis",
            value: formatMonitoringStateBasisLabel(monitoring.latestStateBasis),
          },
          {
            label: "Comparison strength",
            value: formatComparisonStrengthLabel(monitoring.comparisonStrength),
          },
          {
            label: "Latest result state",
            value: monitoring.latestStateResultState
              ? formatResultStateLabel(monitoring.latestStateResultState as StratumResultState)
              : monitoring.lastMonitoringAttemptAt
                ? "No result state captured"
                : "No saved brief yet",
          },
          {
            label: "Latest watchlist read",
            value: monitoring.latestStateWatchlistReadLabel
              ? monitoring.latestStateWatchlistReadLabel
              : monitoring.lastMonitoringAttemptAt
                ? "No watchlist read captured"
                : "No saved brief yet",
          },
          {
            label: "Latest confidence",
            value: monitoring.latestStateWatchlistReadConfidence
              ? formatConfidenceLabel(monitoring.latestStateWatchlistReadConfidence as ConfidenceLevel)
              : monitoring.lastMonitoringAttemptAt
                ? "No read confidence captured"
                : "No read yet",
          },
          { label: "Latest ATS source", value: latestSource },
        ].map((item) => (
          <div
            key={`${monitoring.entryId}-${item.label}`}
            className="rounded border p-4"
            style={{
              background: "var(--background)",
              borderColor: "var(--border)",
              borderWidth: "1px",
            }}
          >
            <p
              className="text-[10px] font-data uppercase tracking-[0.22em]"
              style={{ color: "var(--foreground-muted)" }}
            >
              {item.label}
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div
        className="mt-4 rounded border p-4"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
          borderWidth: "1px",
        }}
      >
        <p
          className="text-[10px] font-data uppercase tracking-[0.22em]"
          style={{ color: "var(--foreground-muted)" }}
        >
          Latest monitoring state
        </p>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
          {monitoring.latestStateSummary}
        </p>
        {monitoring.lastMonitoringAttemptSummary && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
            Latest attempt: {monitoring.lastMonitoringAttemptSummary}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
          Latest saved-brief comparison: {monitoring.comparisonSummary}
        </p>
        {monitoring.comparisonWeak && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
            Comparison is weak because the saved briefs being compared have weaker source or match conditions.
          </p>
        )}
        {monitoring.schedule.retryBackoffSummary && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
            {monitoring.schedule.retryBackoffSummary}
          </p>
        )}
        {monitoring.latestNotificationCandidateSummary && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
            Latest inbox notification: {monitoring.latestNotificationCandidateSummary}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
          Stratum compares saved briefs you actually have for this entry. {automationStatus.summary} Notifications now
          live in Stratum&apos;s in-product inbox only. No email, push, or Slack delivery exists yet.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
        <Link
          href={`/watchlists?watchlistId=${monitoring.watchlistId}&entryId=${monitoring.entryId}`}
          className="transition-colors duration-200 hover:text-[var(--accent)]"
          style={{ color: "var(--foreground-secondary)" }}
        >
          Open Entry Detail
        </Link>
        <Link
          href={`/?company=${encodeURIComponent(monitoring.requestedQuery)}&watchlistId=${monitoring.watchlistId}&watchlistEntryId=${monitoring.entryId}&autorun=1&manualRefresh=1`}
          className="transition-colors duration-200 hover:text-[var(--accent)]"
          style={{ color: "var(--foreground-secondary)" }}
        >
          Refresh Entry Manually
        </Link>
        {!isViewingCurrentLatest && monitoring.latestBriefId && (
          <Link
            href={`/briefs/${monitoring.latestBriefId}`}
            className="transition-colors duration-200 hover:text-[var(--accent)]"
            style={{ color: "var(--foreground-secondary)" }}
          >
            Open Current Latest Brief
          </Link>
        )}
      </div>
    </div>
  );
}

interface TruthConsoleProps {
  automationStatus: StratumScheduledAutomationStatus;
  initialResult?: StratumResult | null;
  initialQuery?: string;
  initialWatchlistId?: string | null;
  initialWatchlistEntryId?: string | null;
  initialManualRefresh?: boolean;
  autoRun?: boolean;
}

export function TruthConsole({
  automationStatus,
  initialResult = null,
  initialQuery = "",
  initialWatchlistId = null,
  initialWatchlistEntryId = null,
  initialManualRefresh = false,
  autoRun = false,
}: TruthConsoleProps) {
  const [companyName, setCompanyName] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StratumResult | null>(initialResult);
  const [serviceInterruption, setServiceInterruption] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ title?: string; message?: string } | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [watchlistFeedback, setWatchlistFeedback] = useState<string | null>(null);
  const [linkedWatchlistEntryId, setLinkedWatchlistEntryId] = useState<string | null>(
    initialResult?.watchlistEntryId ?? initialWatchlistEntryId
  );
  const [linkedWatchlistId, setLinkedWatchlistId] = useState<string | null>(
    initialResult?.watchlistId ?? initialWatchlistId
  );
  const [linkedWatchlistName, setLinkedWatchlistName] = useState<string | null>(
    initialResult?.watchlistName ?? null
  );
  const [linkedWatchlistQuery, setLinkedWatchlistQuery] = useState<string>(
    initialResult?.companyName?.trim() || initialQuery.trim()
  );
  const hasAutoRunRef = useRef(false);

  const fetchWithRetry = async (url: string, init: RequestInit, maxAttempts = 3): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fetch(url, init);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          throw lastError;
        }
      }
    }
    throw lastError;
  };

  const handleAnalyze = async (
    overrideCompany?: string,
    options?: {
      forceRefresh?: boolean;
    }
  ) => {
    const name = (overrideCompany ?? companyName).trim();
    if (!name) return;
    const shouldLinkToTrackedEntry =
      Boolean(linkedWatchlistEntryId) &&
      normalizeLinkKey(name) === normalizeLinkKey(linkedWatchlistQuery);
    const forceRefresh =
      options?.forceRefresh ?? shouldLinkToTrackedEntry;

    if (overrideCompany) setCompanyName(overrideCompany);
    setLoading(true);
    setServiceInterruption(false);
    setErrorInfo(null);
    setWatchlistFeedback(null);
    setResult(null);

    try {
      const response = await fetchWithRetry(
        "/api/analyze-unified",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: name,
            watchlistEntryId: shouldLinkToTrackedEntry ? linkedWatchlistEntryId : undefined,
            forceRefresh: shouldLinkToTrackedEntry ? forceRefresh : false,
          }),
        },
        3
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 429) {
          setErrorInfo({
            title: "Rate Limit",
            message: data.error ?? "Too many requests. Please wait a minute and try again.",
          });
        } else {
          setErrorInfo({
            title: "Brief Unavailable",
            message: data.error ?? "The watchlist brief could not be generated right now.",
          });
        }
        setServiceInterruption(true);
        return;
      }

      setResult(data.data);
    } catch {
      setErrorInfo({
        title: "Brief Unavailable",
        message: "The watchlist brief could not be generated right now.",
      });
      setServiceInterruption(true);
    } finally {
      setLoading(false);
    }
  };
  const handleAnalyzeRef = useRef(handleAnalyze);
  handleAnalyzeRef.current = handleAnalyze;

  useEffect(() => {
    if (!result?.watchlistEntryId) return;

    setLinkedWatchlistEntryId(result.watchlistEntryId);
    if (result.watchlistId) {
      setLinkedWatchlistId(result.watchlistId);
    }
    if (result.watchlistName) {
      setLinkedWatchlistName(result.watchlistName);
    }
    setLinkedWatchlistQuery(result.watchlistMonitoring?.requestedQuery ?? result.companyName);
  }, [result]);

  useEffect(() => {
    if (initialQuery.trim() && !companyName.trim()) {
      setCompanyName(initialQuery.trim());
    }
  }, [initialQuery, companyName]);

  useEffect(() => {
    if (!autoRun || hasAutoRunRef.current || initialResult || !initialQuery.trim()) return;

    hasAutoRunRef.current = true;
    void handleAnalyzeRef.current(initialQuery.trim(), {
      forceRefresh: initialManualRefresh && Boolean(initialWatchlistEntryId),
    });
  }, [autoRun, initialManualRefresh, initialResult, initialQuery, initialWatchlistEntryId]);

  const handleReconnect = () => {
    setServiceInterruption(false);
    if (companyName.trim()) handleAnalyze();
  };

  const handleReset = () => {
    setCompanyName("");
    setResult(null);
    setServiceInterruption(false);
    setErrorInfo(null);
    setWatchlistFeedback(null);
    setLinkedWatchlistEntryId(null);
    setLinkedWatchlistId(null);
    setLinkedWatchlistName(null);
    setLinkedWatchlistQuery("");
  };

  const handleAddToWatchlist = async () => {
    if (!result?.briefId || watchlistBusy) return;

    setWatchlistBusy(true);
    setWatchlistFeedback(null);

    try {
      const response = await fetch("/api/watchlists/default/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedQuery: result.companyName,
          briefId: result.briefId,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setWatchlistFeedback(data.error ?? "This brief could not be added to the default watchlist.");
        return;
      }

      const watchlist = data.data.watchlist;
      const entry = data.data.entry;

      setLinkedWatchlistEntryId(entry.id);
      setLinkedWatchlistId(watchlist.id);
      setLinkedWatchlistName(watchlist.name);
      setLinkedWatchlistQuery(entry.requestedQuery);
      setResult((current) =>
        current
          ? {
              ...current,
              watchlistEntryId: entry.id,
              watchlistId: watchlist.id,
              watchlistName: watchlist.name,
            }
          : current
      );
      setWatchlistFeedback(`Tracked in ${watchlist.name}.`);
    } catch {
      setWatchlistFeedback("This brief could not be added to the default watchlist.");
    } finally {
      setWatchlistBusy(false);
    }
  };

  const displayCompany = result ? formatQueryDisplay(result.companyName) : "";
  const matchedCompanyDisplay = result?.matchedCompanyName?.trim() || result?.matchedAs?.trim() || displayCompany;
  const watchlistRead = result ? getWatchlistRead(result) : null;
  const limitations = result ? getLimitations(result) : [];
  const providerAttemptSummaries = result ? getProviderAttemptSummaries(result) : [];
  const activeWatchlistId = result?.watchlistId ?? linkedWatchlistId;
  const activeWatchlistName = result?.watchlistName ?? linkedWatchlistName;
  const activeWatchlistEntryId = result?.watchlistEntryId ?? linkedWatchlistEntryId;
  const watchlistMonitoring = result?.watchlistMonitoring ?? null;
  const willRefreshTrackedEntry =
    Boolean(linkedWatchlistEntryId) &&
    normalizeLinkKey(companyName) === normalizeLinkKey(linkedWatchlistQuery);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <header
        className="shrink-0 border-b"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          borderWidth: "1px",
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p
              className="text-[10px] font-data uppercase tracking-[0.24em]"
              style={{ color: "var(--accent)" }}
            >
              STRATUM
            </p>
            <h1
              className="mt-2 text-lg font-semibold tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              Company Watchlist Brief
            </h1>
            <p
              className="mt-2 max-w-2xl text-sm leading-relaxed"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Observed ATS hiring signals for investors, founders, and corp dev or strategy
              operators. Narrow, incomplete, and external only.
            </p>
            {willRefreshTrackedEntry && (
              <p
                className="mt-2 max-w-2xl text-sm leading-relaxed"
                style={{ color: "var(--foreground-secondary)" }}
              >
                Manual refresh only for this tracked entry. Building again creates a new point-in-time brief and
                compares it only against saved briefs already attached to that entry.
              </p>
            )}
          </div>

          <div className="w-full max-w-xl">
            <label
              htmlFor="company-search"
              className="mb-2 block text-[10px] font-data uppercase tracking-[0.24em]"
              style={{ color: "var(--foreground-muted)" }}
            >
              Company to watch
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--foreground-muted)" }}
                />
                <input
                  id="company-search"
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleAnalyze()}
                  placeholder="Enter a company name (e.g. Airbnb, Stripe)"
                  disabled={loading}
                  aria-label="Company name to analyze"
                  className="w-full rounded border py-2 pl-9 pr-4 text-sm font-data transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
                  style={{
                    background: "var(--background)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
              <Link
                href="/notifications"
                className="flex shrink-0 items-center gap-2 rounded border px-4 py-2 text-sm font-data transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                style={{
                  background: "var(--background)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-secondary)",
                }}
              >
                Notifications
              </Link>
              <Link
                href="/watchlists"
                className="flex shrink-0 items-center gap-2 rounded border px-4 py-2 text-sm font-data transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                style={{
                  background: "var(--background)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-secondary)",
                }}
              >
                Watchlists
              </Link>
              <button
                onClick={() => handleAnalyze()}
                disabled={loading || !companyName.trim()}
                aria-busy={loading}
                aria-label={loading ? "Building brief" : willRefreshTrackedEntry ? "Refresh entry" : "Build brief"}
                className="flex shrink-0 items-center gap-2 rounded px-4 py-2 text-sm font-data font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: "var(--accent)",
                  color: "white",
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building...
                  </>
                ) : (
                  willRefreshTrackedEntry ? "Refresh Entry" : "Build Brief"
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading && <AnalysisSkeleton />}

        {result && !loading && (
          <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto max-w-6xl space-y-4 pb-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-data" style={{ color: "var(--foreground-muted)" }}>
                    Watchlist brief for
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                    {displayCompany}
                  </h2>
                </div>
                <button
                  onClick={handleReset}
                  className="flex shrink-0 items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-data uppercase tracking-[0.18em] transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  style={{
                    color: "var(--foreground-muted)",
                    borderColor: "var(--border)",
                  }}
                >
                  <ArrowLeft className="h-3 w-3" />
                  New Search
                </button>
              </div>

              {watchlistMonitoring && (
                <WatchlistMonitoringCard
                  result={result}
                  automationStatus={automationStatus}
                />
              )}

              {result.briefId && (
                <div
                  className="rounded border p-4"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    borderWidth: "1px",
                  }}
                >
                  <p
                    className="text-[10px] font-data uppercase tracking-[0.22em]"
                    style={{ color: "var(--accent)" }}
                  >
                    {getArtifactHeading(result)}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                    {getArtifactBody(result)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
                    <span style={{ color: "var(--foreground-muted)" }}>Brief ID: {result.briefId}</span>
                    {result.briefCreatedAt && (
                      <span style={{ color: "var(--foreground-muted)" }}>
                        Saved: {formatDateTimeValue(result.briefCreatedAt)}
                      </span>
                    )}
                    {result.briefUpdatedAt && result.briefUpdatedAt !== result.briefCreatedAt && (
                      <span style={{ color: "var(--foreground-muted)" }}>
                        Updated: {formatDateTimeValue(result.briefUpdatedAt)}
                      </span>
                    )}
                    {result.artifactOrigin === "live" && (
                      <a
                        href={`/briefs/${result.briefId}`}
                        className="transition-colors duration-200 hover:text-[var(--accent)]"
                        style={{ color: "var(--foreground-secondary)" }}
                      >
                        Open Saved Brief
                      </a>
                    )}
                    {activeWatchlistId && activeWatchlistEntryId ? (
                      <Link
                        href={`/watchlists?watchlistId=${activeWatchlistId}&entryId=${activeWatchlistEntryId}`}
                        className="transition-colors duration-200 hover:text-[var(--accent)]"
                        style={{ color: "var(--foreground-secondary)" }}
                      >
                        Open Entry Detail
                      </Link>
                    ) : activeWatchlistId ? (
                      <Link
                        href={`/watchlists?watchlistId=${activeWatchlistId}`}
                        className="transition-colors duration-200 hover:text-[var(--accent)]"
                        style={{ color: "var(--foreground-secondary)" }}
                      >
                        Open {activeWatchlistName ?? "Watchlist"}
                      </Link>
                    ) : (
                      <button
                        onClick={handleAddToWatchlist}
                        disabled={watchlistBusy}
                        className="transition-colors duration-200 hover:text-[var(--accent)] disabled:opacity-40"
                        style={{ color: "var(--foreground-secondary)" }}
                      >
                        {watchlistBusy ? "Adding to watchlist..." : "Add To Default Watchlist"}
                      </button>
                    )}
                  </div>
                  {watchlistFeedback && (
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                      {watchlistFeedback}
                    </p>
                  )}
                </div>
              )}

              <SectionCard
                title="Company Match & Coverage"
                description="Observed facts, match strength, and source limits."
              >
                <p className="text-base font-data leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                  {getCoverageSummary(result)}
                </p>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[ 
                    {
                      label: "Requested query",
                      value: displayCompany,
                    },
                    {
                      label: "Matched company",
                      value: matchedCompanyDisplay,
                    },
                    {
                      label: "Result state",
                      value: formatResultStateLabel(result.resultState),
                      note: result.resultStateExplanation,
                    },
                    {
                      label: "Resolution path",
                      value: formatResolutionStateLabel(result.companyResolutionState),
                      note: result.companyResolutionExplanation,
                    },
                    {
                      label: "Match confidence",
                      value: formatConfidenceLabel(result.companyMatchConfidence),
                      note: result.companyMatchExplanation,
                    },
                    {
                      label: "Source coverage",
                      value: formatCoverageLabel(result.sourceCoverageCompleteness),
                      note: result.sourceCoverageExplanation,
                    },
                    {
                      label: "ATS source used",
                      value: formatSourceLabel(result.apiSource),
                      note:
                        result.sourceInputMode === "supported_source_input" && result.requestedSourceHint
                          ? "This query specified a supported source directly, so Stratum stayed on that source only."
                          : undefined,
                    },
                    {
                      label: "Provider failures",
                      value: String(result.providerFailures),
                      note: result.providerFailureExplanation,
                    },
                    {
                      label: "Open roles observed",
                      value: String(result.jobs.length),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded border p-4"
                      style={{
                        background: "var(--background)",
                        borderColor: "var(--border)",
                        borderWidth: "1px",
                      }}
                    >
                      <p
                        className="text-[10px] font-data uppercase tracking-[0.22em]"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        {item.label}
                      </p>
                      <p
                        className="mt-3 text-lg font-data leading-snug"
                        style={{ color: "var(--foreground)" }}
                      >
                        {item.value}
                      </p>
                      {"note" in item && item.note ? (
                        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                          {item.note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {providerAttemptSummaries.length > 0 && (
                  <div className="mt-5">
                    <p
                      className="text-[10px] font-data uppercase tracking-[0.22em]"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      Provider attempt detail
                    </p>
                    <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {providerAttemptSummaries.map((summary) => (
                        <ProviderAttemptCard key={summary.source} summary={summary} />
                      ))}
                    </ol>
                  </div>
                )}
              </SectionCard>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.3fr]">
              <SectionCard
                title="Watchlist Read"
                description="A short operator-facing read from the displayed roles only."
              >
                  <p
                    className="text-2xl font-semibold tracking-tight"
                    style={{
                      color:
                        result.watchlistReadConfidence === "none"
                          ? "var(--foreground-secondary)"
                          : "var(--foreground)",
                    }}
                  >
                    {watchlistRead?.title}
                  </p>
                  <p
                    className="mt-4 text-base leading-relaxed"
                    style={{ color: "var(--foreground-secondary)" }}
                  >
                    {watchlistRead?.body}
                  </p>

                  <div
                    className="mt-5 rounded border p-4"
                    style={{
                      background: "var(--background)",
                      borderColor: "var(--border)",
                      borderWidth: "1px",
                    }}
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p
                          className="text-[10px] font-data uppercase tracking-[0.22em]"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Read confidence
                        </p>
                        <p className="mt-2 text-sm font-data" style={{ color: "var(--foreground)" }}>
                          {formatConfidenceLabel(result.watchlistReadConfidence)}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                          {result.watchlistReadExplanation}
                        </p>
                      </div>
                      <div>
                        <p
                          className="text-[10px] font-data uppercase tracking-[0.22em]"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          Grounding
                        </p>
                        <p className="mt-2 text-sm font-data" style={{ color: "var(--foreground)" }}>
                          {formatProofGroundingLabel(result.proofRoleGrounding)}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                          {result.proofRoleGroundingExplanation}
                        </p>
                      </div>
                    </div>
                    {watchlistRead?.paceLabel && (
                      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                        Secondary pace signal: observed hiring pace looks {watchlistRead.paceLabel}.
                      </p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Proof Roles"
                  description="Displayed roles are the evidence objects backing this brief."
                >
                  <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                    {result.proofRoleGroundingExplanation}
                  </p>
                  {result.proofRoles.length > 0 ? (
                    <ol className="space-y-3">
                      {result.proofRoles.map((role, index) => (
                        <ProofRoleCard key={`${role.source}-${role.roleId ?? role.title}-${index}`} role={role} index={index} />
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                      {getProofRolesEmptyMessage(result)}
                    </p>
                  )}
                </SectionCard>
              </div>

              <SectionCard
                title="Limits & Caveats"
                description="What this screen does not prove."
              >
                <ul className="space-y-3">
                  {limitations.map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="rounded border p-4 text-sm leading-relaxed"
                      style={{
                        background: "var(--background)",
                        borderColor: "var(--border)",
                        borderWidth: "1px",
                        color: "var(--foreground-secondary)",
                      }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-8 px-6 py-12 text-center">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                  Company Watchlist Brief
                </h2>
                <p
                  className="mx-auto mt-4 max-w-2xl text-base leading-relaxed"
                  style={{ color: "var(--foreground-secondary)" }}
                >
                  Build a short watchlist brief from observed ATS openings on supported sources like Ashby,
                  Greenhouse, Lever, and Workable. Made for investors, founders, and corp dev or strategy operators.
                  Stratum does not claim full company coverage.
                </p>
              </div>

              <div
                className="w-full rounded border p-5"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderWidth: "1px",
                }}
              >
                <p className="text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                  Search for a company to see a four-part brief: Company Match & Coverage, Watchlist Read, Proof
                  Roles, and Limits & Caveats.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3">
                <p
                  className="text-[10px] font-data uppercase tracking-[0.24em]"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  Try one
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLE_COMPANIES.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleAnalyze(name)}
                      className="rounded border px-4 py-2 text-sm font-data transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      style={{
                        background: "var(--surface)",
                        borderColor: "var(--border)",
                        color: "var(--foreground-secondary)",
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {serviceInterruption && (
        <ServiceInterruptionModal
          onReconnect={handleReconnect}
          onClose={() => {
            setServiceInterruption(false);
            setErrorInfo(null);
          }}
          title={errorInfo?.title}
          message={errorInfo?.message}
        />
      )}
    </div>
  );
}
