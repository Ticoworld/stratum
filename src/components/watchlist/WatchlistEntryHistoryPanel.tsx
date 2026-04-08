"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSourceLabel } from "@/lib/briefs/presentation";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import type { WatchlistEntryDetail } from "@/lib/watchlists/repository";
import {
  buildMonitoringAttemptSummary,
  formatAttemptResultStateLabel,
  formatMonitoringAttemptOriginLabel,
  formatMonitoringAttemptOutcomeLabel,
} from "@/lib/watchlists/monitoringEvents";
import {
  formatNotificationDeliveryModeLabel,
  formatNotificationStatusLabel,
} from "@/lib/watchlists/notifications";
import { formatWatchlistScheduleCadenceLabel } from "@/lib/watchlists/schedules";

interface WatchlistEntryHistoryPanelProps {
  watchlistId: string;
  automationStatus: StratumScheduledAutomationStatus;
  detail: WatchlistEntryDetail;
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

function formatCoverageLabel(value: string): string {
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
    case "none":
      return "None";
    default:
      return value;
  }
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

function formatBriefTag(index: number): string {
  if (index === 0) return "Latest";
  if (index === 1) return "Previous";
  return "Older";
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

function getLatestBriefStatus(detail: WatchlistEntryDetail): string {
  if (!detail.monitoring.latestBriefId) return "No saved brief yet";
  if (
    detail.monitoring.lastMonitoringAttemptAt &&
    !detail.monitoring.lastMonitoringAttemptCreatedSavedBrief
  ) {
    return "Latest saved brief still anchors the monitoring state";
  }
  return "Current latest saved brief";
}

function getLatestMonitoringHeadline(detail: WatchlistEntryDetail): string {
  if (detail.monitoring.latestStateWatchlistReadLabel) {
    return detail.monitoring.latestStateWatchlistReadLabel;
  }

  if (detail.latestAttempt?.outcomeStatus) {
    return formatMonitoringAttemptOutcomeLabel(detail.latestAttempt.outcomeStatus);
  }

  return "No monitoring state yet";
}

function BriefSnapshotCard({
  title,
  emptyMessage,
  brief,
}: {
  title: string;
  emptyMessage: string;
  brief: WatchlistEntryDetail["latestBrief"];
}) {
  return (
    <div
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
        {title}
      </p>
      {brief ? (
        <>
          <p className="mt-3 text-lg font-data leading-snug" style={{ color: "var(--foreground)" }}>
            {brief.watchlistReadLabel}
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
            {brief.watchlistReadSummary}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: "Matched company", value: brief.matchedCompanyName },
              { label: "Result state", value: formatResultStateLabel(brief.resultState) },
              { label: "Read confidence", value: formatConfidenceLabel(brief.watchlistReadConfidence) },
              {
                label: "ATS source used",
                value: brief.atsSourceUsed ? formatSourceLabel(brief.atsSourceUsed) : "No supported ATS source matched",
              },
              { label: "Source coverage", value: formatCoverageLabel(brief.sourceCoverageCompleteness) },
              { label: "Proof-role grounding", value: formatProofGroundingLabel(brief.proofRoleGrounding) },
              { label: "Open roles observed", value: String(brief.jobsObservedCount) },
              { label: "Saved brief", value: formatDateTimeValue(brief.createdAt) ?? "Unknown time" },
            ].map((item) => (
              <div key={`${title}-${item.label}`}>
                <p
                  className="text-[10px] font-data uppercase tracking-[0.22em]"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
            <Link
              href={`/briefs/${brief.id}`}
              className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              Open Saved Brief
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export function WatchlistEntryHistoryPanel({
  watchlistId,
  automationStatus,
  detail,
}: WatchlistEntryHistoryPanelProps) {
  const router = useRouter();
  const hasHistory = detail.history.length > 0;
  const hasAttemptHistory = detail.attemptHistory.length > 0;
  const hasComparison = detail.diff.comparisonAvailable;
  const refreshHref = `/?company=${encodeURIComponent(detail.entry.requestedQuery)}&watchlistId=${watchlistId}&watchlistEntryId=${detail.entry.id}&autorun=1&manualRefresh=1`;
  const scheduleSelectId = `schedule-cadence-${detail.entry.id}`;
  const [scheduleCadence, setScheduleCadence] = useState(detail.entry.scheduleCadence);
  const [pendingScheduleSave, setPendingScheduleSave] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    setScheduleCadence(detail.entry.scheduleCadence);
    setScheduleMessage(null);
    setScheduleError(null);
  }, [detail.entry.id, detail.entry.scheduleCadence]);

  const handleSaveSchedule = async () => {
    setPendingScheduleSave(true);
    setScheduleError(null);
    setScheduleMessage(null);

    try {
      const response = await fetch(`/api/watchlists/${watchlistId}/entries/${detail.entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleCadence }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setScheduleError(data.error ?? "Schedule could not be updated.");
        return;
      }

      setScheduleMessage(
        scheduleCadence === "off"
          ? "Scheduled refresh disabled for this tracked entry."
          : `Scheduled refresh set to ${formatWatchlistScheduleCadenceLabel(scheduleCadence)}. ${automationStatus.alwaysOnActive ? "This entry is now eligible for automatic cron execution when due." : "This entry is now eligible when the scheduled runner or cron entrypoint is invoked."}`
      );
      router.refresh();
    } catch {
      setScheduleError("Schedule could not be updated.");
    } finally {
      setPendingScheduleSave(false);
    }
  };

  return (
    <section
      className="mt-5 rounded border p-5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        borderWidth: "1px",
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p
            className="text-[10px] font-data uppercase tracking-[0.22em]"
            style={{ color: "var(--accent)" }}
          >
            Entry Monitoring
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
            {detail.entry.requestedQuery}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
            Stratum records refresh attempts separately from saved briefs and compares only the saved briefs it
            actually has. {automationStatus.summary} Notifications now surface in Stratum&apos;s in-product inbox only.
            No email, push, or Slack delivery exists yet.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
          <Link
            href={refreshHref}
            className="inline-flex items-center gap-2 rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            Refresh Entry Manually
          </Link>
          {detail.monitoring.latestBriefId && (
            <Link
              href={`/briefs/${detail.monitoring.latestBriefId}`}
              className="inline-flex items-center gap-2 rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              Open Current Latest Brief
            </Link>
          )}
          <Link
            href="/notifications"
            className="inline-flex items-center gap-2 rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            Open Notifications
          </Link>
          <Link
            href={`/watchlists?watchlistId=${watchlistId}`}
            className="inline-flex items-center gap-2 rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            Close Detail
          </Link>
        </div>
      </div>

      <>
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.9fr]">
            <div
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
                Latest Monitoring State
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                {getLatestMonitoringHeadline(detail)}
              </p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                {detail.monitoring.latestStateSummary}
              </p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                Latest saved-brief comparison: {detail.diff.summary}
              </p>
              {detail.monitoring.comparisonWeak && (
                <div
                  className="mt-4 rounded border px-4 py-3 text-sm leading-relaxed"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--accent)",
                    borderWidth: "1px",
                    color: "var(--foreground-secondary)",
                  }}
                >
                  This saved-brief comparison is weak because source or company-match conditions changed between the
                  compared briefs, or at least one compared brief has weaker company-match confidence.
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Latest result state",
                    value: detail.monitoring.latestStateResultState
                      ? formatResultStateLabel(detail.monitoring.latestStateResultState)
                      : detail.monitoring.lastMonitoringAttemptAt
                        ? "No result state captured"
                        : "No monitoring state yet",
                  },
                  {
                    label: "Latest confidence",
                    value: detail.monitoring.latestStateWatchlistReadConfidence
                      ? formatConfidenceLabel(detail.monitoring.latestStateWatchlistReadConfidence)
                      : detail.monitoring.lastMonitoringAttemptAt
                        ? "No read confidence captured"
                        : "No read yet",
                  },
                  {
                    label: "Latest ATS source used",
                    value: detail.monitoring.latestStateAtsSourceUsed
                      ? formatSourceLabel(
                          detail.monitoring.latestStateAtsSourceUsed as
                            | "GREENHOUSE"
                            | "LEVER"
                            | "ASHBY"
                            | "WORKABLE"
                        )
                      : detail.monitoring.lastMonitoringAttemptAt
                        ? "No ATS source captured"
                        : "No supported ATS source matched",
                  },
                  {
                    label: "Last saved refresh",
                    value: formatDateTimeValue(detail.monitoring.lastRefreshedAt) ?? "No saved brief yet",
                  },
                  {
                    label: "Last monitoring attempt",
                    value:
                      formatDateTimeValue(detail.monitoring.lastMonitoringAttemptAt) ?? "No monitoring attempt yet",
                  },
                  {
                    label: "Latest attempt outcome",
                    value: detail.monitoring.lastMonitoringAttemptOutcome
                      ? formatMonitoringAttemptOutcomeLabel(detail.monitoring.lastMonitoringAttemptOutcome)
                      : "No monitoring attempt yet",
                  },
                ].map((item) => (
                  <div
                    key={`${detail.entry.id}-${item.label}`}
                    className="rounded border p-4"
                    style={{
                      background: "var(--surface)",
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
            </div>

            <div
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
                Refresh Lifecycle
              </p>
              <div className="mt-4 space-y-4">
                {[
                  { label: "Latest brief status", value: getLatestBriefStatus(detail) },
                  {
                    label: "Latest brief reference",
                    value: formatDateTimeValue(detail.monitoring.latestBriefCreatedAt) ?? "No saved brief yet",
                  },
                  {
                    label: "Previous brief reference",
                    value: formatDateTimeValue(detail.monitoring.previousBriefCreatedAt) ?? "No previous saved brief",
                  },
                  {
                    label: "Last monitoring attempt",
                    value:
                      formatDateTimeValue(detail.monitoring.lastMonitoringAttemptAt) ?? "No monitoring attempt yet",
                  },
                  {
                    label: "Latest attempt outcome",
                    value: detail.monitoring.lastMonitoringAttemptOutcome
                      ? formatMonitoringAttemptOutcomeLabel(detail.monitoring.lastMonitoringAttemptOutcome)
                      : "No monitoring attempt yet",
                  },
                  {
                    label: "Latest attempt origin",
                    value: detail.monitoring.lastMonitoringAttemptOrigin
                      ? formatMonitoringAttemptOriginLabel(detail.monitoring.lastMonitoringAttemptOrigin)
                      : "No monitoring attempt yet",
                  },
                  {
                    label: "Latest attempt saved brief",
                    value: detail.monitoring.lastMonitoringAttemptAt
                      ? detail.monitoring.lastMonitoringAttemptCreatedSavedBrief
                        ? "Yes"
                        : "No"
                      : "No monitoring attempt yet",
                  },
                  {
                    label: "Current state basis",
                    value: formatMonitoringStateBasisLabel(detail.monitoring.latestStateBasis),
                  },
                  {
                    label: "Comparison strength",
                    value: formatComparisonStrengthLabel(detail.monitoring.comparisonStrength),
                  },
                  {
                    label: "Saved brief count",
                    value: String(detail.monitoring.historyCount),
                  },
                  {
                    label: "Monitoring attempt count",
                    value: String(detail.monitoring.attemptHistoryCount),
                  },
                ].map((item) => (
                  <div key={`${detail.entry.id}-${item.label}`}>
                    <p
                      className="text-[10px] font-data uppercase tracking-[0.22em]"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                      {item.value}
                    </p>
                  </div>
                ))}
                <p className="text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                  Saved brief history and monitoring-attempt history are separate here. A newer failed or unsaved
                  attempt does not masquerade as a saved brief.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <BriefSnapshotCard
              title="Latest Saved Brief"
              emptyMessage="No latest brief is available."
              brief={detail.latestBrief}
            />
            <BriefSnapshotCard
              title="Previous Saved Brief"
              emptyMessage="No previous saved brief is available yet, so no brief-to-brief comparison can be made."
              brief={detail.previousBrief}
            />
          </div>

          <div
            className="mt-5 rounded border p-4"
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
              Scheduled Refresh
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              Scheduling is per tracked entry. Due scheduled refreshes execute through the same monitoring flow as
              manual refreshes, and automation state stays separate from saved-brief evidence.
            </p>

            {(scheduleMessage || scheduleError) && (
              <div
                className="mt-4 rounded border px-4 py-3 text-sm leading-relaxed"
                style={{
                  background: "var(--surface)",
                  borderColor: scheduleError ? "#7f1d1d" : "var(--border)",
                  borderWidth: "1px",
                  color: scheduleError ? "#fca5a5" : "var(--foreground-secondary)",
                }}
              >
                {scheduleError ?? scheduleMessage}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  label: "Schedule",
                  value: formatWatchlistScheduleCadenceLabel(detail.entry.scheduleCadence),
                },
                {
                  label: "Execution mode",
                  value: automationStatus.label,
                },
                {
                  label: "Next scheduled run",
                  value: formatScheduledNextRunValue(
                    detail.entry.scheduleCadence,
                    detail.entry.scheduleNextRunAt
                  ),
                },
                {
                  label: "Due now",
                  value: detail.monitoring.schedule.enabled
                    ? detail.monitoring.schedule.dueNow
                      ? "Yes"
                      : "No"
                    : "Not scheduled",
                },
                {
                  label: "Last scheduled run",
                  value:
                    formatDateTimeValue(detail.monitoring.schedule.lastScheduledRunAt) ??
                    "No scheduled run yet",
                },
                {
                  label: "Last scheduled outcome",
                  value: detail.monitoring.schedule.lastScheduledOutcome
                    ? formatMonitoringAttemptOutcomeLabel(detail.monitoring.schedule.lastScheduledOutcome)
                    : "No scheduled run yet",
                },
                {
                  label: "Last scheduled saved brief",
                  value: detail.monitoring.schedule.lastScheduledRunAt
                    ? detail.monitoring.schedule.lastScheduledCreatedSavedBrief
                      ? "Yes"
                      : "No"
                    : "No scheduled run yet",
                },
                {
                  label: "Scheduled run count",
                  value: String(detail.monitoring.schedule.scheduledRunCount),
                },
                {
                  label: "Consecutive scheduled failures",
                  value: String(detail.monitoring.schedule.consecutiveFailures),
                },
                {
                  label: "Retry backoff",
                  value: detail.monitoring.schedule.retryBackoffActive ? "Active" : "Not active",
                },
              ].map((item) => (
                <div
                  key={`${detail.entry.id}-schedule-${item.label}`}
                  className="rounded border p-4"
                  style={{
                    background: "var(--surface)",
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

            {detail.monitoring.schedule.lastScheduledSummary && (
              <div
                className="mt-4 rounded border px-4 py-3 text-sm leading-relaxed"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderWidth: "1px",
                  color: "var(--foreground-secondary)",
                }}
              >
                Latest scheduled run: {detail.monitoring.schedule.lastScheduledSummary}
              </div>
            )}

            {detail.monitoring.schedule.retryBackoffSummary && (
              <div
                className="mt-4 rounded border px-4 py-3 text-sm leading-relaxed"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--accent)",
                  borderWidth: "1px",
                  color: "var(--foreground-secondary)",
                }}
              >
                {detail.monitoring.schedule.retryBackoffSummary}
              </div>
            )}

            <div
              className="mt-4 rounded border p-4"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                borderWidth: "1px",
              }}
            >
              <p
                className="text-[10px] font-data uppercase tracking-[0.22em]"
                style={{ color: "var(--foreground-muted)" }}
              >
                Configure cadence
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block flex-1" htmlFor={scheduleSelectId}>
                  <span
                    className="text-[10px] font-data uppercase tracking-[0.22em]"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    Cadence
                  </span>
                  <select
                    id={scheduleSelectId}
                    value={scheduleCadence}
                    onChange={(event) => setScheduleCadence(event.target.value as typeof scheduleCadence)}
                    disabled={pendingScheduleSave}
                    className="mt-2 w-full rounded border px-3 py-2 text-sm font-data focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{
                      background: "var(--background)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                  >
                    <option value="off">Off</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <button
                  onClick={handleSaveSchedule}
                  disabled={pendingScheduleSave || scheduleCadence === detail.entry.scheduleCadence}
                  className="inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-data uppercase tracking-[0.18em] transition-all duration-200 disabled:opacity-40"
                  style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                >
                  {pendingScheduleSave ? <span>Saving...</span> : "Save Schedule"}
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                Turning a schedule on makes this entry eligible for the next scheduled run. Notifications from future
                changes appear only in Stratum&apos;s inbox, not through external channels.
              </p>
            </div>
          </div>

          <div
            className="mt-5 rounded border p-4"
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
              Notifications
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              Meaningful monitoring changes for this entry now appear in Stratum&apos;s inbox. These are in-product
              notifications only, not external alerts.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Total notifications",
                  value: String(detail.monitoring.notificationCandidateCount),
                },
                {
                  label: "Unread",
                  value: String(detail.monitoring.unreadNotificationCount),
                },
                {
                  label: "Read",
                  value: String(detail.monitoring.readNotificationCount),
                },
                {
                  label: "Dismissed",
                  value: String(detail.monitoring.dismissedNotificationCount),
                },
                {
                  label: "Latest candidate",
                  value:
                    formatDateTimeValue(detail.monitoring.latestNotificationCandidateAt) ??
                    "No candidate yet",
                },
                {
                  label: "Latest summary",
                  value: detail.monitoring.latestNotificationCandidateSummary ?? "No notification yet",
                },
              ].map((item) => (
                <div
                  key={`${detail.entry.id}-notification-${item.label}`}
                  className="rounded border p-4"
                  style={{
                    background: "var(--surface)",
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

            {detail.notificationCandidates.length > 0 ? (
              <ol className="mt-4 space-y-3">
                {detail.notificationCandidates.slice(0, 4).map((candidate, index) => (
                  <li
                    key={candidate.id}
                    className="rounded border p-4"
                    style={{
                      background: index === 0 ? "var(--surface)" : "var(--background)",
                      borderColor: index === 0 ? "var(--accent)" : "var(--border)",
                      borderWidth: "1px",
                    }}
                  >
                    <p
                      className="text-[10px] font-data uppercase tracking-[0.22em]"
                      style={{ color: index === 0 ? "var(--accent)" : "var(--foreground-muted)" }}
                    >
                      {index === 0 ? "Latest candidate" : "Earlier candidate"}
                    </p>
                    <p className="mt-2 text-sm font-data" style={{ color: "var(--foreground)" }}>
                      {formatDateTimeValue(candidate.createdAt) ?? "Unknown time"}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                      {formatNotificationStatusLabel(candidate.status)} ·{" "}
                      {formatNotificationDeliveryModeLabel(candidate.deliveryMode)}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                      {candidate.summary}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                No meaningful inbox notifications have been captured for this entry yet.
              </p>
            )}
          </div>

          <div
            className="mt-5 rounded border p-4"
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
              Change Summary
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
              {detail.diff.summary}
            </p>

            {detail.diff.comparisonNotes.length > 0 && (
              <div
                className="mt-4 rounded border px-4 py-3 text-sm leading-relaxed"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--accent)",
                  borderWidth: "1px",
                  color: "var(--foreground-secondary)",
                }}
              >
                {detail.diff.comparisonNotes.join(" ")}
              </div>
            )}

            {hasComparison && detail.diff.changes.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                {detail.diff.changes.map((change) => (
                  <div
                    key={`${detail.entry.id}-${change.category}`}
                    className="rounded border p-4"
                    style={{
                      background: "var(--surface)",
                      borderColor: "var(--border)",
                      borderWidth: "1px",
                    }}
                  >
                    <p
                      className="text-[10px] font-data uppercase tracking-[0.22em]"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      {change.label}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                      {change.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : hasComparison ? (
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                No material change categories were triggered between the latest two saved briefs.
              </p>
            ) : (
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                No saved-brief comparison is available yet because this tracked entry does not have two saved briefs.
              </p>
            )}
          </div>

          <div
            className="mt-5 rounded border p-4"
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
              Monitoring Attempts
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              Most recent first. These are refresh attempts, whether or not they created a saved brief.
            </p>
            {hasAttemptHistory ? (
              <ol className="mt-4 space-y-3">
                {detail.attemptHistory.slice(0, 6).map((attempt, index) => (
                  <li
                    key={attempt.id}
                    className="rounded border p-4"
                    style={{
                      background: index === 0 ? "var(--surface)" : "var(--background)",
                      borderColor:
                        attempt.outcomeStatus === "failed"
                          ? "var(--accent)"
                          : index === 0
                            ? "var(--accent)"
                            : "var(--border)",
                      borderWidth: "1px",
                    }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p
                          className="text-[10px] font-data uppercase tracking-[0.22em]"
                          style={{ color: index === 0 ? "var(--accent)" : "var(--foreground-muted)" }}
                        >
                          {index === 0 ? "Latest attempt" : "Earlier attempt"}
                        </p>
                        <p className="mt-2 text-sm font-data" style={{ color: "var(--foreground)" }}>
                          {formatDateTimeValue(attempt.createdAt) ?? "Unknown attempt time"}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                          {buildMonitoringAttemptSummary(attempt)}
                        </p>
                      </div>

                      {attempt.relatedBriefId ? (
                        <Link
                          href={`/briefs/${attempt.relatedBriefId}`}
                          className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-data uppercase tracking-[0.18em] transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                        >
                          Open Related Brief
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        {
                          label: "Outcome",
                          value: formatMonitoringAttemptOutcomeLabel(attempt.outcomeStatus),
                        },
                        {
                          label: "Origin",
                          value: formatMonitoringAttemptOriginLabel(attempt.attemptOrigin),
                        },
                        {
                          label: "Result state",
                          value: attempt.resultState
                            ? formatAttemptResultStateLabel(attempt.resultState)
                            : "No result state captured",
                        },
                        {
                          label: "Matched company",
                          value: attempt.matchedCompanyName ?? "No matched company captured",
                        },
                        {
                          label: "ATS source used",
                          value: attempt.atsSourceUsed
                            ? formatSourceLabel(attempt.atsSourceUsed)
                            : "No supported ATS source matched",
                        },
                        {
                          label: "Read confidence",
                          value: attempt.watchlistReadConfidence
                            ? formatConfidenceLabel(attempt.watchlistReadConfidence)
                            : "No saved read",
                        },
                        {
                          label: "Company match confidence",
                          value: attempt.companyMatchConfidence
                            ? formatConfidenceLabel(attempt.companyMatchConfidence)
                            : "No match confidence captured",
                        },
                        {
                          label: "Error summary",
                          value: attempt.errorSummary ?? "No error recorded",
                        },
                      ].map((item) => (
                        <div key={`${attempt.id}-${item.label}`}>
                          <p
                            className="text-[10px] font-data uppercase tracking-[0.22em]"
                            style={{ color: "var(--foreground-muted)" }}
                          >
                            {item.label}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                No monitoring attempts have been recorded for this tracked entry yet.
              </p>
            )}
          </div>

          <div
            className="mt-5 rounded border p-4"
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
              Saved Brief History
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              Most recent first. Latest and previous power the deterministic change summary above.
            </p>
            {hasHistory ? (
              <ol className="mt-4 space-y-3">
                {detail.history.map((brief, index) => (
                  <li
                    key={brief.id}
                    className="rounded border p-4"
                    style={{
                      background: index < 2 ? "var(--surface)" : "var(--background)",
                      borderColor: index === 0 ? "var(--accent)" : "var(--border)",
                      borderWidth: "1px",
                    }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p
                          className="text-[10px] font-data uppercase tracking-[0.22em]"
                          style={{ color: index === 0 ? "var(--accent)" : "var(--foreground-muted)" }}
                        >
                          {formatBriefTag(index)}
                        </p>
                        <p className="mt-2 text-sm font-data" style={{ color: "var(--foreground)" }}>
                          {formatDateTimeValue(brief.createdAt) ?? "Unknown save time"}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                          {brief.matchedCompanyName}
                        </p>
                      </div>

                      <Link
                        href={`/briefs/${brief.id}`}
                        className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-data uppercase tracking-[0.18em] transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                      >
                        Open Saved Brief
                      </Link>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "Result state", value: formatResultStateLabel(brief.resultState) },
                        { label: "Watchlist read", value: brief.watchlistReadLabel },
                        { label: "Read confidence", value: formatConfidenceLabel(brief.watchlistReadConfidence) },
                        {
                          label: "ATS source used",
                          value: brief.atsSourceUsed ? formatSourceLabel(brief.atsSourceUsed) : "No supported ATS source matched",
                        },
                        { label: "Source coverage", value: formatCoverageLabel(brief.sourceCoverageCompleteness) },
                        { label: "Proof-role grounding", value: formatProofGroundingLabel(brief.proofRoleGrounding) },
                        { label: "Open roles observed", value: String(brief.jobsObservedCount) },
                        {
                          label: "Displayed proof roles",
                          value:
                            brief.proofRolesSnapshot.length > 0
                              ? brief.proofRolesSnapshot.map((role) => role.title).join(", ")
                              : "No displayed proof roles",
                        },
                      ].map((item) => (
                        <div key={`${brief.id}-${item.label}`}>
                          <p
                            className="text-[10px] font-data uppercase tracking-[0.22em]"
                            style={{ color: "var(--foreground-muted)" }}
                          >
                            {item.label}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                No saved brief history is available for this tracked entry yet. Recent monitoring state may still come from
                the attempt log above.
              </p>
            )}
          </div>
      </>
    </section>
  );
}
