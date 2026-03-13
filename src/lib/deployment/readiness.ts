import os from "os";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db/client";
import { workerHeartbeats } from "@/db/schema";
import {
  ENV_CONTRACT,
  getDatabaseEnvStatus,
  getEnvContractStatus,
  getObjectStorageEnvStatus,
  validateRuntimeEnv,
} from "@/lib/env";

const REPORT_RUN_WORKER_NAME = "report-runs";
const WORKER_HEARTBEAT_STALE_AFTER_MS = 60_000;

export interface WorkerHeartbeatStatus {
  workerName: string;
  status: "running" | "stale" | "missing";
  lastHeartbeatAt: string | null;
  staleAfterMs: number;
}

export interface DeploymentReadinessSummary {
  webApp: {
    status: "up";
  };
  sharedInfrastructure: {
    database: {
      configured: boolean;
      reachable: boolean;
      issues: string[];
    };
    objectStorage: {
      configured: boolean;
      issues: string[];
    };
  };
  webRuntime: {
    configured: boolean;
    issues: string[];
  };
  workerRuntime: {
    configured: boolean;
    issues: string[];
    heartbeat: WorkerHeartbeatStatus;
  };
  reportCreation: {
    ready: boolean;
    issues: string[];
  };
}

function formatIssues(status: { missing: string[]; invalid: string[] }) {
  const missingIssues = status.missing.map((key) => `${key} is missing.`);
  return [...missingIssues, ...status.invalid];
}

export async function getWorkerHeartbeatStatus(
  workerName = REPORT_RUN_WORKER_NAME
): Promise<WorkerHeartbeatStatus> {
  const [heartbeat] = await db
    .select()
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.workerName, workerName))
    .limit(1);

  if (!heartbeat) {
    return {
      workerName,
      status: "missing",
      lastHeartbeatAt: null,
      staleAfterMs: WORKER_HEARTBEAT_STALE_AFTER_MS,
    };
  }

  const ageMs = Date.now() - heartbeat.lastHeartbeatAt.getTime();

  return {
    workerName,
    status: ageMs <= WORKER_HEARTBEAT_STALE_AFTER_MS ? "running" : "stale",
    lastHeartbeatAt: heartbeat.lastHeartbeatAt.toISOString(),
    staleAfterMs: WORKER_HEARTBEAT_STALE_AFTER_MS,
  };
}

export async function writeWorkerHeartbeat(params?: {
  workerName?: string;
  status?: "running";
}) {
  const workerName = params?.workerName ?? REPORT_RUN_WORKER_NAME;
  const status = params?.status ?? "running";
  const now = new Date();

  await db
    .insert(workerHeartbeats)
    .values({
      workerName,
      status,
      hostname: os.hostname(),
      pid: process.pid,
      startedAt: now,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerName,
      set: {
        status,
        hostname: os.hostname(),
        pid: process.pid,
        lastHeartbeatAt: now,
        updatedAt: now,
      },
    });
}

export async function validateDatabaseConnection() {
  try {
    await sql`select 1`;
    return {
      configured: true,
      reachable: true,
      issues: [] as string[],
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      issues: [error instanceof Error ? error.message : "Database connection check failed."],
    };
  }
}

export async function getDeploymentReadinessSummary(): Promise<DeploymentReadinessSummary> {
  const databaseEnvStatus = getDatabaseEnvStatus();
  const webStatus = getEnvContractStatus("web-only required");
  const workerStatus = getEnvContractStatus("worker-only required");
  const objectStorageStatus = getObjectStorageEnvStatus();
  const database = await validateDatabaseConnection();
  const heartbeat = database.reachable
    ? await getWorkerHeartbeatStatus()
    : {
        workerName: REPORT_RUN_WORKER_NAME,
        status: "missing" as const,
        lastHeartbeatAt: null,
        staleAfterMs: WORKER_HEARTBEAT_STALE_AFTER_MS,
      };

  const webIssues = formatIssues(webStatus);
  const objectStorageIssues = formatIssues(objectStorageStatus);
  const workerIssues = formatIssues(workerStatus);

  const reportCreationIssues = [
    ...(!database.reachable ? [`Database is unreachable: ${database.issues.join(" ")}`] : []),
    ...(!objectStorageStatus.ok ? objectStorageIssues.map((issue) => `Object storage: ${issue}`) : []),
    ...(!workerStatus.ok ? workerIssues.map((issue) => `Worker runtime: ${issue}`) : []),
  ];

  return {
    webApp: {
      status: "up",
    },
    sharedInfrastructure: {
      database: {
        configured: databaseEnvStatus.ok,
        reachable: database.reachable,
        issues: database.issues,
      },
      objectStorage: {
        configured: objectStorageStatus.ok,
        issues: objectStorageIssues,
      },
    },
    webRuntime: {
      configured: webStatus.ok,
      issues: webIssues,
    },
    workerRuntime: {
      configured: workerStatus.ok && objectStorageStatus.ok,
      issues: workerIssues.length > 0 ? workerIssues : objectStorageIssues,
      heartbeat,
    },
    reportCreation: {
      ready: reportCreationIssues.length === 0,
      issues: reportCreationIssues,
    },
  };
}

export function validateWorkerStartupEnv() {
  validateRuntimeEnv("worker runtime");
}

export function validateWebStartupEnv() {
  validateRuntimeEnv("web runtime");
}

export const deploymentContract = {
  env: ENV_CONTRACT,
  reportRunWorkerName: REPORT_RUN_WORKER_NAME,
  workerHeartbeatStaleAfterMs: WORKER_HEARTBEAT_STALE_AFTER_MS,
};
