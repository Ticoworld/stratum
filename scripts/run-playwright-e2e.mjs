import fs from "node:fs";
import { spawnSync } from "node:child_process";

function getExecutable(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: true,
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    console.error(`[E2E] Failed to run ${command}:`, result.error);
  }

  return 1;
}

const e2ePort = 3100 + Math.floor(Math.random() * 400);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const sharedEnv = {
  ...process.env,
  STRATUM_E2E_PORT: String(e2ePort),
  STRATUM_E2E_BASE_URL: e2eBaseUrl,
};

try {
  fs.rmSync(".next", { recursive: true, force: true });
} catch {}

const npm = getExecutable("npm");
const npx = getExecutable("npx");
const forwardedArgs = process.argv.slice(2);

const buildStatus = run(npm, ["run", "build"], sharedEnv);
if (buildStatus !== 0) {
  process.exit(buildStatus);
}

const playwrightStatus = run(npx, ["playwright", "test", ...forwardedArgs], sharedEnv);
process.exit(playwrightStatus);
