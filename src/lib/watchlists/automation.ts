export interface StratumScheduledAutomationStatus {
  mode: "vercel_cron" | "manual_only";
  alwaysOnActive: boolean;
  label: string;
  summary: string;
}

export function getScheduledAutomationStatus(): StratumScheduledAutomationStatus {
  const runningOnVercel =
    process.env.VERCEL === "1" || process.env.VERCEL === "true" || Boolean(process.env.VERCEL_URL);

  if (runningOnVercel) {
    return {
      mode: "vercel_cron",
      alwaysOnActive: true,
      label: "Automatic execution active",
      summary:
        "Automatic scheduled execution is active through the deployment cron entrypoint. The manual runner remains available for explicit reruns.",
    };
  }

  return {
    mode: "manual_only",
    alwaysOnActive: false,
    label: "Automatic execution not active here",
    summary:
      "Automatic scheduled execution is wired for cron-enabled deployments. In this environment, due entries still require invoking the scheduled runner route explicitly.",
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
