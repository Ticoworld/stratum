import { runWorkerLoop } from "@/worker/loop";

async function main() {
  const once = process.argv.includes("--once");
  await runWorkerLoop({ once });
}

main().catch((error) => {
  console.error("[worker] Report-run worker crashed:", error);
  process.exit(1);
});
