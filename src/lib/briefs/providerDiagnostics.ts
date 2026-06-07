import { formatSourceLabel } from "@/lib/briefs/presentation";
import type { FetchAttempt, FetchAttemptStatus, JobBoardSource } from "@/lib/api/boards";
import type { ProviderAttemptSummary, StratumResult } from "@/lib/services/StratumInvestigator";

const SOURCE_ORDER: JobBoardSource[] = ["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"];

export interface ProviderDiagnosticsAttemptView {
  status: FetchAttemptStatus;
  statusLabel: string;
  providerErrorKind: string | null;
  httpStatus: number | null;
  attemptCount: number | null;
  retryCount: number | null;
  durationMs: number | null;
}

export interface ProviderDiagnosticsRowView {
  source: JobBoardSource;
  sourceLabel: string;
  status: FetchAttemptStatus;
  statusLabel: string;
  jobsCount: number;
  usedForBrief: boolean;
  note: string;
  attempts: ProviderDiagnosticsAttemptView[];
}

export interface ProviderDiagnosticsView {
  rows: ProviderDiagnosticsRowView[];
  hasDiagnostics: boolean;
}

type ProviderDiagnosticsResult = Pick<
  StratumResult,
  "apiSource" | "sourceInputMode" | "requestedSourceHint"
> & {
  providerAttempts?: FetchAttempt[] | null;
  providerAttemptSummaries?: ProviderAttemptSummary[] | null;
};

function getProviderStatusLabel(status: FetchAttemptStatus): string {
  switch (status) {
    case "jobs_found":
      return "Jobs found";
    case "zero_jobs":
      return "Zero jobs";
    case "not_found":
      return "Not found";
    case "error":
      return "Error";
    case "not_applicable":
      return "Not checked";
    case "not_attempted_after_match":
      return "Skipped";
  }

  return status;
}

function getProviderStatusFromAttempts(attempts: FetchAttempt[]): FetchAttemptStatus | null {
  const statuses = attempts.map((attempt) => attempt.status);
  if (statuses.includes("jobs_found")) return "jobs_found";
  if (statuses.includes("zero_jobs")) return "zero_jobs";
  if (statuses.includes("error")) return "error";
  if (statuses.includes("not_found")) return "not_found";
  if (statuses.includes("not_attempted_after_match")) return "not_attempted_after_match";
  if (statuses.includes("not_applicable")) return "not_applicable";
  return null;
}

function getProviderNote(args: {
  status: FetchAttemptStatus;
  jobsCount: number;
  matchedSource: JobBoardSource | null | undefined;
  sourceInputMode: StratumResult["sourceInputMode"] | undefined;
  requestedSourceHint: StratumResult["requestedSourceHint"] | undefined;
}): string {
  const { status, jobsCount, matchedSource, sourceInputMode, requestedSourceHint } = args;

  switch (status) {
    case "jobs_found":
      return `Returned ${jobsCount} observed open role${jobsCount === 1 ? "" : "s"} and anchors this brief.`;
    case "zero_jobs":
      return "Matched this provider but observed zero current openings there at fetch time.";
    case "not_found":
      return "No supported board or token match was confirmed on this provider.";
    case "error":
      return "This provider request failed during the search.";
    case "not_applicable":
      return sourceInputMode === "supported_source_input" && requestedSourceHint
        ? `Not checked. Query pointed directly to ${formatSourceLabel(requestedSourceHint)}.`
        : "Not checked for this input.";
    case "not_attempted_after_match":
      return matchedSource
        ? `Skipped. ${formatSourceLabel(matchedSource)} already matched.`
        : "Skipped. Another source already matched.";
  }

  return "No provider diagnostics were stored for this brief.";
}

function getNumericValue(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getProviderAttemptView(attempt: FetchAttempt): ProviderDiagnosticsAttemptView {
  return {
    status: attempt.status,
    statusLabel: getProviderStatusLabel(attempt.status),
    providerErrorKind:
      typeof attempt.providerErrorKind === "string" && attempt.providerErrorKind !== "none"
        ? attempt.providerErrorKind
        : null,
    httpStatus: getNumericValue(attempt.httpStatus),
    attemptCount: getNumericValue(attempt.attemptCount),
    retryCount: getNumericValue(attempt.retryCount),
    durationMs: getNumericValue(attempt.durationMs),
  };
}

export function buildProviderDiagnosticsView(result: ProviderDiagnosticsResult): ProviderDiagnosticsView {
  const providerAttemptSummaries = Array.isArray(result.providerAttemptSummaries)
    ? result.providerAttemptSummaries
    : [];
  const providerAttempts = Array.isArray(result.providerAttempts) ? result.providerAttempts : [];

  const rows = SOURCE_ORDER.flatMap((source) => {
    const summary = providerAttemptSummaries.find((item) => item.source === source) ?? null;
    const attempts = providerAttempts.filter((attempt) => attempt.source === source);

    if (!summary && attempts.length === 0) {
      return [];
    }

    const status =
      summary?.status ??
      getProviderStatusFromAttempts(attempts) ??
      "not_applicable";
    const jobsCount =
      typeof summary?.jobsCount === "number"
        ? summary.jobsCount
        : attempts.reduce((max, attempt) => Math.max(max, attempt.jobsCount), 0);
    const usedForBrief =
      typeof summary?.usedForBrief === "boolean"
        ? summary.usedForBrief
        : result.apiSource === source && (status === "jobs_found" || status === "zero_jobs");
    const note =
      status === "not_attempted_after_match"
        ? getProviderNote({
            status,
            jobsCount,
            matchedSource: result.apiSource,
            sourceInputMode: result.sourceInputMode,
            requestedSourceHint: result.requestedSourceHint,
          })
        : summary?.note ??
          getProviderNote({
            status,
            jobsCount,
            matchedSource: result.apiSource,
            sourceInputMode: result.sourceInputMode,
            requestedSourceHint: result.requestedSourceHint,
          });
    const actualAttempts = attempts.filter(
      (attempt) =>
        attempt.status !== "not_attempted_after_match" && attempt.status !== "not_applicable"
    );

    return [
      {
        source,
        sourceLabel: formatSourceLabel(source),
        status,
        statusLabel: getProviderStatusLabel(status),
        jobsCount,
        usedForBrief,
        note,
        attempts: actualAttempts.map(getProviderAttemptView),
      },
    ];
  });

  return {
    rows,
    hasDiagnostics: rows.length > 0,
  };
}
