import { sql } from "@/db/client";
import { closeS3Client } from "@/lib/storage/s3";
import { runWorkerLoop } from "@/worker/loop";

export async function main() {
  const once = process.argv.includes("--once");

  try {
    await runWorkerLoop({ once });
  } finally {
    if (once) {
      closeS3Client();
      await sql.end();
    }
  }
}
