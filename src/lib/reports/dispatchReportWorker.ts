import "server-only";
import { fetchWithRetry } from "@/lib/api/fetchWithRetry";

const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_GITHUB_OWNER = "Ticoworld";
const DEFAULT_GITHUB_REPO = "stratum";
const DEFAULT_GITHUB_WORKFLOW_ID = "report-worker.yml";
const DEFAULT_GITHUB_REF = "master";

function readOptionalEnv(name: string) {
  const value = process.env[name];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function getDispatchConfig() {
  const token = readOptionalEnv("GITHUB_DISPATCH_TOKEN");

  if (!token) {
    return null;
  }

  return {
    token,
    owner: readOptionalEnv("GITHUB_DISPATCH_OWNER") ?? DEFAULT_GITHUB_OWNER,
    repo: readOptionalEnv("GITHUB_DISPATCH_REPO") ?? DEFAULT_GITHUB_REPO,
    workflowId: readOptionalEnv("GITHUB_DISPATCH_WORKFLOW_ID") ?? DEFAULT_GITHUB_WORKFLOW_ID,
    ref: readOptionalEnv("GITHUB_DISPATCH_REF") ?? DEFAULT_GITHUB_REF,
  };
}

export async function dispatchReportWorker() {
  const config = getDispatchConfig();

  if (!config) {
    return {
      triggered: false as const,
      reason: "missing-token" as const,
    };
  }

  const response = await fetchWithRetry(
    `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        ref: config.ref,
      }),
    }
  );

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      `GitHub workflow dispatch failed with ${response.status} ${response.statusText}${
        responseText ? `: ${responseText}` : ""
      }`
    );
  }

  return {
    triggered: true as const,
    reason: "dispatched" as const,
  };
}
