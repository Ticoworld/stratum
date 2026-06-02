import { fetchWithRetryWithTelemetry, type FetchWithRetryResult } from "./fetchWithRetry";

const HTTP_RETRY_DELAY_MS = 1000;
const MAX_HTTP_ATTEMPTS = 2;

const RETRYABLE_HTTP_STATUSES = new Set([408, 500, 502, 503, 504]);

export function shouldRetryProviderHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

function aggregateTelemetry(
  results: FetchWithRetryResult[],
  startedAt: number
): FetchWithRetryResult {
  const response = results[results.length - 1].response;
  const attemptCount = results.reduce((sum, result) => sum + result.attemptCount, 0);

  return {
    response,
    attemptCount,
    retryCount: Math.max(0, attemptCount - 1),
    elapsedMs: Date.now() - startedAt,
  };
}

/**
 * Fetch with the existing transport retry policy, plus a single HTTP retry for
 * transient provider statuses. Telemetry is aggregated across both layers so
 * provider attempts stay deterministic and easy to inspect.
 */
export async function fetchProviderWithHttpRetry(
  url: string,
  init?: Omit<RequestInit, "signal">
): Promise<FetchWithRetryResult> {
  const startedAt = Date.now();
  const results: FetchWithRetryResult[] = [];

  for (let httpAttempt = 1; httpAttempt <= MAX_HTTP_ATTEMPTS; httpAttempt++) {
    const result = await fetchWithRetryWithTelemetry(url, init);
    results.push(result);

    const status = result.response.status;
    if (!shouldRetryProviderHttpStatus(status) || httpAttempt === MAX_HTTP_ATTEMPTS) {
      return aggregateTelemetry(results, startedAt);
    }

    await new Promise((resolve) => setTimeout(resolve, HTTP_RETRY_DELAY_MS));
  }

  return aggregateTelemetry(results, startedAt);
}
