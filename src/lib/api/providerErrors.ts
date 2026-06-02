import type { FetchWithRetryTelemetry } from "./fetchWithRetry";

export type ProviderErrorKind =
  | "none"
  | "not_found"
  | "rate_limit"
  | "provider_http_error"
  | "timeout"
  | "network_error"
  | "parse_error"
  | "unexpected_shape"
  | "unsupported_source"
  | "token_mismatch"
  | "unknown_error";

export interface ProviderFetchError extends Error {
  providerErrorKind: ProviderErrorKind;
  httpStatus?: number;
  attemptCount?: number;
  retryCount?: number;
  elapsedMs?: number;
}

export interface ProviderErrorClassification {
  providerErrorKind: ProviderErrorKind;
  httpStatus?: number;
  errorMessage?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || String(error);
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
  }
  return String(error);
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name || undefined;
  if (typeof error === "object" && error !== null) {
    const maybeName = (error as { name?: unknown }).name;
    if (typeof maybeName === "string" && maybeName.trim()) return maybeName.trim();
  }
  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return typeof code === "string" && code.trim() ? code.trim() : undefined;
  }

  if (typeof error === "object" && error !== null) {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.trim()) return maybeCode.trim();
  }

  return undefined;
}

function extractHttpStatus(message: string): number | undefined {
  const match = message.match(/\b(4|5)\d{2}\b/);
  if (!match) return undefined;

  const status = Number(match[0]);
  return Number.isFinite(status) ? status : undefined;
}

function isJsonParseError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("unexpected token") ||
    message.includes("unexpected end of json input") ||
    message.includes("json parse") ||
    message.includes("invalid json")
  );
}

function isTimeoutError(error: unknown): boolean {
  const name = getErrorName(error)?.toLowerCase();
  const message = getErrorMessage(error).toLowerCase();
  const code = getErrorCode(error)?.toUpperCase();

  return (
    name === "aborterror" ||
    code === "ETIMEDOUT" ||
    message.includes("aborted") ||
    message.includes("timeout")
  );
}

function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const code = getErrorCode(error)?.toUpperCase();

  return (
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "EHOSTUNREACH" ||
    code === "EAI_AGAIN" ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("dns") ||
    message.includes("getaddrinfo") ||
    message.includes("socket hang up") ||
    message.includes("load")
  );
}

function isUnexpectedShapeError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("unexpected response shape") ||
    message.includes("malformed response shape") ||
    message.includes("invalid response shape") ||
    message.includes("unexpected data shape")
  );
}

export function createProviderFetchError(
  providerErrorKind: Exclude<ProviderErrorKind, "none">,
  message: string,
  options?: { httpStatus?: number }
): ProviderFetchError {
  const error = new Error(message) as ProviderFetchError;
  error.providerErrorKind = providerErrorKind;
  if (options?.httpStatus !== undefined) {
    error.httpStatus = options.httpStatus;
  }
  return error;
}

export function createProviderHttpError(providerName: string, status: number): ProviderFetchError {
  if (status === 404) {
    return createProviderFetchError("not_found", "NOT_FOUND", { httpStatus: status });
  }

  if (status === 429) {
    return createProviderFetchError("rate_limit", `${providerName}: ${status}`, {
      httpStatus: status,
    });
  }

  return createProviderFetchError("provider_http_error", `${providerName}: ${status}`, {
    httpStatus: status,
  });
}

export function createProviderUnexpectedShapeError(
  providerName: string,
  httpStatus?: number
): ProviderFetchError {
  return createProviderFetchError("unexpected_shape", `${providerName}: unexpected response shape`, {
    httpStatus,
  });
}

export function attachProviderTelemetry<T extends Error>(
  error: T,
  telemetry: FetchWithRetryTelemetry
): T & FetchWithRetryTelemetry {
  return Object.assign(error, telemetry);
}

export function getProviderRetryTelemetry(error: unknown): FetchWithRetryTelemetry | null {
  if (typeof error !== "object" || error === null) return null;

  const attemptCount = (error as { attemptCount?: unknown }).attemptCount;
  const retryCount = (error as { retryCount?: unknown }).retryCount;
  const elapsedMs = (error as { elapsedMs?: unknown }).elapsedMs;

  if (
    typeof attemptCount === "number" &&
    typeof retryCount === "number" &&
    typeof elapsedMs === "number"
  ) {
    return { attemptCount, retryCount, elapsedMs };
  }

  return null;
}

export function classifyProviderError(error: unknown): ProviderErrorClassification {
  if (typeof error === "object" && error !== null) {
    const maybeKind = (error as { providerErrorKind?: unknown }).providerErrorKind;
    if (typeof maybeKind === "string") {
      const httpStatus =
        typeof (error as { httpStatus?: unknown }).httpStatus === "number"
          ? ((error as { httpStatus?: number }).httpStatus as number)
          : undefined;

      return {
        providerErrorKind: maybeKind as ProviderErrorKind,
        httpStatus,
        errorMessage:
          maybeKind === "not_found" ? undefined : getErrorMessage(error),
      };
    }
  }

  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (message === "NOT_FOUND" || lowerMessage.includes("not found")) {
    return { providerErrorKind: "not_found", errorMessage: undefined };
  }

  if (isTimeoutError(error)) {
    return {
      providerErrorKind: "timeout",
      errorMessage: message,
    };
  }

  if (isJsonParseError(error)) {
    return {
      providerErrorKind: "parse_error",
      errorMessage: message,
    };
  }

  if (isNetworkError(error)) {
    return {
      providerErrorKind: "network_error",
      errorMessage: message,
    };
  }

  if (isUnexpectedShapeError(error)) {
    const httpStatus = extractHttpStatus(message);
    return {
      providerErrorKind: "unexpected_shape",
      httpStatus,
      errorMessage: message,
    };
  }

  if (lowerMessage.includes("token mismatch")) {
    return {
      providerErrorKind: "token_mismatch",
      errorMessage: message,
    };
  }

  if (lowerMessage.includes("unsupported source")) {
    return {
      providerErrorKind: "unsupported_source",
      errorMessage: message,
    };
  }

  const httpStatus = extractHttpStatus(message);
  if (httpStatus !== undefined) {
    if (httpStatus === 404) {
      return { providerErrorKind: "not_found", httpStatus, errorMessage: undefined };
    }
    if (httpStatus === 429) {
      return { providerErrorKind: "rate_limit", httpStatus, errorMessage: message };
    }
    return {
      providerErrorKind: "provider_http_error",
      httpStatus,
      errorMessage: message,
    };
  }

  return {
    providerErrorKind: "unknown_error",
    errorMessage: message,
  };
}
