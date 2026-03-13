import { writeWorkerHeartbeat } from "@/lib/deployment/readiness";
import { claimNextReportRun } from "@/lib/reports/claimNextReportRun";
import { executeReportRun } from "@/lib/reports/executeReportRun";

export interface RunWorkerLoopOptions {
  once?: boolean;
  pollIntervalMs?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processNextReportRun(): Promise<boolean> {
  const claimedRun = await claimNextReportRun();

  if (!claimedRun) {
    return false;
  }

  try {
    await executeReportRun(claimedRun);
  } catch (error) {
    console.error(`[worker] Failed report run ${claimedRun.id}:`, error);
  }

  return true;
}

export async function runWorkerLoop(options: RunWorkerLoopOptions = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;

  do {
    await writeWorkerHeartbeat();
    const processed = await processNextReportRun();

    if (options.once) {
      return;
    }

    if (!processed) {
      await sleep(pollIntervalMs);
    }
  } while (true);
}
