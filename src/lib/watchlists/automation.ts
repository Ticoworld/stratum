export interface StratumScheduledAutomationStatus {
  mode: "vercel_cron" | "manual_only";
  alwaysOnActive: boolean;
  label: string;
  summary: string;
}

export function getScheduledAutomationStatus(): StratumScheduledAutomationStatus {
  const runningOnVercel =
    process.env.VERCEL === "1" || process.env.VERCEL === "true" || Boolean(process.env.VERCEL_URL);
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  const vercelTargetEnv = process.env.VERCEL_TARGET_ENV?.trim().toLowerCase();
  const vercelCronActive =
    runningOnVercel &&
    (vercelEnv === "production" || vercelTargetEnv === "production");

  if (vercelCronActive) {
    return {
      mode: "vercel_cron",
      alwaysOnActive: true,
      label: "Scheduled refresh active",
      summary:
        "Companies will be checked automatically based on their schedule.",
    };
  }

  if (runningOnVercel) {
    return {
      mode: "manual_only",
      alwaysOnActive: false,
      label: "Scheduled refresh (manual trigger)",
      summary:
        "This Vercel deployment is not production, so scheduled checks are triggered manually here.",
    };
  }

  return {
    mode: "manual_only",
    alwaysOnActive: false,
    label: "Scheduled refresh (manual trigger)",
    summary:
      "Checks are triggered manually in this environment.",
  };
}

export function getScheduledCronBatchLimit(): number {
  const raw = Number(process.env.STRATUM_SCHEDULED_CRON_LIMIT ?? 25);
  if (!Number.isFinite(raw)) return 25;
  return Math.max(1, Math.min(Math.floor(raw), 100));
}

export function getScheduledCronSecret(): string | null {
  const value = process.env.CRON_SECRET?.trim() || process.env.STRATUM_SCHEDULED_CRON_SECRET?.trim();
  return value || null;
}
