"use client";

import Link from "next/link";
import { Loader2, RefreshCcw } from "lucide-react";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import {
  formatMonitoringAttemptOriginLabel,
  formatMonitoringAttemptOutcomeLabel,
} from "@/lib/watchlists/monitoringEvents";
import {
  buildWatchlistDisplayIdentity,
  formatWatchlistCoverageLabel,
  formatWatchlistDateTime,
  formatWatchlistMetadataLine,
  formatWatchlistStateBasisLabel,
  formatWatchlistStateHeadline,
  formatWatchlistStateSupportingText,
} from "@/lib/watchlists/presentation";
import type { WatchlistEntryDetail } from "@/lib/watchlists/repository";
import { formatWatchlistScheduleCadenceLabel } from "@/lib/watchlists/schedules";

interface WatchlistEntryInspectionPanelProps {
  automationStatus: StratumScheduledAutomationStatus;
  detail: WatchlistEntryDetail | null;
  pendingScheduleSave: boolean;
  pendingRefresh: boolean;
  scheduleCadence: WatchlistEntryDetail["entry"]["scheduleCadence"];
  setScheduleCadence: (value: WatchlistEntryDetail["entry"]["scheduleCadence"]) => void;
  onRefreshEntry: () => void;
  onSaveSchedule: () => void;
  onCloseDetail: () => void;
  loadError?: boolean;
}

export function WatchlistEntryInspectionPanel({
  automationStatus,
  detail,
  pendingScheduleSave,
  pendingRefresh,
  scheduleCadence,
  setScheduleCadence,
  onRefreshEntry,
  onSaveSchedule,
  onCloseDetail,
  loadError,
}: WatchlistEntryInspectionPanelProps) {
  if (loadError) {
    return (
      <aside className="rounded-[24px] border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
        <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
          Details unavailable
        </p>
        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
          We couldn't load this company right now. Try again.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-[12px]">
          <button
            onClick={onCloseDetail}
            className="rounded-full border px-3 py-2 transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            Close detail
          </button>
        </div>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="rounded-[24px] border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
        <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
          Company details
        </p>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
          Select a tracked target.
        </p>
      </aside>
    );
  }

  const latestBrief = detail.latestBrief;
  const latestAttempt = detail.latestAttempt;
  const displayIdentity = buildWatchlistDisplayIdentity({
    requestedQuery: detail.entry.requestedQuery,
    matchedCompanyName: detail.monitoring.latestMatchedCompanyName ?? latestBrief?.matchedCompanyName ?? null,
    atsSourceUsed: detail.monitoring.latestStateAtsSourceUsed ?? detail.monitoring.latestAtsSourceUsed,
  });
  const stateHeadline = formatWatchlistStateHeadline({
    watchlistReadLabel: detail.monitoring.latestStateWatchlistReadLabel,
    resultState: detail.monitoring.latestStateResultState,
    fallback: "No signal yet",
  });
  const stateSupport = formatWatchlistStateSupportingText({
    headline: stateHeadline,
    resultState: detail.monitoring.latestStateResultState,
    confidence: detail.monitoring.latestStateWatchlistReadConfidence,
  });
  const sourceMeta = formatWatchlistMetadataLine([
    displayIdentity.sourceGrounding.secondary,
    displayIdentity.sourceGrounding.tertiary,
  ]);
  const recentActivity =
    detail.monitoring.latestNotificationCandidateSummary ??
    (latestAttempt
      ? `${formatMonitoringAttemptOriginLabel(latestAttempt.attemptOrigin)} / ${formatMonitoringAttemptOutcomeLabel(latestAttempt.outcomeStatus)}`
      : "Not checked yet");

  return (
    <aside className="rounded-[24px] border bg-[var(--surface)] p-5 lg:p-6" style={{ borderColor: "var(--border)" }}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
              Details
            </p>
            <h3 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
              {displayIdentity.primary}
            </h3>
            {displayIdentity.meta ? (
              <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                {displayIdentity.meta}
              </p>
            ) : displayIdentity.uncertain ? (
              <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                Company not confirmed
              </p>
            ) : null}
          </div>

          <button
            onClick={onRefreshEntry}
            disabled={pendingRefresh}
            className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[11px] font-medium transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            {pendingRefresh ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
            Refresh
          </button>
        </div>

        <section
          className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_10rem]"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p className="text-[12px] font-medium" style={{ color: "var(--foreground-muted)" }}>
              Signal
            </p>
            <p className="mt-2 text-[1.15rem] font-semibold leading-7 tracking-[-0.02em]" style={{ color: "var(--foreground)" }}>
              {stateHeadline}
            </p>
            {stateSupport ? (
              <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                {stateSupport}
              </p>
            ) : null}
            <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-muted)" }}>
              {formatWatchlistStateBasisLabel(detail.monitoring.latestStateBasis)}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                Latest brief
              </p>
              <p className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                {formatWatchlistDateTime(detail.monitoring.lastRefreshedAt, "No brief yet")}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                Last attempt
              </p>
              <p className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                {formatWatchlistDateTime(detail.monitoring.lastMonitoringAttemptAt, "Not checked yet")}
              </p>
            </div>
          </div>
        </section>

        <section className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[13px] font-medium" style={{ color: "var(--foreground-muted)" }}>
              Careers source
            </p>
          <p className="mt-2 text-[15px] font-semibold leading-7" style={{ color: "var(--foreground)" }}>
            {displayIdentity.sourceGrounding.primary}
          </p>
          {sourceMeta ? (
            <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
              {sourceMeta}
            </p>
          ) : null}
          <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-muted)" }}>
            {latestBrief ? formatWatchlistCoverageLabel(latestBrief.sourceCoverageCompleteness) : "No saved brief yet"}
          </p>
        </section>

        <section className="border-t pt-6" style={{ borderColor: "var(--border)" }}>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
              Latest activity
            </p>
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-7" style={{ color: "var(--foreground)" }}>
            {recentActivity}
          </p>
          <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
            {detail.monitoring.lastMonitoringAttemptSummary ?? "No recent activity"}
          </p>
        </section>

        <section className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
              What changed
            </p>
          <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--foreground)" }}>
            {detail.diff.comparisonAvailable ? detail.diff.summary : "No comparison yet."}
          </p>
          {detail.diff.comparisonStrength === "weak" ? (
            <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
              Weak comparison because the matched company changed or coverage is narrow.
            </p>
          ) : null}
        </section>

        <section className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
              Schedule
            </p>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <select
                value={scheduleCadence}
                onChange={(event) => setScheduleCadence(event.target.value as WatchlistEntryDetail["entry"]["scheduleCadence"])}
                className="h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <button
                onClick={onSaveSchedule}
                disabled={pendingScheduleSave}
                className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm transition-colors disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                {pendingScheduleSave ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save schedule
              </button>
            </div>
            <p className="text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
              {formatWatchlistScheduleCadenceLabel(scheduleCadence)}.{" "}
              {detail.monitoring.schedule.enabled
                ? detail.monitoring.schedule.dueNow
                  ? "This target is due now."
                  : detail.monitoring.schedule.nextRunAt
                    ? `Next eligible refresh ${formatWatchlistDateTime(detail.monitoring.schedule.nextRunAt, "scheduled soon")}.`
                    : "Schedule is active."
                : "Scheduled refresh is off."}
            </p>
            <p className="text-[12px] leading-5" style={{ color: "var(--foreground-muted)" }}>
              {automationStatus.label}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
            <button
              onClick={onCloseDetail}
              className="rounded-full border px-3 py-2 transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              Close detail
            </button>
            {detail.monitoring.latestBriefId ? (
              <Link
                href={`/briefs/${detail.monitoring.latestBriefId}`}
                className="rounded-full border px-3 py-2 transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                Open latest brief
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  );
}
