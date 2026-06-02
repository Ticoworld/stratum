/**
 * Shared fetch with retry for job board APIs.
 * Retries on ENOTFOUND/Timeout/network failures. Max 3 attempts, 1s between.
 */

const FETCH_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;

export interface FetchWithRetryTelemetry {
  attemptCount: number;
  retryCount: number;
  elapsedMs: number;
}

export interface FetchWithRetryResult extends FetchWithRetryTelemetry {
  response: Response;
}

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

function attachTelemetry<T extends Error>(
  error: T,
  telemetry: FetchWithRetryTelemetry
): T & FetchWithRetryTelemetry {
  return Object.assign(error, telemetry);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  const maybeMessage =
    typeof error === "object" && error !== null
      ? (error as { message?: unknown }).message
      : undefined;
  const message =
    typeof maybeMessage === "string" && maybeMessage.trim() ? maybeMessage.trim() : String(error);

  const normalizedError = new Error(message);
  if (typeof error === "object" && error !== null) {
    Object.assign(normalizedError, error);
  }

  return normalizedError;
}

export async function fetchWithRetryWithTelemetry(
  url: string,
  init?: Omit<RequestInit, "signal">
): Promise<FetchWithRetryResult> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      return {
        response,
        attemptCount: attempt,
        retryCount: attempt - 1,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      const telemetry = {
        attemptCount: attempt,
        retryCount: attempt - 1,
        elapsedMs: Date.now() - startedAt,
      };

      if (isRetryableError(error) && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        throw attachTelemetry(normalizeError(error), telemetry);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const telemetry = {
    attemptCount: MAX_ATTEMPTS,
    retryCount: MAX_ATTEMPTS - 1,
    elapsedMs: Date.now() - startedAt,
  };
  throw attachTelemetry(normalizeError(lastError), telemetry);
}

export async function fetchWithRetry(
  url: string,
  init?: Omit<RequestInit, "signal">
): Promise<Response> {
  return (await fetchWithRetryWithTelemetry(url, init)).response;
}
