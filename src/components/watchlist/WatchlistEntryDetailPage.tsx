"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  RefreshCcw, 
  ChevronRight, 
  ExternalLink,
  AlertCircle,
  Clock
} from "lucide-react";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import {
  buildWatchlistDisplayIdentity,
  formatWatchlistDateTime,
  formatWatchlistMetadataLine,
  formatWatchlistTrackingState,
} from "@/lib/watchlists/presentation";
import type { WatchlistEntryDetail } from "@/lib/watchlists/repository";
import { Button } from "@/components/ui/Button";
import { Toast, type ToastType } from "@/components/ui/Toast";

interface WatchlistEntryDetailPageProps {
  detail: WatchlistEntryDetail;
  automationStatus: StratumScheduledAutomationStatus;
  canWriteWorkspace: boolean;
  tenantId: string;
}

function isValidationStyleError(value: string | null | undefined): boolean {
  const normalized = (value ?? "").toLowerCase();
  return (
    normalized.includes("company name is required") ||
    normalized.includes("name is required") ||
    normalized.includes("required company details")
  );
}

function formatActionFailureMessage(action: string, subject: string, detail?: string | null): string {
  const base = `We couldn't ${action} ${subject} right now.`;

  if (!detail) return base;
  if (isValidationStyleError(detail)) {
    return `${base} Required company details are missing.`;
  }

  const cleanedDetail = detail.trim().replace(/\.$/, "");
  if (!cleanedDetail) return base;

  return `${base} ${cleanedDetail}`;
}

function formatDetailConfidenceLabel(value: string | null | undefined): string {
  switch (value) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    case "none":
      return "No confidence score";
    default:
      return "Pending";
  }
}

function formatDetailBasisLabel(value: WatchlistEntryDetail["monitoring"]["latestStateBasis"]): string {
  switch (value) {
    case "saved_brief":
      return "Saved brief ready";
    case "latest_attempt_only":
      return "Latest check only";
    case "none":
    default:
      return "First check pending";
  }
}

function formatDetailCoverageLabel(value: string | null | undefined): string {
  switch (value) {
    case "single_matched_provider_only":
      return "Matched source";
    case "matched_provider_zero_observed_roles":
      return "Matched source, no roles";
    case "unsupported_source_pattern":
      return "Source unsupported";
    case "inconclusive_due_to_provider_failure":
      return "Inconclusive";
    case "no_supported_provider_match":
      return "No source match";
    default:
      return "First check pending";
  }
}

function formatDetailAttemptOriginLabel(value: string): string {
  switch (value) {
    case "manual_refresh":
      return "Latest update";
    case "watchlist_rerun":
      return "Watchlist refresh";
    case "scheduled_refresh":
      return "Scheduled check";
    default:
      return value;
  }
}

function formatDetailAttemptOutcomeLabel(value: string): string {
  switch (value) {
    case "saved_brief_created":
      return "Saved brief updated";
    case "completed_without_saved_brief":
      return "Check completed without brief";
    case "reused_cached_result":
      return "Reused cached result";
    case "failed":
      return "Refresh failed";
    default:
      return value;
  }
}

export function WatchlistEntryDetailPage({
  detail,
  automationStatus,
  canWriteWorkspace,
  tenantId,
}: WatchlistEntryDetailPageProps) {
  const router = useRouter();
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [pendingScheduleSave, setPendingScheduleSave] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState(detail.entry.scheduleCadence);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<ToastType>("success");

  const displayIdentity = buildWatchlistDisplayIdentity({
    requestedQuery: detail.entry.requestedQuery,
    matchedCompanyName: detail.monitoring.latestMatchedCompanyName ?? detail.latestBrief?.matchedCompanyName ?? null,
    atsSourceUsed: detail.monitoring.latestStateAtsSourceUsed ?? detail.monitoring.latestAtsSourceUsed,
  });
  const trackingStatus = formatWatchlistTrackingState({
    latestBriefId: detail.latestBrief?.id ?? null,
    latestResultState: detail.monitoring.latestStateResultState,
    latestAtsSourceUsed: detail.monitoring.latestStateAtsSourceUsed ?? detail.monitoring.latestAtsSourceUsed,
    isChecking: pendingRefresh,
  });
  const sourceLabel = trackingStatus.sourceLabel;
  const stateHeadline = trackingStatus.headline;
  const stateLead = trackingStatus.supportingText ?? "";
  const confidenceLabel = formatDetailConfidenceLabel(detail.monitoring.latestStateWatchlistReadConfidence);
  const basisLabel = formatDetailBasisLabel(detail.monitoring.latestStateBasis);
  const coverageLabel = detail.latestBrief?.sourceCoverageCompleteness
    ? formatDetailCoverageLabel(detail.latestBrief.sourceCoverageCompleteness)
    : detail.monitoring.latestStateResultState === "provider_failure"
      ? "Check failed"
      : detail.monitoring.latestStateResultState === "unsupported_ats_or_source_pattern" || detail.monitoring.latestStateResultState === "no_matched_provider_found"
        ? "No supported source found"
        : detail.monitoring.latestStateResultState === "supported_provider_matched_with_observed_openings" || detail.monitoring.latestStateResultState === "supported_provider_matched_with_zero_observed_openings"
          ? "Source confirmed"
          : detail.monitoring.latestStateResultState === "ambiguous_company_match"
            ? "Company match unclear"
            : pendingRefresh
              ? "Checking now"
              : detail.monitoring.latestAtsSourceUsed
                ? "First check pending"
                : "No supported source found";

  const sourceMeta = formatWatchlistMetadataLine([
    displayIdentity.sourceGrounding.secondary,
    displayIdentity.sourceGrounding.tertiary,
  ]);

  const handleRefresh = async () => {
    setPendingRefresh(true);
    try {
      const response = await fetch("/api/analyze-unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: detail.entry.requestedQuery,
          watchlistEntryId: detail.entry.id,
          forceRefresh: true,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setToastMessage(formatActionFailureMessage("refresh", displayIdentity.primary || "this company", data.error));
        setToastType("error");
        return;
      }

      setToastMessage("Refresh completed successfully.");
      setToastType("success");
      router.refresh();
    } catch {
      setToastMessage(formatActionFailureMessage("refresh", displayIdentity.primary || "this company"));
      setToastType("error");
    } finally {
      setPendingRefresh(false);
    }
  };

  const handleSaveSchedule = async () => {
    setPendingScheduleSave(true);
    try {
      const response = await fetch(`/api/watchlists/${detail.monitoring.watchlistId}/entries/${detail.entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleCadence }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setToastMessage(formatActionFailureMessage("update the schedule for", displayIdentity.primary || "this company", data.error));
        setToastType("error");
        return;
      }

      setToastMessage("Schedule updated.");
      setToastType("success");
      router.refresh();
    } catch {
      setToastMessage(formatActionFailureMessage("update the schedule for", displayIdentity.primary || "this company"));
      setToastType("error");
    } finally {
      setPendingScheduleSave(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] pb-16">
      <div className="mx-auto max-w-[1520px] px-5 py-8 lg:px-8 lg:py-10">
        <nav className="mb-6">
          <Link
            href={`/watchlists?watchlistId=${detail.monitoring.watchlistId}`}
            className="group inline-flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-[var(--foreground)]"
            style={{ color: "var(--foreground-muted)" }}
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to watchlist
          </Link>
        </nav>

        <header className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <section className="self-start rounded-[22px] border bg-[var(--surface)] p-5 lg:p-6 xl:col-span-5" style={{ borderColor: "var(--border)" }}>
            <div className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
              Tracked company
            </div>

            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 space-y-3">
                <h1 className="break-words text-[2.2rem] font-semibold tracking-[-0.04em] lg:text-[2.6rem]" style={{ color: "var(--foreground)" }}>
                  {displayIdentity.primary}
                </h1>

                <div className="grid gap-x-4 gap-y-2 text-[12px] text-[var(--foreground-secondary)] sm:grid-cols-3">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                      Watchlist
                    </p>
                    <p className="break-words font-medium" style={{ color: "var(--foreground)" }}>
                      {detail.monitoring.watchlistName}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                      Last checked
                    </p>
                    <p className="font-medium" style={{ color: "var(--foreground)" }}>
                      {formatWatchlistDateTime(detail.monitoring.lastMonitoringAttemptAt, "Never")}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                      Source
                    </p>
                    <p className="break-words font-medium" style={{ color: "var(--foreground)" }}>
                      {sourceLabel}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-3">
                <Button
                  onClick={handleRefresh}
                  disabled={pendingRefresh}
                  isLoading={pendingRefresh}
                  className="h-10 px-4 text-[13px] font-semibold"
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                {detail.monitoring.latestBriefId && (
                  <Link
                    href={`/briefs/${detail.monitoring.latestBriefId}`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-[13px] font-semibold transition-colors hover:bg-[var(--surface-elevated)]"
                    style={{ color: "var(--foreground)" }}
                  >
                    Open saved brief
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section className="self-start rounded-[22px] border bg-[var(--surface)] p-5 lg:p-6 xl:col-span-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                  Current state
                </p>
                <p className="mt-3 text-[1.5rem] font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
                  {stateHeadline}
                </p>
                <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                  {trackingStatus.headline === "Saved brief ready"
                    ? "Saved brief available."
                    : trackingStatus.headline === "Checking now"
                      ? "Live check active."
                      : trackingStatus.headline === "No supported source found"
                        ? "No supported source confirmed yet."
                        : trackingStatus.headline === "Check failed"
                          ? "The last check failed."
                          : "Source confirmed."}
                </p>
              </div>
            </div>

            <p className="mt-3 max-w-[34rem] break-words text-[13px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
              {stateLead}
            </p>

            <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
              <div className="space-y-1">
                <p className="text-[10px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                  Confidence
                </p>
                <p className="break-words text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                  {confidenceLabel}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                  Proof basis
                </p>
                <p className="break-words text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                  {basisLabel}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                  Last checked
                </p>
                <p className="break-words text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                  {formatWatchlistDateTime(detail.monitoring.lastMonitoringAttemptAt, "Never")}
                </p>
              </div>
            </div>
          </section>

          <section className="self-start rounded-[22px] border bg-[var(--surface)] p-5 lg:p-6 xl:col-span-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
              Source and trust
            </p>
            <div className="mt-3 space-y-2">
                <p className="break-words text-[1.2rem] font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
                  {sourceLabel}
                </p>
              {sourceMeta && (
                <p className="break-words text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                  {sourceMeta}
                </p>
              )}
            </div>

            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <div className="space-y-1">
              <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                  Coverage
                </p>
                <p className="break-words text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                  {coverageLabel}
                </p>
              </div>

              {detail.entry.latestAtsSourceUsed && (
                <a
                  href={detail.entry.latestAtsSourceUsed.startsWith("http") ? detail.entry.latestAtsSourceUsed : `https://${detail.entry.latestAtsSourceUsed}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--accent)] hover:underline"
                >
                  Open careers site
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </section>
        </header>

        <section className="mt-4 rounded-[20px] bg-[var(--surface-elevated)] px-4 py-4 lg:px-5 lg:py-4" style={{ color: "var(--foreground-secondary)" }}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                Tracking
              </p>
              <p className="text-[13px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
                {automationStatus.summary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 text-[12px] font-medium" style={{ color: "var(--foreground-muted)" }}>
                <Clock className="h-3.5 w-3.5" />
                {automationStatus.label}
              </span>
              <div className="flex flex-wrap gap-3">
                <label htmlFor="schedule" className="sr-only">
                  Update frequency
                </label>
                <select
                  id="schedule"
                  value={scheduleCadence}
                  onChange={(e) => setScheduleCadence(e.target.value as any)}
                  disabled={!canWriteWorkspace}
                  className="h-10 rounded-xl border bg-[var(--surface)] px-3 text-[13px] font-medium transition-all focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]/35 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  <option value="off">Manual tracking</option>
                  <option value="daily">Daily update</option>
                  <option value="weekly">Weekly update</option>
                </select>

                <Button
                  onClick={handleSaveSchedule}
                  disabled={pendingScheduleSave || !canWriteWorkspace}
                  isLoading={pendingScheduleSave}
                  className="h-10 px-4 text-[13px] font-semibold"
                >
                  Update schedule
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-[11px] leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
            {detail.monitoring.schedule.enabled
              ? detail.monitoring.schedule.dueNow
                ? "Check is due now."
                : detail.monitoring.schedule.nextRunAt
                  ? `Next check: ${formatWatchlistDateTime(detail.monitoring.schedule.nextRunAt, "soon")}`
                  : "Tracking is active."
              : "Automated tracking is disabled."}
          </div>
        </section>

        <div className="mt-6 space-y-6">
            <section className="rounded-[24px] border bg-[var(--surface)] p-6 lg:p-7" style={{ borderColor: "var(--border)" }}>
              <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                Latest brief
              </p>
              {detail.latestBrief ? (
                <div className="mt-4 space-y-4">
                  <p className="max-w-[64ch] text-[15px] leading-7" style={{ color: "var(--foreground)" }}>
                    {detail.latestBrief.watchlistReadSummary || "No saved brief summary yet."}
                  </p>
                  <Link
                    href={`/briefs/${detail.latestBrief.id}`}
                    className="group inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)] hover:text-[color:color-mix(in_srgb,var(--accent) 85%,black)]"
                  >
                    Open saved brief
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed bg-[var(--background)] px-4 py-5" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[13px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
                    No saved brief yet.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-[24px] border bg-[var(--surface)] p-6 lg:p-7" style={{ borderColor: "var(--border)" }}>
              <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                Change since last check
              </p>
              <div className="mt-4 space-y-4">
                <p className="text-[16px] leading-7 font-medium" style={{ color: "var(--foreground)" }}>
                  {detail.diff.comparisonAvailable
                    ? detail.diff.summary
                    : detail.attemptHistory.length > 1
                      ? "No material changes detected since the first check."
                      : "Baseline still forming. No prior check to compare."}
                </p>
                {detail.diff.comparisonStrength === "weak" && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-500/10 bg-amber-50/20 p-4 text-[13px] text-amber-700/90">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="leading-relaxed">
                      Comparison is limited because the source or company identity changed between checks.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border bg-[var(--surface)] overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground-muted)" }}>
                  Recent activity
                </p>
              </div>

              {detail.attemptHistory.length > 0 ? (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {detail.attemptHistory.slice(0, 5).map((attempt) => (
                    <div key={attempt.id} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-[var(--background)]">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--foreground)" }}>
                          {formatDetailAttemptOriginLabel(attempt.attemptOrigin)}
                        </p>
                        <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                          {formatDetailAttemptOutcomeLabel(attempt.outcomeStatus)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-[12px] font-medium" style={{ color: "var(--foreground-muted)" }}>
                        {formatWatchlistDateTime(attempt.createdAt, "Unknown")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-10 text-[13px]" style={{ color: "var(--foreground-secondary)" }}>
                  No checks recorded yet.
                </div>
              )}
            </section>
        </div>
      </div>

      <Toast 
        isVisible={!!toastMessage}
        message={toastMessage}
        type={toastType}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}
