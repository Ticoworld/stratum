import { expect, test } from "@playwright/test";
import { buildProviderDiagnosticsView } from "../../src/lib/briefs/providerDiagnostics";
import type { StratumResult } from "../../src/lib/services/StratumInvestigator";

function makeResult(overrides: Partial<StratumResult> = {}): StratumResult {
  return {
    apiSource: "GREENHOUSE",
    sourceInputMode: "company_name",
    requestedSourceHint: null,
    providerAttempts: [],
    providerAttemptSummaries: [],
    ...overrides,
  } as StratumResult;
}

test.describe("provider diagnostics view model", () => {
  test("renders provider diagnostics rows from resultSnapshot", () => {
    const view = buildProviderDiagnosticsView(
      makeResult({
        providerAttemptSummaries: [
          {
            source: "GREENHOUSE",
            status: "jobs_found",
            jobsCount: 4,
            tokensTried: ["notion"],
            errorMessages: [],
            usedForBrief: true,
            note: "Returned 4 observed open roles and anchors this brief.",
          },
          {
            source: "LEVER",
            status: "zero_jobs",
            jobsCount: 0,
            tokensTried: ["notion"],
            errorMessages: [],
            usedForBrief: false,
            note: "Matched this provider but observed zero current openings there at fetch time.",
          },
          {
            source: "ASHBY",
            status: "not_found",
            jobsCount: 0,
            tokensTried: ["notion"],
            errorMessages: [],
            usedForBrief: false,
            note: "No supported board or token match was confirmed on this provider.",
          },
        ],
        providerAttempts: [
          {
            source: "GREENHOUSE",
            token: "notion",
            status: "jobs_found",
            jobsCount: 4,
            attemptCount: 2,
            retryCount: 1,
            durationMs: 1425,
            providerErrorKind: "none",
          },
          {
            source: "LEVER",
            token: "notion",
            status: "zero_jobs",
            jobsCount: 0,
            attemptCount: 1,
            retryCount: 0,
            durationMs: 490,
            providerErrorKind: "none",
          },
          {
            source: "ASHBY",
            token: "notion",
            status: "not_found",
            jobsCount: 0,
            attemptCount: 1,
            retryCount: 0,
            durationMs: 210,
            providerErrorKind: "not_found",
            httpStatus: 404,
          },
        ],
      })
    );

    expect(view.hasDiagnostics).toBe(true);
    expect(view.rows).toHaveLength(3);

    const greenhouse = view.rows[0];
    expect(greenhouse.sourceLabel).toBe("Greenhouse");
    expect(greenhouse.statusLabel).toBe("Jobs found");
    expect(greenhouse.jobsCount).toBe(4);
    expect(greenhouse.usedForBrief).toBe(true);
    expect(greenhouse.note).toContain("anchors this brief");
  });

  test("includes retry telemetry and error metadata when present", () => {
    const view = buildProviderDiagnosticsView(
      makeResult({
        providerAttemptSummaries: [
          {
            source: "GREENHOUSE",
            status: "error",
            jobsCount: 0,
            tokensTried: ["notion"],
            errorMessages: ["Greenhouse: 503"],
            usedForBrief: false,
            note: "This provider request failed during the search.",
          },
        ],
        providerAttempts: [
          {
            source: "GREENHOUSE",
            token: "notion",
            status: "error",
            jobsCount: 0,
            attemptCount: 2,
            retryCount: 1,
            durationMs: 1832,
            providerErrorKind: "provider_http_error",
            httpStatus: 503,
            errorMessage: "Greenhouse: 503",
          },
        ],
      })
    );

    const attempt = view.rows[0].attempts[0];
    expect(attempt.providerErrorKind).toBe("provider_http_error");
    expect(attempt.httpStatus).toBe(503);
    expect(attempt.attemptCount).toBe(2);
    expect(attempt.retryCount).toBe(1);
    expect(attempt.durationMs).toBe(1832);
  });

  test("keeps not_attempted_after_match and not_applicable distinct", () => {
    const view = buildProviderDiagnosticsView(
      makeResult({
        sourceInputMode: "supported_source_input",
        requestedSourceHint: "GREENHOUSE",
        providerAttemptSummaries: [
          {
            source: "LEVER",
            status: "not_attempted_after_match",
            jobsCount: 0,
            tokensTried: [],
            errorMessages: [],
            usedForBrief: false,
            note: "Not attempted because Stratum stopped after the first provider returned openings.",
          },
          {
            source: "WORKABLE",
            status: "not_applicable",
            jobsCount: 0,
            tokensTried: [],
            errorMessages: [],
            usedForBrief: false,
            note: "Not attempted because the query specified Greenhouse directly.",
          },
        ],
      })
    );

    const lever = view.rows.find((row) => row.source === "LEVER");
    const workable = view.rows.find((row) => row.source === "WORKABLE");

    expect(lever?.statusLabel).toBe("Skipped");
    expect(workable?.statusLabel).toBe("Not checked");
    expect(lever?.note).not.toBe(workable?.note);
  });

  test("skipped provider note says the matched source already matched", () => {
    const view = buildProviderDiagnosticsView(
      makeResult({
        apiSource: "ASHBY",
        providerAttemptSummaries: [
          {
            source: "LEVER",
            status: "not_attempted_after_match",
            jobsCount: 0,
            tokensTried: [],
            errorMessages: [],
            usedForBrief: false,
            note: undefined as unknown as string,
          },
        ],
      })
    );
    const lever = view.rows.find((row) => row.source === "LEVER");
    expect(lever?.note).toBe("Skipped. Ashby already matched.");
  });

  test("skipped providers do not expose scan attempt rows", () => {
    const view = buildProviderDiagnosticsView(
      makeResult({
        apiSource: "ASHBY",
        providerAttemptSummaries: [
          {
            source: "GREENHOUSE",
            status: "not_attempted_after_match",
            jobsCount: 0,
            tokensTried: [],
            errorMessages: [],
            usedForBrief: false,
            note: "Not attempted because Stratum stopped after the first provider returned openings.",
          },
        ],
        providerAttempts: [
          {
            source: "GREENHOUSE",
            token: "",
            status: "not_attempted_after_match",
            jobsCount: 0,
            attemptCount: 1,
            retryCount: 0,
            durationMs: 10,
            providerErrorKind: "none",
          },
        ],
      })
    );

    const greenhouse = view.rows.find((row) => row.source === "GREENHOUSE");
    expect(greenhouse?.note).toBe("Skipped. Ashby already matched.");
    expect(greenhouse?.attempts).toHaveLength(0);
  });

  test("not-applicable provider note says 'Not checked for this input.'", () => {
    const view = buildProviderDiagnosticsView(
      makeResult({
        providerAttemptSummaries: [
          {
            source: "WORKABLE",
            status: "not_applicable",
            jobsCount: 0,
            tokensTried: [],
            errorMessages: [],
            usedForBrief: false,
            note: undefined as unknown as string,
          },
        ],
      })
    );
    const workable = view.rows.find((row) => row.source === "WORKABLE");
    expect(workable?.note).toBe("Not checked for this input.");
  });

  test("renders legacy briefs without provider diagnostics safely", () => {
    const view = buildProviderDiagnosticsView(makeResult());
    expect(view.hasDiagnostics).toBe(false);
    expect(view.rows).toHaveLength(0);
  });
});
