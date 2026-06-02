import { expect, test } from "@playwright/test";
import { fetchCompanyJobs } from "../../src/lib/api/boards";
import { fetchWithRetryWithTelemetry } from "../../src/lib/api/fetchWithRetry";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function networkError(message = "getaddrinfo ENOTFOUND api.greenhouse.io"): Error {
  return Object.assign(new Error(message), {
    code: "ENOTFOUND",
  });
}

function timeoutError(message = "The operation was aborted."): Error {
  return Object.assign(new Error(message), {
    name: "AbortError",
  });
}

function installFetchMock(
  resolver: (attempt: number, url: string) => Response | Promise<Response>
): string[] {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return resolver(calls.length, url);
  }) as typeof fetch;

  return calls;
}

test.beforeEach(() => {
  globalThis.fetch = originalFetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.describe("fetchWithRetry telemetry", () => {
  test("A: first-attempt success returns attemptCount 1 and retryCount 0", async () => {
    const calls = installFetchMock(() =>
      jsonResponse({ ok: true }, { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const result = await fetchWithRetryWithTelemetry("https://example.com/jobs");

    expect(calls).toHaveLength(1);
    expect(result.attemptCount).toBe(1);
    expect(result.retryCount).toBe(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.response.status).toBe(200);
  });

  test("B: network failure then success returns attemptCount 2 and retryCount 1", async () => {
    const calls = installFetchMock((attempt) => {
      if (attempt === 1) throw networkError();
      return jsonResponse({ ok: true }, { status: 200 });
    });

    const result = await fetchWithRetryWithTelemetry("https://example.com/jobs");

    expect(calls).toHaveLength(2);
    expect(result.attemptCount).toBe(2);
    expect(result.retryCount).toBe(1);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.response.status).toBe(200);
  });

  test("C: all network retries fail and telemetry records the final attempt", async () => {
    const calls = installFetchMock(() => {
      throw networkError();
    });

    const error = (await fetchWithRetryWithTelemetry("https://example.com/jobs").catch(
      (err: unknown) => err
    )) as { attemptCount?: number; retryCount?: number; elapsedMs?: number };

    expect(error.attemptCount).toBe(3);
    expect(error.retryCount).toBe(2);
    expect(error.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(calls).toHaveLength(3);
  });

  test("D: timeout-like failures are retried and recorded", async () => {
    const calls = installFetchMock(() => {
      throw timeoutError();
    });

    const error = (await fetchWithRetryWithTelemetry("https://example.com/jobs").catch(
      (err: unknown) => err
    )) as { attemptCount?: number; retryCount?: number; elapsedMs?: number };

    expect(error.attemptCount).toBe(3);
    expect(error.retryCount).toBe(2);
    expect(error.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(calls).toHaveLength(3);
  });
});

test.describe("provider integration telemetry", () => {
  test("E: 404 responses do not retry and record attemptCount 1", async () => {
    const calls = installFetchMock(() => jsonResponse({}, { status: 404 }));

    const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

    expect(calls).toHaveLength(1);
    expect(result.attempts[0].status).toBe("not_found");
    expect(result.attempts[0].providerErrorKind).toBe("not_found");
    expect(result.attempts[0].attemptCount).toBe(1);
    expect(result.attempts[0].retryCount).toBe(0);
    expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test("F: 429 responses do not retry and record attemptCount 1", async () => {
    const calls = installFetchMock(() => jsonResponse({}, { status: 429 }));

    const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

    expect(calls).toHaveLength(1);
    expect(result.attempts[0].status).toBe("error");
    expect(result.attempts[0].providerErrorKind).toBe("rate_limit");
    expect(result.attempts[0].attemptCount).toBe(1);
    expect(result.attempts[0].retryCount).toBe(0);
    expect(result.attempts[0].httpStatus).toBe(429);
  });

  test("G: 503 responses do not retry and record attemptCount 1", async () => {
    const calls = installFetchMock(() => jsonResponse({}, { status: 503 }));

    const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

    expect(calls).toHaveLength(1);
    expect(result.attempts[0].status).toBe("error");
    expect(result.attempts[0].providerErrorKind).toBe("provider_http_error");
    expect(result.attempts[0].attemptCount).toBe(1);
    expect(result.attempts[0].retryCount).toBe(0);
    expect(result.attempts[0].httpStatus).toBe(503);
  });

  test("H: successful retry after network failure preserves jobs_found and retryCount 1", async () => {
    const calls = installFetchMock((attempt) => {
      if (attempt === 1) throw networkError();
      return jsonResponse(
        {
          jobs: [
            {
              id: 101,
              title: "Platform Engineer",
              location: { name: "Remote" },
              departments: [{ name: "Engineering" }],
              updated_at: "2026-01-01T00:00:00.000Z",
              absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
            },
          ],
        },
        { status: 200 }
      );
    });

    const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

    expect(calls).toHaveLength(2);
    expect(result.source).toBe("GREENHOUSE");
    expect(result.attempts[0].status).toBe("jobs_found");
    expect(result.attempts[0].providerErrorKind).toBe("none");
    expect(result.attempts[0].attemptCount).toBe(2);
    expect(result.attempts[0].retryCount).toBe(1);
    expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test("I: final network failure preserves network_error and retryCount 2", async () => {
    const calls = installFetchMock(() => {
      throw networkError();
    });

    const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

    expect(calls).toHaveLength(3);
    expect(result.source).toBeNull();
    expect(result.attempts[0].status).toBe("error");
    expect(result.attempts[0].providerErrorKind).toBe("network_error");
    expect(result.attempts[0].attemptCount).toBe(3);
    expect(result.attempts[0].retryCount).toBe(2);
    expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
