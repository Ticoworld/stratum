"use client";

import Link from "next/link";
import { Loader2, RefreshCcw } from "lucide-react";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { formatWatchlistTargetIdentity } from "@/lib/watchlists/identity";
import {
  formatMonitoringAttemptOriginLabel,
  formatMonitoringAttemptOutcomeLabel,
} from "@/lib/watchlists/monitoringEvents";
import {
  buildWatchlistSourceGrounding,
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
}: WatchlistEntryInspectionPanelProps) {
  if (!detail) {
    return (
      <aside className="rounded-[26px] border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
          Selected target
        </p>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
          Select a tracked company to inspect it.
        </p>
      </aside>
    );
  }

  const latestBrief = detail.latestBrief;
  const latestAttempt = detail.latestAttempt;
  const identity = formatWatchlistTargetIdentity(
    detail.entry.requestedQuery,
    detail.monitoring.latestMatchedCompanyName ?? latestBrief?.matchedCompanyName ?? null
  );
  const sourceGrounding = buildWatchlistSourceGrounding({
    requestedQuery: detail.entry.requestedQuery,
    matchedCompanyName: detail.monitoring.latestMatchedCompanyName ?? latestBrief?.matchedCompanyName ?? null,
    atsSourceUsed: detail.monitoring.latestStateAtsSourceUsed ?? detail.monitoring.latestAtsSourceUsed,
  });
  const stateHeadline = formatWatchlistStateHeadline({
    watchlistReadLabel: detail.monitoring.latestStateWatchlistReadLabel,
    resultState: detail.monitoring.latestStateResultState,
    fallback: "No current state",
  });
  const stateSupport = formatWatchlistStateSupportingText({
    resultState: detail.monitoring.latestStateResultState,
    confidence: detail.monitoring.latestStateWatchlistReadConfidence,
  });
  const identityMeta = formatWatchlistMetadataLine([
    sourceGrounding.primary,
    identity.secondary,
    identity.tertiary,
  ]);
  const sourceMeta = formatWatchlistMetadataLine([
    sourceGrounding.secondary,
    sourceGrounding.tertiary,
  ]);
  const recentActivity =
    detail.monitoring.latestNotificationCandidateSummary ??
    (latestAttempt
      ? `${formatMonitoringAttemptOriginLabel(latestAttempt.attemptOrigin)} / ${formatMonitoringAttemptOutcomeLabel(latestAttempt.outcomeStatus)}`
      : "No monitoring attempt yet");

  return (
    <aside className="rounded-[26px] border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
              Selected target
            </p>
            <h3 className="mt-2.5 text-[1.55rem] font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
              {identity.primary}
            </h3>
            {identityMeta ? (
              <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                {identityMeta}
              </p>
            ) : identity.uncertain ? (
              <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                Identity unresolved
              </p>
            ) : null}
          </div>

          <button
            onClick={onRefreshEntry}
            disabled={pendingRefresh}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            {pendingRefresh ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
            Refresh now
          </button>
        </div>

        <section
          className="grid grid-cols-1 gap-5 border-t pt-5 sm:grid-cols-[minmax(0,1fr)_11rem]"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p className="text-[12px] font-medium" style={{ color: "var(--foreground-muted)" }}>
              Current state
            </p>
            <p className="mt-2 text-[1.15rem] font-semibold leading-7 tracking-[-0.02em]" style={{ color: "var(--foreground)" }}>
              {stateHeadline}
            </p>
            <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
              {stateSupport ?? "No saved brief yet"}
            </p>
            <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-muted)" }}>
              {formatWatchlistStateBasisLabel(detail.monitoring.latestStateBasis)}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                Latest brief
              </p>
              <p className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                {formatWatchlistDateTime(detail.monitoring.lastRefreshedAt, "No brief")}
              </p>
            </div>
            <div>
              <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                Last attempt
              </p>
              <p className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                {formatWatchlistDateTime(detail.monitoring.lastMonitoringAttemptAt, "No attempt")}
              </p>
            </div>
          </div>
        </section>

        <section className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--foreground-muted)" }}>
            Source grounding
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-7" style={{ color: "var(--foreground)" }}>
            {sourceGrounding.primary}
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

        <section className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--foreground-muted)" }}>
            Recent activity
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-7" style={{ color: "var(--foreground)" }}>
            {recentActivity}
          </p>
          <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
            {detail.monitoring.lastMonitoringAttemptSummary ?? "No recent monitoring summary yet."}
          </p>
        </section>

        <section className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--foreground-muted)" }}>
            Diff summary
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

        <section className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--foreground-muted)" }}>
            Schedule and actions
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
