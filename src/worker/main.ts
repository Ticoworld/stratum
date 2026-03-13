import { sql } from "@/db/client";
import { validateWorkerStartupEnv, writeWorkerHeartbeat } from "@/lib/deployment/readiness";
import { closeS3Client } from "@/lib/storage/s3";
import { runWorkerLoop } from "@/worker/loop";

export async function main() {
  const once = process.argv.includes("--once");
  const checkEnvOnly = process.argv.includes("--check-env");

  validateWorkerStartupEnv();

  if (checkEnvOnly) {
    console.log("[worker] Environment contract validated.");
    return;
  }

  try {
    await writeWorkerHeartbeat();
    await runWorkerLoop({ once });
  } finally {
    if (once) {
      closeS3Client();
      await sql.end();
    }
  }
}
