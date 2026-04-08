import {
  buildMonitoringAttemptSummary,
  didMonitoringAttemptCreateSavedBrief,
  type StratumMonitoringAttemptOutcome,
  type WatchlistMonitoringAttemptHistoryItem,
} from "@/lib/watchlists/monitoringEvents";

export type StratumWatchlistScheduleCadence = "off" | "daily" | "weekly";
export const SCHEDULED_REFRESH_LEASE_MINUTES = 15;

export interface WatchlistEntryScheduleSnapshot {
  cadence: StratumWatchlistScheduleCadence;
  enabled: boolean;
  nextRunAt: string | null;
  dueNow: boolean;
  leaseActive: boolean;
  leaseExpiresAt: string | null;
  hasScheduledRun: boolean;
  lastScheduledRunAt: string | null;
  lastScheduledOutcome: StratumMonitoringAttemptOutcome | null;
  lastScheduledCreatedSavedBrief: boolean;
  lastScheduledBriefId: string | null;
  lastScheduledResultState: string | null;
  lastScheduledErrorSummary: string | null;
  lastScheduledSummary: string | null;
  scheduledRunCount: number;
  consecutiveFailures: number;
  retryBackoffActive: boolean;
  retryBackoffSummary: string | null;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function isWatchlistScheduleEnabled(
  cadence: StratumWatchlistScheduleCadence | null | undefined
): cadence is Exclude<StratumWatchlistScheduleCadence, "off"> {
  return cadence === "daily" || cadence === "weekly";
}

export function formatWatchlistScheduleCadenceLabel(
  cadence: StratumWatchlistScheduleCadence
): string {
  switch (cadence) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    default:
      return "Off";
  }
}

export function computeNextWatchlistScheduleRunAt(
  cadence: StratumWatchlistScheduleCadence,
  from: Date
): Date | null {
  if (!isWatchlistScheduleEnabled(cadence)) return null;

  const nextRunAt = new Date(from);
  if (cadence === "daily") {
    nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 1);
    return nextRunAt;
  }

  nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 7);
  return nextRunAt;
}

export function computeScheduledRetryBackoffMinutes(consecutiveFailures: number): number {
  if (consecutiveFailures <= 1) return 30;
  if (consecutiveFailures === 2) return 120;
  if (consecutiveFailures === 3) return 360;
  return 1440;
}

export function computeScheduledFailureRetryAt(
  cadence: StratumWatchlistScheduleCadence,
  consecutiveFailures: number,
  from: Date
): Date | null {
  if (!isWatchlistScheduleEnabled(cadence)) return null;

  const baseRunAt = computeNextWatchlistScheduleRunAt(cadence, from);
  if (!baseRunAt) return null;

  const retryRunAt = new Date(from);
  retryRunAt.setUTCMinutes(
    retryRunAt.getUTCMinutes() + computeScheduledRetryBackoffMinutes(consecutiveFailures)
  );

  return retryRunAt.getTime() < baseRunAt.getTime() ? retryRunAt : baseRunAt;
}

export function computeScheduledLeaseExpiresAt(from: Date): Date {
  const leaseExpiresAt = new Date(from);
  leaseExpiresAt.setUTCMinutes(leaseExpiresAt.getUTCMinutes() + SCHEDULED_REFRESH_LEASE_MINUTES);
  return leaseExpiresAt;
}

export function buildWatchlistEntryScheduleSnapshot(args: {
  cadence: StratumWatchlistScheduleCadence;
  nextRunAt: string | null;
  consecutiveFailures: number;
  leaseExpiresAt: string | null;
  attemptHistory: WatchlistMonitoringAttemptHistoryItem[];
  now?: Date;
}): WatchlistEntryScheduleSnapshot {
  const now = args.now ?? new Date();
  const scheduledAttempts = args.attemptHistory.filter(
    (attempt) => attempt.attemptOrigin === "scheduled_refresh"
  );
  const latestScheduledAttempt = scheduledAttempts[0] ?? null;
  const nextRunAt = toIsoString(args.nextRunAt);
  const nextRunTimestamp = nextRunAt ? new Date(nextRunAt).getTime() : null;
  const leaseExpiresAt = toIsoString(args.leaseExpiresAt);
  const leaseTimestamp = leaseExpiresAt ? new Date(leaseExpiresAt).getTime() : null;
  const leaseActive =
    leaseTimestamp !== null &&
    !Number.isNaN(leaseTimestamp) &&
    leaseTimestamp > now.getTime();
  const retryBackoffActive = args.consecutiveFailures > 0 && isWatchlistScheduleEnabled(args.cadence);
  const retryBackoffSummary =
    retryBackoffActive && nextRunAt
      ? `Retry backoff is active after ${args.consecutiveFailures} consecutive scheduled failure${args.consecutiveFailures === 1 ? "" : "s"}. The next retry becomes eligible at ${nextRunAt}.`
      : null;

  return {
    cadence: args.cadence,
    enabled: isWatchlistScheduleEnabled(args.cadence),
    nextRunAt,
    dueNow:
      Boolean(nextRunAt) &&
      nextRunTimestamp !== null &&
      !Number.isNaN(nextRunTimestamp) &&
      nextRunTimestamp <= now.getTime() &&
      !leaseActive,
    leaseActive,
    leaseExpiresAt,
    hasScheduledRun: Boolean(latestScheduledAttempt),
    lastScheduledRunAt: latestScheduledAttempt?.createdAt ?? null,
    lastScheduledOutcome: latestScheduledAttempt?.outcomeStatus ?? null,
    lastScheduledCreatedSavedBrief: didMonitoringAttemptCreateSavedBrief(latestScheduledAttempt),
    lastScheduledBriefId: latestScheduledAttempt?.relatedBriefId ?? null,
    lastScheduledResultState: latestScheduledAttempt?.resultState ?? null,
    lastScheduledErrorSummary: latestScheduledAttempt?.errorSummary ?? null,
    lastScheduledSummary: latestScheduledAttempt
      ? buildMonitoringAttemptSummary(latestScheduledAttempt)
      : null,
    scheduledRunCount: scheduledAttempts.length,
    consecutiveFailures: args.consecutiveFailures,
    retryBackoffActive,
    retryBackoffSummary,
  };
}
