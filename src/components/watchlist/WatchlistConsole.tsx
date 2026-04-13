"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WatchlistEntriesTable } from "@/components/watchlist/WatchlistEntriesTable";
import { WatchlistEntryInspectionPanel } from "@/components/watchlist/WatchlistEntryInspectionPanel";
import { WatchlistWorkspaceSidebar } from "@/components/watchlist/WatchlistWorkspaceSidebar";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { formatWatchlistTargetIdentity } from "@/lib/watchlists/identity";
import {
  buildWatchlistSourceGrounding,
  formatWatchlistDateTime,
  formatWatchlistMetadataLine,
  formatWatchlistStateHeadline,
} from "@/lib/watchlists/presentation";
import type { WatchlistEntryDetail, WatchlistOverview } from "@/lib/watchlists/repository";

interface WatchlistConsoleProps {
  initialWatchlists: WatchlistOverview[];
  automationStatus: StratumScheduledAutomationStatus;
  activeWatchlistId: string | null;
  activeEntryId: string | null;
  activeEntryDetail: WatchlistEntryDetail | null;
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
  const [pendingRefreshId, setPendingRefreshId] = useState<string | null>(null);
  const [pendingScheduleSave, setPendingScheduleSave] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState(activeEntryDetail?.entry.scheduleCadence ?? "off");
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeWatchlist =
    initialWatchlists.find((watchlist) => watchlist.id === activeWatchlistId) ?? initialWatchlists[0] ?? null;

  useEffect(() => {
    setScheduleCadence(activeEntryDetail?.entry.scheduleCadence ?? "off");
  }, [activeEntryDetail?.entry.id, activeEntryDetail?.entry.scheduleCadence]);

  useEffect(() => {
    setCurrentTime(Date.now());
  }, [activeWatchlistId, activeEntryId]);

  const scheduledEntryCount =
    activeWatchlist?.entries.filter((entry) => entry.scheduleCadence !== "off").length ?? 0;
  const dueScheduledEntryCount =
    currentTime !== null
      ? activeWatchlist?.entries.filter(
          (entry) =>
            entry.scheduleCadence !== "off" &&
            entry.scheduleNextRunAt &&
            !Number.isNaN(new Date(entry.scheduleNextRunAt).getTime()) &&
            new Date(entry.scheduleNextRunAt).getTime() <= currentTime
        ).length ?? 0
      : 0;
  const activeIdentity = activeEntryDetail
    ? formatWatchlistTargetIdentity(
        activeEntryDetail.entry.requestedQuery,
        activeEntryDetail.monitoring.latestMatchedCompanyName ?? activeEntryDetail.latestBrief?.matchedCompanyName ?? null
      )
    : null;
  const activeSourceGrounding = activeEntryDetail
    ? buildWatchlistSourceGrounding({
        requestedQuery: activeEntryDetail.entry.requestedQuery,
        matchedCompanyName:
          activeEntryDetail.monitoring.latestMatchedCompanyName ??
          activeEntryDetail.latestBrief?.matchedCompanyName ??
          null,
        atsSourceUsed:
          activeEntryDetail.monitoring.latestStateAtsSourceUsed ??
          activeEntryDetail.monitoring.latestAtsSourceUsed,
      })
    : null;
  const activeStateHeadline = activeEntryDetail
    ? formatWatchlistStateHeadline({
        watchlistReadLabel: activeEntryDetail.monitoring.latestStateWatchlistReadLabel,
        resultState: activeEntryDetail.monitoring.latestStateResultState,
        fallback: "No current state",
      })
    : null;
  const activeFreshness = activeEntryDetail
    ? formatWatchlistDateTime(
        activeEntryDetail.monitoring.lastRefreshedAt ?? activeEntryDetail.monitoring.lastMonitoringAttemptAt,
        "No saved brief yet"
      )
    : null;

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
      router.push(`/watchlists?watchlistId=${data.data.watchlist.id}&entryId=${data.data.entry.id}`);
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
      router.push(`/watchlists?watchlistId=${activeWatchlist.id}`);
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

  const handleRefreshEntry = async (entryId: string) => {
    if (!activeWatchlist) return;

    const entry = activeWatchlist.entries.find((candidate) => candidate.id === entryId);
    if (!entry) return;

    setPendingRefreshId(entryId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/analyze-unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: entry.requestedQuery,
          watchlistEntryId: entry.id,
          forceRefresh: true,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Tracked company could not be refreshed.");
        return;
      }

      setMessage(`Refreshed "${entry.requestedQuery}".`);
      router.refresh();
    } catch {
      setError("Tracked company could not be refreshed.");
    } finally {
      setPendingRefreshId(null);
    }
  };

  const handleSaveSchedule = async () => {
    if (!activeWatchlist || !activeEntryDetail) return;

    setPendingScheduleSave(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/watchlists/${activeWatchlist.id}/entries/${activeEntryDetail.entry.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduleCadence }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Schedule could not be updated.");
        return;
      }

      setMessage(
        scheduleCadence === "off"
          ? "Scheduled refresh disabled for this tracked entry."
          : `Scheduled refresh set to ${scheduleCadence}.`
      );
      router.refresh();
    } catch {
      setError("Schedule could not be updated.");
    } finally {
      setPendingScheduleSave(false);
    }
  };

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-6 lg:py-6">
        {(message || error) && (
          <div
            className="mb-5 rounded-2xl border px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--surface)",
              borderColor: error ? "#fca5a5" : "var(--border)",
              color: error ? "#b91c1c" : "var(--foreground-secondary)",
            }}
          >
            {error ?? message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)]">
          <WatchlistWorkspaceSidebar
            watchlists={initialWatchlists}
            activeWatchlistId={activeWatchlistId}
            activeWatchlist={activeWatchlist}
            automationStatus={automationStatus}
            dueScheduledEntryCount={dueScheduledEntryCount}
            newWatchlistName={newWatchlistName}
            setNewWatchlistName={setNewWatchlistName}
            pendingCreate={pendingCreate}
            onCreateWatchlist={handleCreateWatchlist}
            newQuery={newQuery}
            setNewQuery={setNewQuery}
            pendingAdd={pendingAdd}
            onAddEntry={handleAddEntry}
            pendingScheduledRun={pendingScheduledRun}
            onRunDueScheduledRefreshes={handleRunDueScheduledRefreshes}
          />

          <section className="min-w-0 space-y-6">
            <header
              className="rounded-[24px] border bg-[var(--surface)] px-6 py-5 lg:px-7 lg:py-6"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
                    Company watchlist
                  </p>
                  <h1
                    className="mt-2.5 text-[1.85rem] font-semibold tracking-[-0.03em] lg:text-[2.15rem]"
                    style={{ color: "var(--foreground)" }}
                  >
                    {activeWatchlist?.name ?? "No watchlist selected"}
                  </h1>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                      Tracked
                    </p>
                    <p className="mt-1 text-[1.35rem] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                      {activeWatchlist?.entryCount ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                      Scheduled
                    </p>
                    <p className="mt-1 text-[1.35rem] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                      {scheduledEntryCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                      Due now
                    </p>
                    <p className="mt-1 text-[1.35rem] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                      {dueScheduledEntryCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                      Selected
                    </p>
                    <p className="mt-1 text-[1.35rem] font-semibold" style={{ color: "var(--foreground)" }}>
                      {activeEntryId ? "1 target" : "None"}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="mt-5 grid grid-cols-1 gap-4 border-t pt-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(10rem,0.9fr)_minmax(9rem,0.8fr)]"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                    Selected target
                  </p>
                  <p className="mt-1 truncate text-[1rem] font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                    {activeIdentity?.primary ?? "Select a tracked company"}
                  </p>
                  <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                    {formatWatchlistMetadataLine([
                      activeSourceGrounding?.primary,
                      activeIdentity?.secondary,
                      activeIdentity?.tertiary,
                    ]) ?? "No target selected"}
                  </p>
                </div>
                <div>
                  <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                    Current state
                  </p>
                  <p className="mt-1 text-[0.95rem] font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                    {activeStateHeadline ?? "No current state"}
                  </p>
                </div>
                <div>
                  <p className="text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                    Freshness
                  </p>
                  <p className="mt-1 text-[0.95rem] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                    {activeFreshness ?? "No saved brief yet"}
                  </p>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_22rem] 2xl:grid-cols-[minmax(0,1.8fr)_23rem]">
              <section className="min-w-0">
                <WatchlistEntriesTable
                  watchlist={activeWatchlist}
                  activeEntryId={activeEntryId}
                  pendingRemovalId={pendingRemovalId}
                  pendingRefreshId={pendingRefreshId}
                  currentTime={currentTime}
                  onRemoveEntry={handleRemoveEntry}
                  onRefreshEntry={handleRefreshEntry}
                />
              </section>

              <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
                <WatchlistEntryInspectionPanel
                  automationStatus={automationStatus}
                  detail={activeEntryDetail}
                  pendingScheduleSave={pendingScheduleSave}
                  pendingRefresh={pendingRefreshId === activeEntryDetail?.entry.id}
                  scheduleCadence={scheduleCadence}
                  setScheduleCadence={setScheduleCadence}
                  onRefreshEntry={() => {
                    if (activeEntryDetail) {
                      void handleRefreshEntry(activeEntryDetail.entry.id);
                    }
                  }}
                  onSaveSchedule={handleSaveSchedule}
                  onCloseDetail={() => {
                    if (activeWatchlist) {
                      router.push(`/watchlists?watchlistId=${activeWatchlist.id}`);
                    }
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
