"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { AnalysisSkeleton } from "@/components/ui/AnalysisSkeleton";
import { ServiceInterruptionModal } from "@/components/ui/ServiceInterruptionModal";
import { SystemStatusBar } from "@/components/ui/SystemStatusBar";
import type { JobBoardSource } from "@/lib/api/boards";

interface StratumResult {
  companyName: string;
  jobs: { title: string; location: string; department: string; updated_at: string }[];
  hiringVelocity: string;
  strategicVerdict: string;
  engineeringVsSalesRatio: string;
  keywordFindings: string[];
  notableRoles?: string[];
  summary: string;
  thoughtSummary?: string;
  analyzedAt: string;
  analysisTimeMs: number;
  apiSource?: JobBoardSource | null;
  matchedAs?: string;
}

function hiringVelocityToProgress(v: string): number {
  const lower = (v ?? "").toLowerCase().trim();
  if (!lower || lower === "—" || lower === "unknown") return 0;
  if (lower === "high") return 1;
  if (lower === "moderate" || lower === "medium") return 0.5;
  return 0.2;
}

function toTitleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const EXAMPLE_COMPANIES = ["Airbnb", "Stripe", "XAI"];

export function TruthConsole() {
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StratumResult | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [serviceInterruption, setServiceInterruption] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ title?: string; message?: string } | null>(null);

  const fetchWithRetry = async (url: string, init: RequestInit, maxAttempts = 3): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fetch(url, init);
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          throw lastError;
        }
      }
    }
    throw lastError;
  };

  const handleAnalyze = async (overrideCompany?: string) => {
    const name = (overrideCompany ?? companyName).trim();
    if (!name) return;

    if (overrideCompany) setCompanyName(overrideCompany);
    setLoading(true);
    setServiceInterruption(false);
    setErrorInfo(null);
    setResult(null);
    setCachedAt(null);

    try {
      const response = await fetchWithRetry(
        "/api/analyze-unified",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName: name }),
        },
        3
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 429) {
          setErrorInfo({
            title: "Rate Limit",
            message: data.error ?? "Too many requests. Please wait a minute and try again.",
          });
        } else {
          setErrorInfo({
            title: "Analysis Failed",
            message: data.error ?? "Analysis failed. Please try again.",
          });
        }
        setServiceInterruption(true);
        return;
      }

      setResult(data.data);
      setCachedAt(data.cached ? data.cachedAt ?? null : null);
    } catch {
      setErrorInfo(null);
      setServiceInterruption(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReconnect = () => {
    setServiceInterruption(false);
    if (companyName.trim()) handleAnalyze();
  };

  const handleReset = () => {
    setCompanyName("");
    setResult(null);
    setCachedAt(null);
    setServiceInterruption(false);
  };

  const handleExampleClick = (name: string) => handleAnalyze(name);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Top bar — search + brand */}
      <header
        className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          borderWidth: "1px",
        }}
      >
        <div className="flex items-center gap-6">
          <h1
            className="text-base font-semibold tracking-tight shrink-0 font-data"
            style={{ color: "var(--foreground)" }}
          >
            STRATUM
          </h1>
          <span
            className="text-[10px] hidden sm:inline font-data uppercase tracking-wider"
            style={{ color: "var(--foreground-muted)" }}
          >
            Corporate Intelligence
          </span>
        </div>

        <div className="flex-1 max-w-md mx-4 sm:mx-8 flex gap-2 items-end">
          <div className="relative flex-1 flex flex-col gap-1">
            {!result && !loading && (
              <label
                htmlFor="company-search"
                className="text-[10px] font-data uppercase tracking-wider shrink-0"
                style={{ color: "var(--accent)" }}
              >
                Type company name here
              </label>
            )}
            <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "var(--foreground-muted)" }}
            />
            <input
              id="company-search"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder={!result && !loading ? "Type company name (e.g. Airbnb, Stripe)" : "Company (e.g. Airbnb, Stripe)"}
              disabled={loading}
              aria-label="Company name to analyze"
              className="w-full pl-9 pr-4 py-2 rounded border text-sm font-data
                         focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors disabled:opacity-50"
              style={{
                background: "var(--background)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
            </div>
          </div>
          <button
            onClick={() => handleAnalyze()}
            disabled={loading || !companyName.trim()}
            aria-busy={loading}
            aria-label={loading ? "Analyzing" : "Reveal analysis"}
            className="px-4 py-2 rounded text-sm font-data font-medium shrink-0 flex items-center gap-2
                       cursor-pointer transition-all duration-200
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
            style={{
              background: "var(--accent)",
              color: "white",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              "REVEAL"
            )}
          </button>
        </div>
      </header>

      {/* Main HUD — Bento Grid, no scroll */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading && (
          <div className="h-full p-6">
            <AnalysisSkeleton />
          </div>
        )}

        {result && !loading && (
          <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-6 pb-4">
            {/* Zone A — VERDICT (dominant, top left) */}
            <div
              className="lg:col-span-2 flex flex-col rounded border overflow-hidden min-h-0"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                borderWidth: "1px",
              }}
            >
              <div className="p-6 flex flex-col flex-1 min-h-0 pl-7" style={{ borderLeft: "3px solid var(--accent)" }}>
                {/* 1. Company — anchor: "what am I looking at" */}
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xl font-data font-bold tracking-tight"
                      style={{ color: "var(--accent)" }}
                    >
                      {toTitleCase(result.companyName)}
                    </span>
                    {cachedAt && (
                      <span
                        className="text-[10px] font-data px-2 py-0.5 rounded"
                        style={{
                          background: "var(--accent)",
                          color: "white",
                          opacity: 0.9,
                        }}
                        title="Cached result"
                      >
                        Cached
                      </span>
                    )}
                    {result.matchedAs && (
                      <span
                        className="text-[10px] font-data px-2 py-0.5 rounded"
                        style={{
                          background: "var(--border)",
                          color: "var(--foreground-muted)",
                        }}
                        title="Resolved via alias"
                      >
                        Matched as: {result.matchedAs}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-data uppercase tracking-wider
                               transition-all duration-200 cursor-pointer border shrink-0
                               hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    style={{
                      color: "var(--foreground-muted)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <ArrowLeft className="w-3 h-3" />
                    New search
                  </button>
                </div>
                {/* 2. Verdict — main insight */}
                <h2
                  className="text-3xl lg:text-4xl font-data font-bold tracking-tight mb-4"
                  style={{ color: result.jobs.length === 0 ? "var(--foreground-muted)" : "var(--foreground)" }}
                >
                  {result.strategicVerdict}
                </h2>
                {/* 3. Summary — why */}
                <p
                  className="text-base font-data leading-relaxed overflow-y-auto"
                  style={{ color: "var(--foreground-secondary)" }}
                >
                  {result.summary}
                </p>
              </div>
            </div>

            {/* Zone C — Evidence column (right) */}
            <div
              className="flex flex-col gap-4 min-h-0 overflow-hidden"
            >
              {/* Unsupported / 0-jobs: show try-again hint */}
              {result.jobs.length === 0 && (
                <div
                  className="rounded border p-6 flex flex-col items-center justify-center min-h-[140px]"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    borderWidth: "1px",
                  }}
                >
                  <p className="text-xs font-data uppercase tracking-wider mb-3" style={{ color: "var(--foreground-muted)" }}>
                    Try a supported company
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {EXAMPLE_COMPANIES.map((name) => (
                      <button
                        key={name}
                        onClick={() => handleExampleClick(name)}
                        className="px-3 py-1.5 rounded text-xs font-data cursor-pointer transition-all duration-200
                                   hover:bg-[var(--accent)] hover:text-white"
                        style={{
                          background: "var(--border)",
                          color: "var(--foreground-secondary)",
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Strategic Signals */}
              {result.keywordFindings.length > 0 && (
                <div
                  className="rounded border flex flex-col min-h-0 overflow-hidden shrink-0"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    borderWidth: "1px",
                  }}
                >
                  <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs font-data uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                      Strategic Signals
                    </span>
                  </div>
                  <ul className="p-4 space-y-2 overflow-y-auto flex-1 min-h-0">
                    {result.keywordFindings.map((finding, i) => (
                      <li key={i} className="text-sm font-data flex items-start gap-2" style={{ color: "var(--foreground-secondary)" }}>
                        <span style={{ color: "var(--accent)" }}>•</span>
                        {finding}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Highlights (proof roles) */}
              {result.notableRoles && result.notableRoles.length > 0 && (
                <div
                  className="rounded border flex flex-col min-h-0 overflow-hidden flex-1"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    borderWidth: "1px",
                  }}
                >
                  <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs font-data uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
                      Highlights
                    </span>
                  </div>
                  <ul className="p-4 space-y-2 overflow-y-auto flex-1 min-h-0">
                    {result.notableRoles.map((role, i) => (
                      <li key={i} className="text-sm font-data" style={{ color: "var(--foreground-secondary)" }}>{role}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Zone B — Metrics (bottom left, full width on mobile) */}
            <div
              className="lg:col-span-2 lg:col-start-1 rounded border p-6 flex flex-col sm:flex-row gap-6 shrink-0"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                borderWidth: "1px",
              }}
            >
              <div className="flex-1">
                <div className="text-xs font-data uppercase tracking-wider mb-2" style={{ color: "var(--foreground-muted)" }}>
                  Hiring Velocity
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(hiringVelocityToProgress(result.hiringVelocity) * 100)}%`, background: "var(--accent)" }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs font-data" style={{ color: "var(--foreground-muted)" }}>Low</span>
                  <span className="text-xs font-data tabular-nums" style={{ color: "var(--foreground)" }}>
                    {result.hiringVelocity || "—"}
                  </span>
                  <span className="text-xs font-data" style={{ color: "var(--foreground-muted)" }}>High</span>
                </div>
              </div>
              <div
                className="sm:border-l sm:pl-6"
                style={{ borderColor: "var(--border)" }}
                title="Engineering vs Sales ratio — e.g. 2:1 means 2 engineers per 1 sales role"
              >
                <div className="text-xs font-data uppercase tracking-wider mb-1" style={{ color: "var(--foreground-muted)" }}>
                  Eng:Sales
                </div>
                <div className="text-3xl font-data tabular-nums" style={{ color: "var(--accent)" }}>
                  {result.jobs.length === 0 ? "—" : result.engineeringVsSalesRatio}
                </div>
              </div>
              <div className="sm:border-l sm:pl-6" style={{ borderColor: "var(--border)" }}>
                <div className="text-xs font-data uppercase tracking-wider mb-1" style={{ color: "var(--foreground-muted)" }}>
                  Open Roles
                </div>
                <div className="text-3xl font-data tabular-nums" style={{ color: "var(--accent)" }}>
                  {result.jobs.length}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="h-full flex flex-col items-center justify-center p-6 gap-6">
            <p className="text-sm font-data max-w-md text-center" style={{ color: "var(--foreground-secondary)" }}>
              Use the search bar above to enter a company name, then click Reveal.
            </p>
            <p className="text-xs font-data uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>Or try one:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {EXAMPLE_COMPANIES.map((name) => (
                <button
                  key={name}
                  onClick={() => handleExampleClick(name)}
                  className="px-4 py-2 rounded text-sm font-data transition-all duration-200 cursor-pointer
                             hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)]"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground-secondary)",
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer — data source, status */}
      <footer className="shrink-0 border-t" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="px-6 py-2 flex items-center justify-between gap-4 flex-wrap">
          <span className="text-xs font-data" style={{ color: "var(--foreground-muted)" }}>
            {result
              ? result.jobs.length === 0
                ? result.summary
                : `System Analysis based on ${result.jobs.length} active roles.`
              : "Data from Greenhouse & Lever. Apple, Google, Microsoft use different systems."}
            {result && (
              <span className="ml-1 opacity-80">
                · Data from Greenhouse & Lever
              </span>
            )}
          </span>
          <SystemStatusBar
            apiSource={result?.apiSource ?? undefined}
            latencyMs={result?.analysisTimeMs ?? null}
            cached={!!cachedAt}
            inline
          />
        </div>
      </footer>

      {serviceInterruption && (
        <ServiceInterruptionModal
          onReconnect={handleReconnect}
          onClose={() => {
            setServiceInterruption(false);
            setErrorInfo(null);
          }}
          title={errorInfo?.title}
          message={errorInfo?.message}
        />
      )}
    </div>
  );
}
