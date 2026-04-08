"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { WatchlistEntryHistoryPanel } from "@/components/watchlist/WatchlistEntryHistoryPanel";
import { formatSourceLabel } from "@/lib/briefs/presentation";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import type { WatchlistEntryDetail, WatchlistOverview } from "@/lib/watchlists/repository";
import { formatWatchlistScheduleCadenceLabel } from "@/lib/watchlists/schedules";

interface WatchlistConsoleProps {
  initialWatchlists: WatchlistOverview[];
  automationStatus: StratumScheduledAutomationStatus;
  activeWatchlistId: string | null;
  activeEntryId: string | null;
  activeEntryDetail: WatchlistEntryDetail | null;
}

function formatResultStateLabel(value: string | null): string {
  switch (value) {
    case "supported_provider_matched_with_observed_openings":
      return "Observed openings";
    case "supported_provider_matched_with_zero_observed_openings":
      return "Matched provider, zero openings";
    case "unsupported_ats_or_source_pattern":
      return "Unsupported source pattern";
    case "ambiguous_company_match":
      return "Ambiguous company match";
    case "provider_failure":
      return "Provider failure";
    case "no_matched_provider_found":
      return "No supported match";
    default:
      return "No saved brief yet";
  }
}

function formatConfidenceLabel(value: string | null): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
      return "None";
    default:
      return "No read yet";
  }
}

function formatDateTimeValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatScheduledNextRunValue(
  cadence: string | null | undefined,
  value: string | null | undefined
): string {
  if (cadence === "off" || !value) return "Not scheduled";

  const timestamp = new Date(value).getTime();
  if (!Number.isNaN(timestamp) && timestamp <= Date.now()) {
    return `Due now${formatDateTimeValue(value) ? ` (${formatDateTimeValue(value)})` : ""}`;
  }

  return formatDateTimeValue(value) ?? "Scheduled";
}

export function WatchlistConsole({
  initialWatchlists,
  automationStatus,
  activeWatchlistId,
  activeEntryId,
  activeEntryDetail,
}: WatchlistConsoleProps) {
  const router = useRouter();
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(false);
  const [pendingScheduledRun, setPendingScheduledRun] = useState(false);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeWatchlist =
    initialWatchlists.find((watchlist) => watchlist.id === activeWatchlistId) ?? initialWatchlists[0] ?? null;
  const scheduledEntryCount =
    activeWatchlist?.entries.filter((entry) => entry.scheduleCadence !== "off").length ?? 0;
  const dueScheduledEntryCount =
    activeWatchlist?.entries.filter(
      (entry) =>
        entry.scheduleCadence !== "off" &&
        entry.scheduleNextRunAt &&
        !Number.isNaN(new Date(entry.scheduleNextRunAt).getTime()) &&
        new Date(entry.scheduleNextRunAt).getTime() <= Date.now()
    ).length ?? 0;

  const handleCreateWatchlist = async () => {
    const name = newWatchlistName.trim();
    if (!name) return;

    setPendingCreate(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Watchlist could not be created.");
        return;
      }

      setNewWatchlistName("");
      setMessage(`Created watchlist "${data.data.watchlist.name}".`);
      router.push(`/watchlists?watchlistId=${data.data.watchlist.id}`);
    } catch {
      setError("Watchlist could not be created.");
    } finally {
      setPendingCreate(false);
    }
  };

  const handleAddEntry = async () => {
    if (!activeWatchlist) return;

    const requestedQuery = newQuery.trim();
    if (!requestedQuery) return;

    setPendingAdd(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/watchlists/${activeWatchlist.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedQuery }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Tracked company could not be added.");
        return;
      }

      setNewQuery("");
      setMessage(`Added "${data.data.entry.requestedQuery}" to ${data.data.watchlist.name}.`);
      router.refresh();
    } catch {
      setError("Tracked company could not be added.");
    } finally {
      setPendingAdd(false);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    if (!activeWatchlist) return;

    setPendingRemovalId(entryId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/watchlists/${activeWatchlist.id}/entries/${entryId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Tracked company could not be removed.");
        return;
      }

      setMessage("Tracked company removed from watchlist.");
      if (activeEntryId === entryId) {
        router.push(`/watchlists?watchlistId=${activeWatchlist.id}`);
        return;
      }

      router.refresh();
    } catch {
      setError("Tracked company could not be removed.");
    } finally {
      setPendingRemovalId(null);
    }
  };

  const handleRunDueScheduledRefreshes = async () => {
    if (!activeWatchlist) return;

    setPendingScheduledRun(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/scheduled-refreshes/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlistId: activeWatchlist.id, limit: 10 }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Due scheduled refreshes could not be executed.");
        return;
      }

      const summary = data.data;
      if (summary.processedCount > 0) {
        setMessage(
          `Ran ${summary.processedCount} due scheduled refresh${summary.processedCount === 1 ? "" : "es"} for ${activeWatchlist.name}: ${summary.savedBriefCount} saved, ${summary.unsavedCount} unsaved, ${summary.failedCount} failed.`
        );
      } else if (scheduledEntryCount > 0) {
        setMessage("No scheduled entries in this watchlist were due yet.");
      } else {
        setMessage("No scheduled entries are configured in this watchlist yet.");
      }

      router.refresh();
    } catch {
      setError("Due scheduled refreshes could not be executed.");
    } finally {
      setPendingScheduledRun(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <header
        className="border-b"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          borderWidth: "1px",
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-data uppercase tracking-[0.24em]" style={{ color: "var(--accent)" }}>
              STRATUM
            </p>
            <h1 className="mt-2 text-lg font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
              Watchlists
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              Saved tracked queries plus the latest saved point-in-time brief, previous brief reference, and
              deterministic saved-brief change summary for each entry. {automationStatus.summary} Notifications now
              appear in Stratum&apos;s in-product inbox only. No email, push, or Slack delivery exists yet.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
            <Link
              href="/notifications"
              className="inline-flex items-center gap-2 rounded border px-4 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground-secondary)",
              }}
            >
              Notifications
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded border px-4 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground-secondary)",
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              Brief Builder
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {(message || error) && (
          <div
            className="mb-4 rounded border px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--surface)",
              borderColor: error ? "#7f1d1d" : "var(--border)",
              borderWidth: "1px",
              color: error ? "#fca5a5" : "var(--foreground-secondary)",
            }}
          >
            {error ?? message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section
            className="rounded border p-5"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              borderWidth: "1px",
            }}
          >
            <h2 className="text-sm font-data uppercase tracking-[0.18em]" style={{ color: "var(--foreground)" }}>
              Saved Watchlists
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              Use one default watchlist or create separate saved lists. Each entry can now open a manual monitoring
              detail view with the current latest brief, previous brief reference, and saved-brief comparison only.
            </p>

            <div className="mt-5 space-y-2">
              {initialWatchlists.map((watchlist) => {
                const isActive = activeWatchlist?.id === watchlist.id;

                return (
                  <Link
                    key={watchlist.id}
                    href={`/watchlists?watchlistId=${watchlist.id}`}
                    className="block rounded border px-4 py-3 transition-all duration-200 hover:border-[var(--accent)]"
                    style={{
                      background: isActive ? "var(--background)" : "var(--surface)",
                      borderColor: isActive ? "var(--accent)" : "var(--border)",
                      borderWidth: "1px",
                    }}
                  >
                    <p className="text-sm font-data" style={{ color: "var(--foreground)" }}>
                      {watchlist.name}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                      {watchlist.entryCount} tracked {watchlist.entryCount === 1 ? "entry" : "entries"}
                    </p>
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--border)" }}>
              <label
                htmlFor="watchlist-name"
                className="text-[10px] font-data uppercase tracking-[0.22em]"
                style={{ color: "var(--foreground-muted)" }}
              >
                New watchlist
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="watchlist-name"
                  type="text"
                  value={newWatchlistName}
                  onChange={(event) => setNewWatchlistName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleCreateWatchlist()}
                  placeholder="Name a saved watchlist"
                  disabled={pendingCreate}
                  className="w-full rounded border px-3 py-2 text-sm font-data focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  style={{
                    background: "var(--background)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />
                <button
                  onClick={handleCreateWatchlist}
                  disabled={pendingCreate || !newWatchlistName.trim()}
                  className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-data transition-all duration-200 disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {pendingCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create
                </button>
              </div>
            </div>
          </section>

          <section
            className="rounded border p-5"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              borderWidth: "1px",
            }}
          >
            {activeWatchlist ? (
              <>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p
                      className="text-[10px] font-data uppercase tracking-[0.22em]"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      Active watchlist
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                      {activeWatchlist.name}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                      Track companies or source queries here, then open or refresh their saved briefs when you need a
                      new point-in-time read. Per-entry schedules can now be configured for due refresh execution, and
                      Stratum keeps their automation state separate from saved-brief history.
                    </p>
                  </div>
                  <div className="text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                    <p>
                      {activeWatchlist.entryCount} tracked {activeWatchlist.entryCount === 1 ? "entry" : "entries"}
                    </p>
                    <p className="mt-1">
                      {scheduledEntryCount} scheduled, {dueScheduledEntryCount} due now
                    </p>
                  </div>
                </div>

                <div
                  className="mt-5 rounded border p-4"
                  style={{
                    background: "var(--background)",
                    borderColor: "var(--border)",
                    borderWidth: "1px",
                  }}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p
                        className="text-[10px] font-data uppercase tracking-[0.22em]"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        Scheduled execution
                      </p>
                      <p className="mt-2 text-sm font-data" style={{ color: "var(--foreground)" }}>
                        {automationStatus.label}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                        {automationStatus.summary} This button still runs only the due entries in this watchlist.
                      </p>
                    </div>
                    <button
                      onClick={handleRunDueScheduledRefreshes}
                      disabled={pendingScheduledRun}
                      className="inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-data uppercase tracking-[0.18em] transition-all duration-200 disabled:opacity-40"
                      style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                    >
                      {pendingScheduledRun ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Run Due Scheduled Refreshes
                    </button>
                  </div>
                </div>

                <div className="mt-5 rounded border p-4" style={{ background: "var(--background)", borderColor: "var(--border)", borderWidth: "1px" }}>
                  <label
                    htmlFor="tracked-query"
                    className="text-[10px] font-data uppercase tracking-[0.22em]"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    Add company or query
                  </label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="tracked-query"
                      type="text"
                      value={newQuery}
                      onChange={(event) => setNewQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && handleAddEntry()}
                      placeholder="Track a company name or source query"
                      disabled={pendingAdd}
                      className="w-full rounded border px-3 py-2 text-sm font-data focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      style={{
                        background: "var(--surface)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }}
                    />
                    <button
                      onClick={handleAddEntry}
                      disabled={pendingAdd || !newQuery.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-data transition-all duration-200 disabled:opacity-40"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      {pendingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Track
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {activeWatchlist.entries.length > 0 ? (
                    activeWatchlist.entries.map((entry) => {
                      const latestBriefTime =
                        formatDateTimeValue(entry.latestBriefUpdatedAt) ?? formatDateTimeValue(entry.latestBriefCreatedAt);
                      const isSelected = activeEntryId === entry.id;

                      return (
                        <article
                          key={entry.id}
                          className="rounded border p-5"
                          style={{
                            background: "var(--background)",
                            borderColor: isSelected ? "var(--accent)" : "var(--border)",
                            borderWidth: "1px",
                          }}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p
                                className="text-[10px] font-data uppercase tracking-[0.22em]"
                                style={{ color: "var(--foreground-muted)" }}
                              >
                                Tracked query
                              </p>
                              <h3 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                                {entry.requestedQuery}
                              </h3>
                              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                                {entry.latestMatchedCompanyName
                                  ? `Latest matched company: ${entry.latestMatchedCompanyName}`
                                  : "No saved brief has been attached to this tracked query yet."}
                              </p>
                            </div>

                            <button
                              onClick={() => handleRemoveEntry(entry.id)}
                              disabled={pendingRemovalId === entry.id}
                              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-data uppercase tracking-[0.18em] transition-all duration-200 hover:border-[#b91c1c] hover:text-[#fca5a5] disabled:opacity-40"
                              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                            >
                              {pendingRemovalId === entry.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Remove
                            </button>
                          </div>

                          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {[
                              { label: "Latest result state", value: formatResultStateLabel(entry.latestResultState) },
                              {
                                label: "Latest watchlist read",
                                value: entry.latestWatchlistReadLabel ?? "No saved brief yet",
                              },
                              {
                                label: "Read confidence",
                                value: formatConfidenceLabel(entry.latestWatchlistReadConfidence),
                              },
                              {
                                label: "ATS source used",
                                value: entry.latestBriefId
                                  ? formatSourceLabel(
                                      (entry.latestAtsSourceUsed as
                                        | "GREENHOUSE"
                                        | "LEVER"
                                        | "ASHBY"
                                        | "WORKABLE"
                                        | null) ?? null
                                    )
                                  : "No saved brief yet",
                              },
                              {
                                label: "Last saved refresh",
                                value: latestBriefTime ?? "No saved brief yet",
                              },
                              {
                                label: "Schedule",
                                value: formatWatchlistScheduleCadenceLabel(entry.scheduleCadence),
                              },
                              {
                                label: "Next scheduled run",
                                value: formatScheduledNextRunValue(
                                  entry.scheduleCadence,
                                  entry.scheduleNextRunAt
                                ),
                              },
                            ].map((item) => (
                              <div
                                key={`${entry.id}-${item.label}`}
                                className="rounded border p-4"
                                style={{
                                  background: "var(--surface)",
                                  borderColor: "var(--border)",
                                  borderWidth: "1px",
                                }}
                              >
                                <p
                                  className="text-[10px] font-data uppercase tracking-[0.22em]"
                                  style={{ color: "var(--foreground-muted)" }}
                                >
                                  {item.label}
                                </p>
                                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                                  {item.value}
                                </p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-5 flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
                            <Link
                              href={`/watchlists?watchlistId=${activeWatchlist.id}&entryId=${entry.id}`}
                              className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                            >
                              Open Entry Detail
                            </Link>
                            {entry.latestBriefId ? (
                              <Link
                                href={`/briefs/${entry.latestBriefId}`}
                                className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                              >
                                Open Latest Brief
                              </Link>
                            ) : null}
                            <Link
                              href={`/?company=${encodeURIComponent(entry.requestedQuery)}&watchlistId=${activeWatchlist.id}&watchlistEntryId=${entry.id}&autorun=1&manualRefresh=1`}
                              className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                            >
                              Refresh Manually
                            </Link>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div
                      className="rounded border p-5 text-sm leading-relaxed"
                      style={{
                        background: "var(--background)",
                        borderColor: "var(--border)",
                        borderWidth: "1px",
                        color: "var(--foreground-secondary)",
                      }}
                    >
                      This watchlist is empty. Add a company or query, then run a brief when you want a new
                      point-in-time read. Scheduled refreshes can be configured per entry, and automatic execution
                      depends on a cron-enabled deployment.
                    </div>
                  )}
                </div>

                {activeWatchlist && activeEntryDetail ? (
                  <WatchlistEntryHistoryPanel
                    watchlistId={activeWatchlist.id}
                    automationStatus={automationStatus}
                    detail={activeEntryDetail}
                  />
                ) : null}
              </>
            ) : (
              <div className="text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                No watchlist is available yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
