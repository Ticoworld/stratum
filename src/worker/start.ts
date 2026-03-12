import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function start() {
  const { main } = await import("@/worker/main");
  await main();
}

start().catch((error) => {
  console.error("[worker] Report-run worker crashed:", error);
  process.exit(1);
});
