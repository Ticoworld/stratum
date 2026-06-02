import { test, expect } from "@playwright/test";
import { fetchCompanyJobs, type JobBoardSource } from "../../src/lib/api/boards";

type ProviderSource = JobBoardSource;

const originalFetch = globalThis.fetch;

function sourceFromUrl(url: string): ProviderSource | null {
  if (url.includes("boards-api.greenhouse.io")) return "GREENHOUSE";
  if (url.includes("api.lever.co/v0/postings")) return "LEVER";
  if (url.includes("api.ashbyhq.com/posting-api/job-board")) return "ASHBY";
  if (url.includes("apply.workable.com/api/v1/widget/accounts")) return "WORKABLE";
  return null;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function greenhouseJob() {
  return {
    id: 101,
    title: "Platform Engineer",
    location: { name: "Remote" },
    departments: [{ name: "Engineering" }],
    updated_at: "2026-01-01T00:00:00.000Z",
    absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
  };
}

function leverJob() {
  return {
    id: "lev-101",
    text: "Platform Engineer",
    categories: { location: "Remote", department: "Engineering" },
    hostedUrl: "https://jobs.lever.co/acme/lev-101",
    applyUrl: "https://jobs.lever.co/acme/lev-101",
    updatedAt: 1767225600000,
  };
}

function ashbyJob() {
  return {
    id: "ash-101",
    title: "Platform Engineer",
    location: "Remote",
    department: "Engineering",
    publishedAt: "2026-01-01T00:00:00.000Z",
    jobUrl: "https://jobs.ashbyhq.com/acme/ash-101",
    applyUrl: "https://jobs.ashbyhq.com/acme/ash-101",
  };
}

function installFetchMock(
  resolver: (source: ProviderSource, url: string) => Response | Promise<Response>
): string[] {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const source = sourceFromUrl(url);

    if (!source) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    calls.push(source);
    return resolver(source, url);
  }) as typeof fetch;

  return calls;
}

function attemptSignatures(result: Awaited<ReturnType<typeof fetchCompanyJobs>>): string[] {
  return result.attempts.map((attempt) => `${attempt.source}:${attempt.status}`);
}

function attemptForSource(
  result: Awaited<ReturnType<typeof fetchCompanyJobs>>,
  source: ProviderSource
) {
  return result.attempts.find((attempt) => attempt.source === source);
}

function plainThrownError(message: string, extra: Record<string, unknown> = {}): unknown {
  return {
    name: "Error",
    message,
    ...extra,
  };
}

function abortThrownError(message = "The operation was aborted."): unknown {
  return {
    name: "AbortError",
    message,
  };
}

test.beforeEach(() => {
  globalThis.fetch = originalFetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.describe("Phase 6I-2 provider flow", () => {
  test("A: company-name scan short-circuits after Greenhouse jobs_found", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({ jobs: [greenhouseJob()] });
      throw new Error(`Unexpected fetch for ${source}`);
    });

    const result = await fetchCompanyJobs("Acme Holdings");

    expect(calls).toEqual(["GREENHOUSE"]);
    expect(result.source).toBe("GREENHOUSE");
    expect(result.candidateMatches).toHaveLength(1);
    expect(result.candidateMatches[0].source).toBe("GREENHOUSE");
    expect(attemptSignatures(result)).toEqual([
      "GREENHOUSE:jobs_found",
      "LEVER:not_attempted_after_match",
      "ASHBY:not_attempted_after_match",
      "WORKABLE:not_attempted_after_match",
    ]);
  });

  test("B: company-name scan continues when Greenhouse not_found", async () => {
    const calls = installFetchMock((source) => {
      switch (source) {
        case "GREENHOUSE":
          return jsonResponse({}, { status: 404 });
        case "LEVER":
          return jsonResponse({}, { status: 404 });
        case "ASHBY":
          return jsonResponse({ jobs: [ashbyJob()] });
        case "WORKABLE":
          throw new Error(`Unexpected fetch for ${source}`);
      }
    });

    const result = await fetchCompanyJobs("Nimbus Systems");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY"]);
    expect(result.source).toBe("ASHBY");
    expect(result.candidateMatches.map((match) => match.source)).toEqual(["ASHBY"]);
    expect(attemptSignatures(result)).toEqual([
      "GREENHOUSE:not_found",
      "LEVER:not_found",
      "ASHBY:jobs_found",
      "WORKABLE:not_attempted_after_match",
    ]);
  });

  test("C: company-name scan continues when Greenhouse zero_jobs", async () => {
    const calls = installFetchMock((source) => {
      switch (source) {
        case "GREENHOUSE":
          return jsonResponse({ jobs: [] });
        case "LEVER":
          return jsonResponse({}, { status: 404 });
        case "ASHBY":
          return jsonResponse({ jobs: [ashbyJob()] });
        case "WORKABLE":
          throw new Error(`Unexpected fetch for ${source}`);
      }
    });

    const result = await fetchCompanyJobs("Orchid Labs");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY"]);
    expect(result.source).toBe("ASHBY");
    expect(result.candidateMatches.map((match) => match.source)).toEqual([
      "GREENHOUSE",
      "ASHBY",
    ]);
    expect(attemptSignatures(result)).toEqual([
      "GREENHOUSE:zero_jobs",
      "LEVER:not_found",
      "ASHBY:jobs_found",
      "WORKABLE:not_attempted_after_match",
    ]);
  });

  test("D: company-name scan continues when Greenhouse error", async () => {
    const calls = installFetchMock((source) => {
      switch (source) {
        case "GREENHOUSE":
          return jsonResponse({}, { status: 500 });
        case "LEVER":
          return jsonResponse([leverJob()]);
        case "ASHBY":
        case "WORKABLE":
          throw new Error(`Unexpected fetch for ${source}`);
      }
    });

    const result = await fetchCompanyJobs("Northstar Labs");

    expect(calls).toEqual(["GREENHOUSE", "LEVER"]);
    expect(result.source).toBe("LEVER");
    expect(result.candidateMatches.map((match) => match.source)).toEqual(["LEVER"]);
    expect(result.attempts.find((attempt) => attempt.source === "GREENHOUSE")?.errorMessage).toBe(
      "Greenhouse: 500"
    );
    expect(attemptSignatures(result)).toEqual([
      "GREENHOUSE:error",
      "LEVER:jobs_found",
      "ASHBY:not_attempted_after_match",
      "WORKABLE:not_attempted_after_match",
    ]);
  });

  test("E: direct Greenhouse URL scan stays single-provider", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({ jobs: [greenhouseJob()] });
      throw new Error(`Unexpected fetch for ${source}`);
    });

    const result = await fetchCompanyJobs("https://boards.greenhouse.io/acme");

    expect(calls).toEqual(["GREENHOUSE"]);
    expect(result.sourceInputMode).toBe("supported_source_input");
    expect(result.requestedSourceHint).toBe("GREENHOUSE");
    expect(result.source).toBe("GREENHOUSE");
    expect(result.candidateMatches.map((match) => match.source)).toEqual(["GREENHOUSE"]);
    expect(attemptSignatures(result)).toEqual([
      "GREENHOUSE:jobs_found",
      "LEVER:not_applicable",
      "ASHBY:not_applicable",
      "WORKABLE:not_applicable",
    ]);
  });

  test("F: unsupported source URL scan is unchanged", async () => {
    const calls = installFetchMock(() => {
      throw new Error("No provider fetch should occur for unsupported sources.");
    });

    const result = await fetchCompanyJobs("https://jobs.workday.com/acme");

    expect(calls).toEqual([]);
    expect(result.sourceInputMode).toBe("unsupported_source_input");
    expect(result.unsupportedSourcePattern).toBe("WORKDAY");
    expect(result.source).toBeNull();
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts.every((attempt) => attempt.status === "not_applicable")).toBe(true);
  });

  test("G: Ashby transient error after Greenhouse success no longer appears", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({ jobs: [greenhouseJob()] });
      if (source === "ASHBY") throw new Error("Ashby transient error");
      throw new Error(`Unexpected fetch for ${source}`);
    });

    const result = await fetchCompanyJobs("Crescent Labs");

    expect(calls).toEqual(["GREENHOUSE"]);
    expect(result.source).toBe("GREENHOUSE");
    expect(result.attempts.some((attempt) => attempt.source === "ASHBY" && attempt.status === "error")).toBe(false);
    expect(result.attempts.find((attempt) => attempt.source === "ASHBY")?.status).toBe(
      "not_attempted_after_match"
    );
  });

  test("H: skipped providers are marked not_attempted_after_match with no errors", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({ jobs: [greenhouseJob()] });
      throw new Error(`Unexpected fetch for ${source}`);
    });

    const result = await fetchCompanyJobs("Atlas Systems");
    const skipped = result.attempts.filter((attempt) => attempt.status === "not_attempted_after_match");

    expect(calls).toEqual(["GREENHOUSE"]);
    expect(skipped).toHaveLength(3);
    expect(skipped.map((attempt) => attempt.source)).toEqual(["LEVER", "ASHBY", "WORKABLE"]);
    expect(skipped.every((attempt) => attempt.jobsCount === 0)).toBe(true);
    expect(skipped.every((attempt) => attempt.errorMessage === undefined)).toBe(true);
  });
});

test.describe("Phase 6J-2 provider failure classification", () => {
  test("A: 404 responses classify as not_found", async () => {
    const calls = installFetchMock((source) => {
      switch (source) {
        case "GREENHOUSE":
        case "LEVER":
        case "ASHBY":
        case "WORKABLE":
          return jsonResponse({}, { status: 404 });
      }
    });

    const result = await fetchCompanyJobs("404 Classification Labs");
    const greenhouse = attemptForSource(result, "GREENHOUSE");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);
    expect(greenhouse?.status).toBe("not_found");
    expect(greenhouse?.providerErrorKind).toBe("not_found");
    expect(greenhouse?.httpStatus).toBe(404);
    expect(greenhouse?.errorMessage).toBeUndefined();
    expect(greenhouse?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("B: 429 responses classify as rate_limit", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({}, { status: 429 });
      return jsonResponse({}, { status: 404 });
    });

    const result = await fetchCompanyJobs("429 Classification Labs");
    const greenhouse = attemptForSource(result, "GREENHOUSE");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);
    expect(greenhouse?.status).toBe("error");
    expect(greenhouse?.providerErrorKind).toBe("rate_limit");
    expect(greenhouse?.httpStatus).toBe(429);
    expect(greenhouse?.errorMessage).toContain("429");
    expect(greenhouse?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("C: 5xx responses classify as provider_http_error", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({}, { status: 503 });
      return jsonResponse({}, { status: 404 });
    });

    const result = await fetchCompanyJobs("503 Classification Labs");
    const greenhouse = attemptForSource(result, "GREENHOUSE");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);
    expect(greenhouse?.status).toBe("error");
    expect(greenhouse?.providerErrorKind).toBe("provider_http_error");
    expect(greenhouse?.httpStatus).toBe(503);
    expect(greenhouse?.errorMessage).toContain("503");
  });

  test("D: timeout-like thrown errors classify as timeout", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") throw abortThrownError();
      return jsonResponse({}, { status: 404 });
    });

    const result = await fetchCompanyJobs("Timeout Classification Labs");
    const greenhouse = attemptForSource(result, "GREENHOUSE");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);
    expect(greenhouse?.status).toBe("error");
    expect(greenhouse?.providerErrorKind).toBe("timeout");
    expect(greenhouse?.httpStatus).toBeUndefined();
  });

  test("E: network-like thrown errors classify as network_error", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") {
        throw plainThrownError("getaddrinfo ENOTFOUND api.greenhouse.io", {
          code: "ENOTFOUND",
        });
      }
      return jsonResponse({}, { status: 404 });
    });

    const result = await fetchCompanyJobs("Network Classification Labs");
    const greenhouse = attemptForSource(result, "GREENHOUSE");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);
    expect(greenhouse?.status).toBe("error");
    expect(greenhouse?.providerErrorKind).toBe("network_error");
    expect(greenhouse?.httpStatus).toBeUndefined();
  });

  test("F: invalid JSON responses classify as parse_error", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") {
        return new Response("{\"jobs\":", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return jsonResponse({}, { status: 404 });
    });

    const result = await fetchCompanyJobs("Parse Classification Labs");
    const greenhouse = attemptForSource(result, "GREENHOUSE");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);
    expect(greenhouse?.status).toBe("error");
    expect(greenhouse?.providerErrorKind).toBe("parse_error");
    expect(greenhouse?.httpStatus).toBeUndefined();
  });

  test("G: malformed successful payloads classify as unexpected_shape", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({ jobs: { total: 1 } });
      return jsonResponse({}, { status: 404 });
    });

    const result = await fetchCompanyJobs("Shape Classification Labs");
    const greenhouse = attemptForSource(result, "GREENHOUSE");

    expect(calls).toEqual(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);
    expect(greenhouse?.status).toBe("error");
    expect(greenhouse?.providerErrorKind).toBe("unexpected_shape");
    expect(greenhouse?.httpStatus).toBe(200);
  });

  test("H: skipped providers after first match carry no failure metadata", async () => {
    const calls = installFetchMock((source) => {
      if (source === "GREENHOUSE") return jsonResponse({ jobs: [greenhouseJob()] });
      throw new Error(`Unexpected fetch for ${source}`);
    });

    const result = await fetchCompanyJobs("Skip Metadata Labs");
    const skipped = result.attempts.filter((attempt) => attempt.status === "not_attempted_after_match");

    expect(calls).toEqual(["GREENHOUSE"]);
    expect(skipped).toHaveLength(3);
    expect(skipped.map((attempt) => attempt.source)).toEqual(["LEVER", "ASHBY", "WORKABLE"]);
    expect(skipped.every((attempt) => attempt.providerErrorKind === undefined)).toBe(true);
    expect(skipped.every((attempt) => attempt.httpStatus === undefined)).toBe(true);
    expect(skipped.every((attempt) => attempt.errorMessage === undefined)).toBe(true);
    expect(skipped.every((attempt) => attempt.durationMs === undefined)).toBe(true);
  });

  test("I: unsupported source URLs still short-circuit to not_applicable attempts", async () => {
    const calls = installFetchMock(() => {
      throw new Error("No provider fetch should occur for unsupported sources.");
    });

    const result = await fetchCompanyJobs("https://jobs.workday.com/acme");

    expect(calls).toEqual([]);
    expect(result.sourceInputMode).toBe("unsupported_source_input");
    expect(result.unsupportedSourcePattern).toBe("WORKDAY");
    expect(result.source).toBeNull();
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts.every((attempt) => attempt.status === "not_applicable")).toBe(true);
    expect(result.attempts.every((attempt) => attempt.providerErrorKind === undefined)).toBe(true);
    expect(result.attempts.every((attempt) => attempt.httpStatus === undefined)).toBe(true);
    expect(result.attempts.every((attempt) => attempt.errorMessage === undefined)).toBe(true);
  });
});
