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

function greenhouseJobsResponse(): Response {
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
}

function leverJobsResponse(): Response {
  return jsonResponse(
    [
      {
        id: "lev-101",
        text: "Platform Engineer",
        categories: { location: "Remote", department: "Engineering" },
        hostedUrl: "https://jobs.lever.co/acme/lev-101",
        applyUrl: "https://jobs.lever.co/acme/lev-101",
        updatedAt: 1767225600000,
      },
    ],
    { status: 200 }
  );
}

function ashbyJobsResponse(): Response {
  return jsonResponse(
    {
      jobs: [
        {
          id: "ash-101",
          title: "Platform Engineer",
          location: "Remote",
          department: "Engineering",
          publishedAt: "2026-01-01T00:00:00.000Z",
          jobUrl: "https://jobs.ashbyhq.com/acme/ash-101",
          applyUrl: "https://jobs.ashbyhq.com/acme/ash-101",
        },
      ],
    },
    { status: 200 }
  );
}

function workableJobsResponse(): Response {
  return jsonResponse(
    {
      jobs: [
        {
          shortcode: "wk-101",
          title: "Platform Engineer",
          location: "Remote",
          department: "Engineering",
          created_at: "2026-01-01T00:00:00.000Z",
          url: "https://apply.workable.com/acme/j/abc123/",
        },
      ],
    },
    { status: 200 }
  );
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
  const providerSuccessCases = [
    {
      label: "Greenhouse",
      url: "https://boards.greenhouse.io/acme",
      expectedSource: "GREENHOUSE" as const,
      successResponse: greenhouseJobsResponse,
    },
    {
      label: "Lever",
      url: "https://jobs.lever.co/acme",
      expectedSource: "LEVER" as const,
      successResponse: leverJobsResponse,
    },
    {
      label: "Ashby",
      url: "https://jobs.ashbyhq.com/acme",
      expectedSource: "ASHBY" as const,
      successResponse: ashbyJobsResponse,
    },
    {
      label: "Workable",
      url: "https://apply.workable.com/acme",
      expectedSource: "WORKABLE" as const,
      successResponse: workableJobsResponse,
    },
  ] as const;

  for (const providerCase of providerSuccessCases) {
    test(`E.${providerCase.label}: 503 then success retries once`, async () => {
      const calls = installFetchMock((attempt) => {
        if (attempt === 1) {
          return jsonResponse({}, { status: 503 });
        }
        return providerCase.successResponse();
      });

      const result = await fetchCompanyJobs(providerCase.url);

      expect(calls).toHaveLength(2);
      expect(result.source).toBe(providerCase.expectedSource);
      expect(result.attempts[0].status).toBe("jobs_found");
      expect(result.attempts[0].providerErrorKind).toBe("none");
      expect(result.attempts[0].attemptCount).toBe(2);
      expect(result.attempts[0].retryCount).toBe(1);
      expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  }

  test("F: 503 then 503 exhausts the HTTP retry budget", async () => {
    const calls = installFetchMock((attempt) => {
      if (attempt <= 2) {
        return jsonResponse({}, { status: 503 });
      }
      throw new Error("Unexpected extra fetch");
    });

    const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

    expect(calls).toHaveLength(2);
    expect(result.source).toBeNull();
    expect(result.attempts[0].status).toBe("error");
    expect(result.attempts[0].providerErrorKind).toBe("provider_http_error");
    expect(result.attempts[0].httpStatus).toBe(503);
    expect(result.attempts[0].attemptCount).toBe(2);
    expect(result.attempts[0].retryCount).toBe(1);
    expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  for (const status of [408, 500, 502, 504] as const) {
    test(`G.${status}: ${status} retries once`, async () => {
      const calls = installFetchMock((attempt) => {
        if (attempt === 1) {
          return jsonResponse({}, { status });
        }
        return greenhouseJobsResponse();
      });

      const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

      expect(calls).toHaveLength(2);
      expect(result.source).toBe("GREENHOUSE");
      expect(result.attempts[0].status).toBe("jobs_found");
      expect(result.attempts[0].attemptCount).toBe(2);
      expect(result.attempts[0].retryCount).toBe(1);
      expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  }

  const nonRetryableCases = [
    {
      status: 429,
      expectedStatus: "error" as const,
      expectedKind: "rate_limit" as const,
    },
    {
      status: 404,
      expectedStatus: "not_found" as const,
      expectedKind: "not_found" as const,
    },
    {
      status: 400,
      expectedStatus: "error" as const,
      expectedKind: "provider_http_error" as const,
    },
    {
      status: 401,
      expectedStatus: "error" as const,
      expectedKind: "provider_http_error" as const,
    },
    {
      status: 403,
      expectedStatus: "error" as const,
      expectedKind: "provider_http_error" as const,
    },
    {
      status: 422,
      expectedStatus: "error" as const,
      expectedKind: "provider_http_error" as const,
    },
  ] as const;

  for (const { status, expectedStatus, expectedKind } of nonRetryableCases) {
    test(`H.${status}: ${status} does not retry`, async () => {
      const calls = installFetchMock(() => jsonResponse({}, { status }));

      const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

      expect(calls).toHaveLength(1);
      expect(result.source).toBeNull();
      expect(result.attempts[0].status).toBe(expectedStatus);
      expect(result.attempts[0].providerErrorKind).toBe(expectedKind);
      expect(result.attempts[0].httpStatus).toBe(status);
      expect(result.attempts[0].attemptCount).toBe(1);
      expect(result.attempts[0].retryCount).toBe(0);
      expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  }

  test("I: successful retry after network failure still works", async () => {
    const calls = installFetchMock((attempt) => {
      if (attempt === 1) throw networkError();
      return greenhouseJobsResponse();
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
});
