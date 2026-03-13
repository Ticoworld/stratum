"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Database,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { SystemStatusBar } from "@/components/ui/SystemStatusBar";
import {
  describeArtifactStatus,
  type ReportArtifactStatus,
} from "@/lib/artifacts/status";
import {
  presentCompanyResolution,
  presentDataMode,
  presentProviderName,
  presentRunStatus,
  presentSnapshotStatus,
} from "@/lib/reports/presentation";

type SessionSummary = {
  name?: string | null;
  email: string;
  role: string;
  tenantId: string;
};

type ReportRunStatus =
  | "queued"
  | "claimed"
  | "resolving"
  | "fetching"
  | "normalizing"
  | "analyzing"
  | "validating"
  | "publishing"
  | "completed"
  | "completed_partial"
  | "completed_zero_data"
  | "failed"
  | "needs_resolution";

export type ReportRunResponse = {
  id: string;
  companyId: string;
  requestedCompanyName: string;
  companyDisplayName: string;
  companyResolutionStatus: string;
  status: ReportRunStatus;
  attemptCount: number;
  asOfTime: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  normalizedJobCount: number;
  sourceSnapshots: Array<{
    provider: string;
    status: string;
    httpStatus: number | null;
    fetchedAt: string | null;
    recordCount: number;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  normalizedJobs: Array<{
    provider: string;
    title: string;
    department: string | null;
    location: string | null;
    jobUrl: string | null;
    updatedAt: string | null;
  }>;
  reportVersionId: string | null;
  reportVersion: {
    id: string;
    status: string;
    versionNumber: number;
    generatedAt: string;
    publishedAt: string | null;
    artifactAvailability: {
      html: boolean;
      pdf: boolean;
    };
    artifactStatus: {
      html: ReportArtifactStatus;
      pdf: ReportArtifactStatus;
    };
  } | null;
};

type ReportListItem = {
  reportVersionId: string;
  companyDisplayName: string;
  status: string;
  versionNumber: number;
  templateVersion: string;
  generatedAt: string;
  publishedAt: string | null;
  runStatus: string;
  dataMode: "completed" | "partial-data" | "zero-data";
  artifactAvailability: {
    html: boolean;
    pdf: boolean;
  };
  artifactStatus: {
    html: ReportArtifactStatus;
    pdf: ReportArtifactStatus;
  };
};

type TruthConsoleProps = {
  session: SessionSummary;
  initialReportRunId?: string;
  initialReportRun?: ReportRunResponse | null;
  statusOnly?: boolean;
};

const TERMINAL_RUN_STATUSES = new Set<ReportRunStatus>([
  "completed",
  "completed_partial",
  "completed_zero_data",
  "failed",
  "needs_resolution",
]);

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeStatus(run: ReportRunResponse | null) {
  if (!run) {
    return "No report run selected";
  }

  if (run.status === "completed_partial") {
    return "Published with partial provider coverage";
  }

  if (run.status === "completed_zero_data") {
    return "Published with no active roles observed";
  }

  if (run.status === "needs_resolution") {
    return "No supported hiring board could be confirmed automatically";
  }

  return presentRunStatus(run.status);
}

function getStatusTone(status: ReportRunStatus) {
  if (status === "completed" || status === "completed_partial" || status === "completed_zero_data") {
    return {
      border: "rgba(59,130,246,0.35)",
      background: "rgba(59,130,246,0.14)",
      color: "#bfdbfe",
    };
  }

  if (status === "failed" || status === "needs_resolution") {
    return {
      border: "rgba(248,113,113,0.35)",
      background: "rgba(127,29,29,0.35)",
      color: "#fecaca",
    };
  }

  return {
    border: "var(--border)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--foreground)",
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | {
        error?: string;
      }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && payload.error
        ? payload.error
        : "Request failed.";
    throw new Error(message);
  }

  return payload as T;
}

export function TruthConsole({
  session,
  initialReportRunId,
  initialReportRun = null,
  statusOnly = false,
}: TruthConsoleProps) {
  const [companyName, setCompanyName] = useState("");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(Boolean(initialReportRunId && !initialReportRun));
  const [reportsLoading, setReportsLoading] = useState(!statusOnly);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialReportRunId ?? null);
  const [activeRun, setActiveRun] = useState<ReportRunResponse | null>(initialReportRun);
  const [recentReports, setRecentReports] = useState<ReportListItem[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const runRequestInFlightRef = useRef(false);
  const [ensurePdfState, setEnsurePdfState] = useState<{
    reportVersionId: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  async function refreshReports() {
    if (statusOnly) {
      return;
    }

    setReportsLoading(true);

    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      const payload = await parseJsonResponse<{ reports: ReportListItem[] }>(response);
      setRecentReports(payload.reports);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to load reports.");
    } finally {
      setReportsLoading(false);
    }
  }

  const refreshReportsEvent = useEffectEvent(async () => {
    await refreshReports();
  });

  const refreshRunEvent = useEffectEvent(async (runId: string, preserveLoading = false) => {
    return refreshRun(runId, preserveLoading);
  });

  async function refreshRun(runId: string, preserveLoading = false) {
    if (runRequestInFlightRef.current) {
      return activeRun;
    }

    if (!preserveLoading) {
      setRunLoading(true);
    }
    runRequestInFlightRef.current = true;

    try {
      const response = await fetch(`/api/report-runs/${runId}`, { cache: "no-store" });
      const payload = await parseJsonResponse<ReportRunResponse>(response);
      setActiveRun(payload);
      setRequestError(null);
      return payload;
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to load report run.");
      return null;
    } finally {
      runRequestInFlightRef.current = false;
      if (!preserveLoading) {
        setRunLoading(false);
      }
    }
  }

  async function handleCreateReportRun(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmedName = companyName.trim();

    if (!trimmedName) {
      setRequestError("Company name is required.");
      return;
    }

    setCreateLoading(true);
    setRequestError(null);

    try {
      const response = await fetch("/api/report-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyName: trimmedName,
          websiteDomain: websiteDomain.trim() || undefined,
        }),
      });

      const payload = await parseJsonResponse<{
        reportRunId: string;
      }>(response);

      setActiveRunId(payload.reportRunId);
      await refreshRun(payload.reportRunId);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to create report run.");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEnsurePdf(reportVersionId: string) {
    setEnsurePdfState({
      reportVersionId,
      loading: true,
      error: null,
    });

    try {
      const response = await fetch(
        `/api/reports/${reportVersionId}/artifacts/pdf/ensure`,
        {
          method: "POST",
        }
      );

      await parseJsonResponse(response);
      await Promise.all([refreshReports(), activeRunId ? refreshRun(activeRunId, true) : Promise.resolve(null)]);
      setEnsurePdfState({
        reportVersionId,
        loading: false,
        error: null,
      });
    } catch (error) {
      setEnsurePdfState({
        reportVersionId,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to generate PDF.",
      });
    }
  }

  useEffect(() => {
    if (!statusOnly) {
      void refreshReportsEvent();
    }
  }, [statusOnly]);

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    if (activeRun?.id === activeRunId) {
      return;
    }

    void refreshRunEvent(activeRunId);
  }, [activeRun, activeRunId]);

  useEffect(() => {
    if (!activeRunId || !activeRun || TERMINAL_RUN_STATUSES.has(activeRun.status)) {
      return;
    }

    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }

    const intervalMs =
      activeRun.status === "queued" || activeRun.status === "claimed" ? 15000 : 10000;

    const interval = window.setInterval(() => {
      void refreshRunEvent(activeRunId, true);
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [activeRun, activeRunId]);

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshRunEvent(activeRunId, true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [activeRunId]);

  useEffect(() => {
    if (!activeRun || !TERMINAL_RUN_STATUSES.has(activeRun.status)) {
      return;
    }

    if (!statusOnly) {
      void refreshReportsEvent();
    }
  }, [activeRun, statusOnly]);

  const activeDataMode =
    activeRun?.status === "completed_zero_data"
      ? "zero-data"
      : activeRun?.status === "completed_partial"
        ? "partial-data"
        : activeRun?.status === "completed"
          ? "completed"
          : null;

  const activeTone = activeRun ? getStatusTone(activeRun.status) : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8">
        <header className="border-b pb-6" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p
                className="font-data text-[11px] uppercase tracking-[0.24em]"
                style={{ color: "var(--accent)" }}
              >
                Immutable hiring reports
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Request a report, follow its progress, and open the published deliverables.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                Reports are issued from stored hiring snapshots and remain stable once published. Artifact
                availability below reflects the actual published report state.
              </p>
            </div>

            <div
              className="rounded-2xl border px-4 py-3 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p style={{ color: "var(--foreground-secondary)" }}>Signed in as</p>
              <p className="mt-1 font-medium text-white">{session.name ?? session.email}</p>
              <p className="font-data text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--foreground-muted)" }}>
                {session.role}
              </p>
            </div>
          </div>
        </header>

        {requestError ? (
          <div
            className="mt-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm"
            style={{
              borderColor: "rgba(248,113,113,0.35)",
              background: "rgba(127,29,29,0.2)",
              color: "#fecaca",
            }}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{requestError}</p>
          </div>
        ) : null}

        <div className={`mt-8 grid gap-6 ${statusOnly ? "grid-cols-1" : "lg:grid-cols-[1.1fr_0.9fr]"}`}>
          {!statusOnly ? (
            <section
              className="rounded-3xl border p-6"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-data text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>
                    Create report
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Create a point-in-time report</h2>
                </div>
                <Database className="h-5 w-5" style={{ color: "var(--foreground-muted)" }} />
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleCreateReportRun}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white">Company name</span>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                      style={{ color: "var(--foreground-muted)" }}
                    />
                    <input
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Airbnb"
                      className="w-full rounded-2xl border px-10 py-3 text-sm outline-none"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--background)",
                        color: "var(--foreground)",
                      }}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white">Website domain (optional)</span>
                  <input
                    value={websiteDomain}
                    onChange={(event) => setWebsiteDomain(event.target.value)}
                    placeholder="airbnb.com"
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--background)",
                      color: "var(--foreground)",
                    }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={createLoading}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Create report run
                </button>
              </form>

              <div className="mt-6 grid gap-3 text-sm md:grid-cols-3">
                {[
                  "Queued runs are executed by the worker against frozen provider inputs.",
                  "Published reports are opened from stored report versions only.",
                  "HTML and PDF availability reflect real artifact state, not placeholders.",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border p-4 leading-6"
                    style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section
            className="rounded-3xl border p-6"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-data text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>
                  Active status
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  {activeRun ? activeRun.companyDisplayName : "Select or create a report run"}
                </h2>
              </div>
              {activeRunId ? (
                <button
                  type="button"
                  onClick={() => void refreshRun(activeRunId)}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>
              ) : null}
            </div>

            {!activeRunId ? (
              <div
                className="mt-6 rounded-2xl border p-5 text-sm leading-6"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                No report is active yet. Create one from the home page form to track progress and published
                artifacts in one place.
              </div>
            ) : runLoading && !activeRun ? (
              <div className="mt-6 flex items-center gap-3 text-sm" style={{ color: "var(--foreground-secondary)" }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading report run status…
              </div>
            ) : activeRun ? (
              <div className="mt-6 space-y-6">
                <div
                  className="rounded-2xl border p-5"
                  style={{
                    borderColor: activeTone?.border ?? "var(--border)",
                    background: activeTone?.background ?? "var(--surface)",
                  }}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-data text-[11px] uppercase tracking-[0.2em]" style={{ color: activeTone?.color }}>
                        {presentRunStatus(activeRun.status)}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">{formatRelativeStatus(activeRun)}</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                        Requested {formatDate(activeRun.createdAt)} · as of {formatDate(activeRun.asOfTime)}
                      </p>
                    </div>

                    <div className="grid gap-2 text-sm md:text-right" style={{ color: "var(--foreground-secondary)" }}>
                      <p>Attempts: {activeRun.attemptCount}</p>
                      <p>Normalized jobs: {activeRun.normalizedJobCount}</p>
                      <p>Coverage: {presentDataMode(activeDataMode)}</p>
                    </div>
                  </div>

                  {activeRun.failureMessage ? (
                    <p className="mt-4 text-sm leading-6" style={{ color: "#fecaca" }}>
                      {activeRun.failureMessage}
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-3">
                    {!statusOnly ? (
                      <Link
                        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-white"
                        style={{ borderColor: "var(--border)" }}
                        href={`/report-runs/${activeRun.id}`}
                      >
                        Open status page
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    ) : null}

                    {activeRun.reportVersion ? (
                      <Link
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white"
                        style={{ background: "var(--accent)" }}
                        href={`/reports/${activeRun.reportVersion.id}`}
                      >
                        Open published report
                        <FileText className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {[
                      { label: "Started", value: formatDate(activeRun.startedAt) },
                      { label: "Completed", value: formatDate(activeRun.completedAt) },
                      { label: "Company status", value: presentCompanyResolution(activeRun.companyResolutionStatus) },
                    ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border p-4"
                      style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                    >
                      <p className="font-data text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--foreground-muted)" }}>
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm text-white">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div
                  className="rounded-2xl border p-5"
                  style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">Artifacts</h3>
                      <p className="mt-1 text-sm" style={{ color: "var(--foreground-secondary)" }}>
                        Availability reflects the stored published artifact state.
                      </p>
                    </div>
                    {activeRun.reportVersion ? (
                      <p className="text-sm" style={{ color: "var(--foreground-secondary)" }}>
                        Version {activeRun.reportVersion.versionNumber}
                      </p>
                    ) : null}
                  </div>

                  {activeRun.reportVersion ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <ArtifactCard
                          status={activeRun.reportVersion.artifactStatus.html}
                          href={`/api/reports/${activeRun.reportVersion.id}/artifacts/html`}
                          label="Web report"
                        />
                        <ArtifactCard
                          status={activeRun.reportVersion.artifactStatus.pdf}
                          href={`/api/reports/${activeRun.reportVersion.id}/artifacts/pdf`}
                          label="PDF report"
                        />
                      </div>

                      {activeRun.reportVersion.artifactStatus.pdf !== "available" ? (
                        <div className="flex flex-wrap items-center gap-3">
                          {activeRun.reportVersion.artifactStatus.pdf === "queued" ||
                          activeRun.reportVersion.artifactStatus.pdf === "rendering" ? (
                            <p className="text-sm" style={{ color: "var(--foreground-secondary)" }}>
                              PDF is being prepared automatically.
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleEnsurePdf(activeRun.reportVersion!.id)}
                              disabled={ensurePdfState?.loading && ensurePdfState.reportVersionId === activeRun.reportVersion.id}
                              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-white disabled:opacity-50"
                              style={{ borderColor: "var(--border)" }}
                            >
                              {ensurePdfState?.loading && ensurePdfState.reportVersionId === activeRun.reportVersion.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileDown className="h-4 w-4" />
                              )}
                              {activeRun.reportVersion.artifactStatus.pdf === "failed" ? "Retry PDF generation" : "Generate PDF now"}
                            </button>
                          )}
                          {ensurePdfState?.reportVersionId === activeRun.reportVersion.id && ensurePdfState.error ? (
                            <p className="text-sm" style={{ color: "#fecaca" }}>
                              {ensurePdfState.error}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                      No published report version exists yet for this run.
                    </p>
                  )}
                </div>

                <div
                  className="rounded-2xl border p-5"
                  style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                >
                  <h3 className="text-base font-semibold text-white">Source coverage</h3>
                  {activeRun.sourceSnapshots.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {activeRun.sourceSnapshots.map((snapshot) => (
                        <div
                          key={`${snapshot.provider}-${snapshot.fetchedAt ?? snapshot.status}`}
                          className="rounded-2xl border px-4 py-3 text-sm"
                          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.14)" }}
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <p className="font-medium text-white">{presentProviderName(snapshot.provider)}</p>
                            <p style={{ color: "var(--foreground-secondary)" }}>
                              {presentSnapshotStatus(snapshot.status)} · {snapshot.recordCount} roles
                            </p>
                          </div>
                          <p className="mt-2 leading-6" style={{ color: "var(--foreground-secondary)" }}>
                            Fetched {formatDate(snapshot.fetchedAt)}
                            {snapshot.httpStatus ? ` · HTTP ${snapshot.httpStatus}` : ""}
                            {snapshot.errorMessage ? ` · ${snapshot.errorMessage}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                      No provider snapshot records have been persisted for this run yet.
                    </p>
                  )}
                </div>

                <div
                  className="rounded-2xl border p-5"
                  style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                >
                  <h3 className="text-base font-semibold text-white">Sample captured roles</h3>
                  {activeRun.normalizedJobs.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {activeRun.normalizedJobs.slice(0, 5).map((job) => (
                        <div
                          key={`${job.provider}-${job.title}-${job.updatedAt ?? "job"}`}
                          className="rounded-2xl border px-4 py-3 text-sm"
                          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.14)" }}
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <p className="font-medium text-white">{job.title}</p>
                            <p style={{ color: "var(--foreground-secondary)" }}>{presentProviderName(job.provider)}</p>
                          </div>
                          <p className="mt-2 leading-6" style={{ color: "var(--foreground-secondary)" }}>
                            {(job.department ?? "Unknown department") + " · " + (job.location ?? "Unknown location")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                      No normalized jobs have been persisted for this run yet.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        {!statusOnly ? (
          <section className="mt-6 rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-data text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>
                  Published reports
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">Stored report versions</h2>
              </div>
              {reportsLoading ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground-secondary)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading
                </div>
              ) : null}
            </div>

            {recentReports.length > 0 ? (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead style={{ color: "var(--foreground-muted)" }}>
                    <tr>
                      <th className="pb-3 pr-6 font-medium">Company</th>
                      <th className="pb-3 pr-6 font-medium">Published</th>
                      <th className="pb-3 pr-6 font-medium">Data mode</th>
                      <th className="pb-3 pr-6 font-medium">Artifacts</th>
                      <th className="pb-3 font-medium">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReports.map((report) => (
                      <tr key={report.reportVersionId} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-4 pr-6">
                          <p className="font-medium text-white">{report.companyDisplayName}</p>
                          <p style={{ color: "var(--foreground-secondary)" }}>Version {report.versionNumber}</p>
                        </td>
                        <td className="py-4 pr-6" style={{ color: "var(--foreground-secondary)" }}>
                          {formatDate(report.publishedAt ?? report.generatedAt)}
                        </td>
                        <td className="py-4 pr-6">
                          <span
                            className="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em]"
                            style={{
                              borderColor: "var(--border)",
                              color: report.dataMode === "completed" ? "#bfdbfe" : "var(--foreground-secondary)",
                            }}
                          >
                            {presentDataMode(report.dataMode)}
                          </span>
                        </td>
                        <td className="py-4 pr-6" style={{ color: "var(--foreground-secondary)" }}>
                          Web report {describeArtifactStatus(report.artifactStatus.html)} · PDF {describeArtifactStatus(report.artifactStatus.pdf)}
                        </td>
                        <td className="py-4">
                          <div className="flex flex-wrap gap-3">
                            <Link className="text-white underline underline-offset-4" href={`/reports/${report.reportVersionId}`}>
                              Report
                            </Link>
                            {report.artifactAvailability.html ? (
                              <Link
                                className="underline underline-offset-4"
                                style={{ color: "var(--foreground-secondary)" }}
                                href={`/api/reports/${report.reportVersionId}/artifacts/html`}
                              >
                                HTML
                              </Link>
                            ) : null}
                            {report.artifactAvailability.pdf ? (
                              <Link
                                className="underline underline-offset-4"
                                style={{ color: "var(--foreground-secondary)" }}
                                href={`/api/reports/${report.reportVersionId}/artifacts/pdf`}
                              >
                                PDF
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="mt-6 rounded-2xl border p-5 text-sm leading-6"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                No published report versions exist yet for this tenant.
              </div>
            )}
          </section>
        ) : null}

        <SystemStatusBar
          reportStatus={activeRun ? presentRunStatus(activeRun.status) : null}
          dataMode={activeDataMode}
          htmlStatus={activeRun?.reportVersion?.artifactStatus.html ?? null}
          pdfStatus={activeRun?.reportVersion?.artifactStatus.pdf ?? null}
          inline={false}
        />
      </main>
    </div>
  );
}

function ArtifactCard({
  status,
  href,
  label,
}: {
  status: ReportArtifactStatus;
  href: string;
  label: string;
}) {
  const available = status === "available";
  const description = describeArtifactStatus(status);

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.14)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-white">{label}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--foreground-secondary)" }}>
            {description}
          </p>
        </div>
        {available ? (
          <Link className="inline-flex items-center gap-2 text-sm text-white underline underline-offset-4" href={href}>
            Open
            <ExternalLink className="h-4 w-4" />
          </Link>
        ) : (
          <Clock3 className="h-4 w-4" style={{ color: "var(--foreground-muted)" }} />
        )}
      </div>
    </div>
  );
}
