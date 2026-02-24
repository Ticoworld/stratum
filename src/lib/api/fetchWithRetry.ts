/**
 * Shared fetch with retry for job board APIs.
 * Retries on ENOTFOUND/Timeout/network failures. Max 3 attempts, 1s between.
 */

const FETCH_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = (err.message || "").toLowerCase();
    return (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("failed") ||
      msg.includes("load")
    );
  }
  if (err instanceof Error) {
    const msg = (err.message || "").toLowerCase();
    const code = (err as NodeJS.ErrnoException).code || "";
    return (
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      msg.includes("aborted") ||
      msg.includes("timeout")
    );
  }
  return false;
}

export async function fetchWithRetry(
  url: string,
  init?: Omit<RequestInit, "signal">
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      lastError = e;
      if (isRetryableError(e) && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw lastError;
      }
    }
  }
  throw lastError;
}
