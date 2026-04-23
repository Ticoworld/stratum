"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, ExternalLink, Plus } from "lucide-react";
import { WatchlistEntriesTable } from "@/components/watchlist/WatchlistEntriesTable";
import { WatchlistWorkspaceSidebar } from "@/components/watchlist/WatchlistWorkspaceSidebar";
import { Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast, type ToastType } from "@/components/ui/Toast";
import type { CompanyIntakeResolution } from "@/lib/watchlists/intakeResolution";
import type { JobBoardSource } from "@/lib/api/boards";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { buildWatchlistDisplayIdentity } from "@/lib/watchlists/presentation";
import type { WatchlistEntryDetail, WatchlistOverview } from "@/lib/watchlists/repository";

interface WatchlistConsoleProps {
  initialWatchlists: WatchlistOverview[];
  automationStatus: StratumScheduledAutomationStatus;
  activeWatchlistId: string | null;
  canWriteWorkspace: boolean;
}

function isValidationStyleError(value: string | null | undefined): boolean {
  const normalized = (value ?? "").toLowerCase();
  return (
    normalized.includes("company name is required") ||
    normalized.includes("name is required") ||
    normalized.includes("required company details")
  );
}

function formatActionFailureMessage(action: string, subject: string, detail?: string | null): string {
  const base = `We couldn't ${action} ${subject} right now.`;

  if (!detail) return base;
  if (isValidationStyleError(detail)) {
    return `${base} Required company details are missing.`;
  }

  const cleanedDetail = detail.trim().replace(/\.$/, "");
  if (!cleanedDetail) return base;

  return `${base} ${cleanedDetail}`;
}

function resolveTrackedSource(value: CompanyIntakeResolution): JobBoardSource | null {
  const prioritizedChoice = value.candidateChoices.find((choice) => choice.confidence === "high" && choice.source);
  if (prioritizedChoice?.source) return prioritizedChoice.source;

  const fallbackChoice = value.candidateChoices.find((choice) => choice.source);
  if (fallbackChoice?.source) return fallbackChoice.source;

  switch (value.atsProvider) {
    case "Greenhouse":
      return "GREENHOUSE";
    case "Lever":
      return "LEVER";
    case "Ashby":
      return "ASHBY";
    case "Workable":
      return "WORKABLE";
    default:
      return null;
  }
}

function upsertTrackedEntry(
  watchlists: WatchlistOverview[],
  watchlistId: string,
  nextEntry: WatchlistOverview["entries"][number]
): WatchlistOverview[] {
  return watchlists.map((watchlist) => {
    if (watchlist.id !== watchlistId) return watchlist;

    const existingIndex = watchlist.entries.findIndex((entry) => entry.id === nextEntry.id);
    const nextEntries =
      existingIndex === -1
        ? [nextEntry, ...watchlist.entries]
        : watchlist.entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry));

    return {
      ...watchlist,
      entryCount:
        existingIndex === -1 ? watchlist.entryCount + 1 : watchlist.entryCount,
      entries: nextEntries,
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function WatchlistConsole({
  initialWatchlists,
  automationStatus,
  activeWatchlistId,
  canWriteWorkspace,
}: WatchlistConsoleProps) {
  const router = useRouter();
  const [watchlists, setWatchlists] = useState(initialWatchlists);
  
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [pendingRefreshId, setPendingRefreshId] = useState<string | null>(null);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New Watchlist Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [pendingCreate, setPendingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Success Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<ToastType>("success");

  // Add Company Drawer State
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveResult, setResolveResult] = useState<CompanyIntakeResolution | null>(null);

  // Track Company State (Step 2)
  const [isTracking, setIsTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [isWhyThisMatchOpen, setIsWhyThisMatchOpen] = useState(false);
  const [isWeakMatchModalOpen, setIsWeakMatchModalOpen] = useState(false);

  const activeWatchlist = watchlists.find((watchlist) => watchlist.id === activeWatchlistId) ?? watchlists[0] ?? null;

  useEffect(() => {
    setWatchlists(initialWatchlists);
  }, [initialWatchlists]);

  useEffect(() => {
    setCurrentTime(new Date());
  }, [activeWatchlistId]);

  const handleOpenAddDrawer = () => {
    setIsAddDrawerOpen(true);
  };

  const handleResolveIntake = async () => {
    const input = addInput.trim();
    if (!input) return;

    setIsResolving(true);
    setResolveError(null);
    setResolveResult(null);
    setTrackError(null);

    try {
      const response = await fetch("/api/watchlists/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setResolveError(data.error ?? "The company details could not be verified. Please check the name or URL.");
        return;
      }

      setResolveResult(data.data);
    } catch {
      setResolveError("Verification failed. Please check your connection and try again.");
    } finally {
      setIsResolving(false);
    }
  };
  
  const isWeakMatch = (res: any) => 
    res?.confidence === "low" || 
    res?.supportStatus === "unsupported" || 
    res?.supportStatus === "unresolved";

  const handleTrackCompany = async (force: boolean = false) => {
    if (!activeWatchlist || !resolveResult) return;

    if (isWeakMatch(resolveResult) && !force) {
      setIsWeakMatchModalOpen(true);
      return;
    }

    setIsTracking(true);
    setTrackError(null);
    setError(null);

    try {
      const source = resolveTrackedSource(resolveResult);
      const companyLabel = resolveResult.canonicalCompanyLabel;
      const response = await fetch(`/api/watchlists/${activeWatchlist.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedQuery: companyLabel,
          matchedCompanyName: companyLabel,
          atsSourceUsed: source,
        }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch {
        setTrackError(`Server returned an invalid response (${response.status}). Please try again.`);
        setIsWeakMatchModalOpen(false);
        return;
      }

      if (!response.ok || !data.success) {
        setTrackError(data.error ?? "The company could not be tracked at this time.");
        setIsWeakMatchModalOpen(false); // Close if open to show error in drawer
        return;
      }

      const trackedEntry = data.data.entry as WatchlistOverview["entries"][number];
      setWatchlists((current) => upsertTrackedEntry(current, activeWatchlist.id, trackedEntry));
      setIsAddDrawerOpen(false);
      setIsWeakMatchModalOpen(false);
      setAddInput("");
      setResolveResult(null);
      setIsWhyThisMatchOpen(false);

      if (!source) {
        setToastMessage(`"${companyLabel}" added to watchlist.`);
        setToastType("success");
        router.refresh();
        return;
      }

      setPendingRefreshId(trackedEntry.id);
      setMessage(`Tracking ${companyLabel}. First check is in progress.`);
      const checkStartedAt = Date.now();

      try {
        const refreshResponse = await fetch("/api/analyze-unified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: trackedEntry.requestedQuery,
            watchlistEntryId: trackedEntry.id,
            forceRefresh: true,
          }),
        });
        const refreshData = await refreshResponse.json();

        if (!refreshResponse.ok || !refreshData.success) {
          setError(formatActionFailureMessage("complete the first check for", companyLabel, refreshData.error));
          setMessage(null);
          router.refresh();
          return;
        }

        const refreshedEntry: WatchlistOverview["entries"][number] = {
          ...trackedEntry,
          latestBriefId: refreshData.data?.briefId ?? trackedEntry.latestBriefId,
          latestMatchedCompanyName: refreshData.data?.matchedCompanyName ?? trackedEntry.latestMatchedCompanyName,
          latestResultState: refreshData.data?.resultState ?? trackedEntry.latestResultState,
          latestWatchlistReadLabel: refreshData.data?.strategicVerdict ?? trackedEntry.latestWatchlistReadLabel,
          latestWatchlistReadConfidence:
            refreshData.data?.watchlistReadConfidence ?? trackedEntry.latestWatchlistReadConfidence,
          latestAtsSourceUsed: refreshData.data?.apiSource ?? trackedEntry.latestAtsSourceUsed,
          latestBriefCreatedAt:
            refreshData.data?.briefId ? new Date().toISOString() : trackedEntry.latestBriefCreatedAt,
          latestBriefUpdatedAt:
            refreshData.data?.briefId ? new Date().toISOString() : trackedEntry.latestBriefUpdatedAt,
          updatedAt: new Date().toISOString(),
        };
        const minimumCheckingWindowMs = 900;
        const elapsedMs = Date.now() - checkStartedAt;
        if (elapsedMs < minimumCheckingWindowMs) {
          await sleep(minimumCheckingWindowMs - elapsedMs);
        }
        setWatchlists((current) => upsertTrackedEntry(current, activeWatchlist.id, refreshedEntry));
        setMessage(null);
        setToastMessage(`"${companyLabel}" added to watchlist and checked.`);
        setToastType("success");
        router.refresh();
      } catch {
        setError(formatActionFailureMessage("complete the first check for", companyLabel));
        setMessage(null);
      } finally {
        setPendingRefreshId(null);
      }
    } catch {
      setTrackError("Tracking failed. Please check your connection and try again.");
      setIsWeakMatchModalOpen(false); // Return to drawer on error
    } finally {
      setIsTracking(false);
    }
  };

  const handleTryAnotherSource = () => {
    setResolveResult(null);
    setResolveError(null);
    setTrackError(null);
    setIsWhyThisMatchOpen(false);
  };

  const handleCreateWatchlist = async () => {
    const name = newWatchlistName.trim();
    if (!name) return;

    setPendingCreate(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setCreateError(data.error ?? "Watchlist could not be created.");
        return;
      }

      setWatchlists((current) => [
        data.data.watchlist,
        ...current.filter((watchlist) => watchlist.id !== data.data.watchlist.id),
      ]);
      
      setIsCreateModalOpen(false);
      setNewWatchlistName("");
      setToastMessage(`Watchlist "${data.data.watchlist.name}" created successfully.`);
      setToastType("success");
      router.push(`/watchlists?watchlistId=${data.data.watchlist.id}`);
    } catch {
      setCreateError("Watchlist could not be created.");
    } finally {
      setPendingCreate(false);
    }
  };

  const clearIntakeResolution = () => {
    setMessage(null);
    setError(null);
  };

  const handleRemoveEntry = async (entryId: string) => {
    if (!activeWatchlist) return;

    const entry = activeWatchlist.entries.find((candidate) => candidate.id === entryId);
    const entryIdentity = buildWatchlistDisplayIdentity({
      requestedQuery: entry?.requestedQuery ?? "",
      matchedCompanyName: entry?.latestMatchedCompanyName ?? null,
      atsSourceUsed: entry?.latestAtsSourceUsed ?? null,
    });
    const companyLabel = entryIdentity.primary || "this company";

    setPendingRemovalId(entryId);
    setError(null);
    setMessage("Removing tracked company...");

    try {
      const response = await fetch(`/api/watchlists/${activeWatchlist.id}/entries/${entryId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(formatActionFailureMessage("remove", companyLabel, data.error));
        setMessage(null);
        return;
      }

      setWatchlists((current) =>
        current.map((watchlist) =>
          watchlist.id === activeWatchlist.id
            ? {
                ...watchlist,
                entryCount: Math.max(0, watchlist.entryCount - 1),
                entries: watchlist.entries.filter((entry) => entry.id !== entryId),
              }
            : watchlist
        )
      );
      if (activeWatchlist) {
        // No longer refreshing search params for selection, since panel is gone.
      }
      setMessage(`Removed ${companyLabel} from watchlist.`);
    } catch {
      setError(formatActionFailureMessage("remove", companyLabel));
      setMessage(null);
    } finally {
      setPendingRemovalId(null);
    }
  };

  const handleRefreshEntry = async (entryId: string) => {
    if (!activeWatchlist) return;

    const entry = activeWatchlist.entries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    const entryIdentity = buildWatchlistDisplayIdentity({
      requestedQuery: entry.requestedQuery,
      matchedCompanyName: entry.latestMatchedCompanyName,
      atsSourceUsed: entry.latestAtsSourceUsed,
    });

    setPendingRefreshId(entryId);
    setError(null);
    setMessage(
      `Refreshing ${entryIdentity.primary}. Stratum will keep this page open until the result is ready.`
    );

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
        setError(formatActionFailureMessage("refresh", entryIdentity.primary || "this company", data.error));
        setMessage(null);
        return;
      }

      setMessage(`Refresh completed for ${entryIdentity.primary}.`);
      router.refresh();
    } catch {
      setError(formatActionFailureMessage("refresh", entryIdentity.primary || "this company"));
      setMessage(null);
    } finally {
      setPendingRefreshId(null);
    }
  };

  const scheduledEntryCount =
    activeWatchlist?.entries.filter((entry) => entry.scheduleCadence !== "off").length ?? 0;
  
  const dueScheduledEntryCount = activeWatchlist?.entries.filter(
    (entry) =>
      entry.scheduleCadence !== "off" &&
      entry.scheduleNextRunAt &&
      new Date(entry.scheduleNextRunAt).getTime() <= currentTime.getTime()
  ).length ?? 0;

  // handleSaveSchedule removed as it was part of the inspection panel workflow

  return (
    <div className="min-h-[calc(100vh-1rem)] bg-[var(--background)]">
      <div className="w-full px-3 py-3 lg:px-4 lg:py-4">
        {(message || error) && (
          <div
            className="mb-4 rounded-xl border px-3 py-2 text-[13px] leading-5 break-words"
            role="status"
            aria-live="polite"
            style={{
              background: error ? "rgba(239, 68, 68, 0.05)" : "rgba(54, 91, 122, 0.05)",
              borderColor: error ? "rgba(239, 68, 68, 0.2)" : "rgba(54, 91, 122, 0.2)",
              color: error ? "#b91c1c" : "var(--foreground-secondary)",
            }}
          >
            <div className="flex items-start gap-2">
              <div className={`mt-1 h-1.5 w-1.5 rounded-full ${error ? 'bg-red-500' : 'bg-[color:var(--accent)]'}`} />
              {error ?? message}
            </div>
          </div>
        )}

        <div className="grid min-h-[calc(100vh-4.5rem)] grid-cols-1 items-start gap-4 xl:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[13.5rem_minmax(0,1fr)]">
          <WatchlistWorkspaceSidebar
            watchlists={watchlists}
            activeWatchlistId={activeWatchlistId}
            activeWatchlist={activeWatchlist}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onClearIntake={clearIntakeResolution}
          />

          <section className="flex min-w-0 flex-col gap-4">
            <header
              className="rounded-[20px] border bg-[var(--surface)] px-5 py-4 lg:px-6 lg:py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1
                      className="text-[1.6rem] font-semibold tracking-[-0.03em] lg:text-[1.85rem]"
                      style={{ color: "var(--foreground)" }}
                    >
                      {activeWatchlist?.name ?? "No watchlist selected"}
                    </h1>
                    <span
                      className="inline-flex items-center rounded-xl border px-2.5 py-1 text-[10px] font-medium tracking-[0.02em]"
                      style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}
                    >
                      {activeWatchlist ? "Active" : "No watchlist selected"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]" style={{ color: "var(--foreground-secondary)" }}>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{activeWatchlist?.entryCount ?? 0}</strong> tracked
                    </span>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{scheduledEntryCount}</strong> scheduled
                    </span>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{dueScheduledEntryCount}</strong> due now
                    </span>
                  </div>
                </div>

                <div className="xl:justify-self-end">
                  <button
                    onClick={handleOpenAddDrawer}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: "var(--accent)" }}
                  >
                    <Plus className="h-4 w-4" />
                    Track company
                  </button>
                </div>
              </div>
            </header>

            <WatchlistEntriesTable
              watchlist={activeWatchlist}
              activeEntryId={null}
              pendingRemovalId={pendingRemovalId}
              pendingRefreshId={pendingRefreshId}
              currentTime={currentTime.getTime()}
              onRemoveEntry={handleRemoveEntry}
              onRefreshEntry={handleRefreshEntry}
              onSelectEntry={(entryId) => {
                if (activeWatchlist) {
                  router.push(`/watchlists/${activeWatchlist.id}/entries/${entryId}`);
                }
              }}
            />
          </section>
        </div>
      </div>

      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNewWatchlistName("");
          setCreateError(null);
        }}
        title="New watchlist"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--foreground-secondary)" }}>
            Create a workspace to organize your tracked companies.
          </p>
          
          <div className="space-y-2">
            <label htmlFor="watchlist-name" className="text-[11px] font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
              Watchlist name
            </label>
            <Input
              id="watchlist-name"
              placeholder="e.g. Series A Fintech, AI Infrastructure"
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !pendingCreate) {
                  void handleCreateWatchlist();
                }
              }}
              autoFocus
              error={!!createError}
            />
            {createError && (
              <p className="text-xs text-danger">{createError}</p>
            )}
            {!createError && newWatchlistName.trim() && watchlists.some(
              (w) => w.name.toLowerCase() === newWatchlistName.trim().toLowerCase()
            ) && (
              <p className="text-[11px] font-medium" style={{ color: "#b45309" }}>
                Notice: A watchlist with this name already exists.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setIsCreateModalOpen(false);
                setNewWatchlistName("");
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreateWatchlist}
                  isLoading={pendingCreate}
                  disabled={!newWatchlistName.trim()}
                >
                  Create watchlist
                </Button>
          </div>
        </div>
      </Dialog>

      <Drawer
        isOpen={isAddDrawerOpen}
        onClose={() => {
          setIsAddDrawerOpen(false);
          setAddInput("");
          setResolveError(null);
          setResolveResult(null);
        }}
        title="Track company"
      >
        <div className="flex h-full flex-col">
          {resolveResult ? (
            <div className="flex flex-col gap-6">
              {/* Step 2 Progress */}
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[color:var(--accent)]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--accent)] text-[10px] text-white">2</span>
                <span>Match summary</span>
              </div>

              <div className="space-y-6">
                <div className="space-y-4 rounded-2xl border p-5" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium" style={{ color: "var(--foreground-muted)" }}>Company</p>
                <p className="max-w-full break-words text-lg font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                      {resolveResult.canonicalCompanyLabel}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-medium" style={{ color: "var(--foreground-muted)" }}>Careers source</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium" style={{ color: "var(--foreground)" }}>{resolveResult.atsProvider ?? "Unknown source"}</p>
                      {resolveResult.likelyCareersPage && (
                        <a 
                          href={resolveResult.likelyCareersPage} 
                          target="_blank" 
                          rel="noreferrer"
                          className="rounded-full p-1 transition-colors hover:bg-zinc-100"
                        >
                          <ExternalLink className="h-3 w-3" style={{ color: "var(--foreground-muted)" }} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium" style={{ color: "var(--foreground-muted)" }}>Confidence</p>
                      <div className="flex items-center gap-1.5">
                        <div 
                          className="h-2 w-2 rounded-full" 
                          style={{ 
                            background: resolveResult.confidence === 'high' ? '#10b981' : resolveResult.confidence === 'medium' ? '#f59e0b' : '#ef4444' 
                          }} 
                        />
                        <p className="text-sm font-semibold capitalize" style={{ color: "var(--foreground)" }}>{resolveResult.confidence}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs italic leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                      {resolveResult.confidenceReason}
                    </p>
                  </div>
                </div>

                {/* Why this match disclosure */}
                <div className="space-y-3">
                  <button 
                    onClick={() => setIsWhyThisMatchOpen(!isWhyThisMatchOpen)}
                    className="flex w-full items-center justify-between text-xs font-semibold hover:opacity-80 transition-opacity"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    <span className="text-[11px] font-medium opacity-60">Why this match?</span>
                    {isWhyThisMatchOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  
                  {isWhyThisMatchOpen && (
                    <div className="rounded-xl border border-[var(--border)] bg-[rgba(54,91,122,0.04)] p-4 text-[13px] leading-relaxed text-[color:var(--foreground-secondary)]">
                      {resolveResult.explanation}
                    </div>
                  )}
                </div>
              </div>

              {trackError && (
                <p className="text-xs font-medium text-danger">{trackError}</p>
              )}

              <div className="flex flex-col gap-3 pt-4 mt-auto">
                <Button
                  className="w-full"
                  onClick={() => handleTrackCompany()}
                  isLoading={isTracking}
                >
                  Track company
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={handleTryAnotherSource}
                  disabled={isTracking}
                >
                  Try another source
                </Button>
              </div>
            </div>
          ) : (
              <div className="flex flex-col gap-5">
              <p className="text-sm" style={{ color: "var(--foreground-secondary)" }}>
                {isResolving ? "Researching company..." : "Track companies you care about. Stratum will add the company and run the first check automatically when a supported source is confirmed."}
              </p>

              <div className="space-y-2">
                <label htmlFor="intake-input" className="text-[11px] font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
                  Company name or URL
                </label>
                <Input
                  id="intake-input"
                  placeholder="e.g. Stripe or stripe.com/jobs"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isResolving) {
                      void handleResolveIntake();
                    }
                  }}
                  autoFocus
                  error={!!resolveError}
                />
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--foreground-muted)" }}>
                  Enter a company name or careers page URL to add it to this watchlist and start the first check.
                </p>
                {resolveError && (
                  <p className="mt-2 text-xs font-medium text-danger">{resolveError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setIsAddDrawerOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleResolveIntake}
                  isLoading={isResolving}
                  disabled={!addInput.trim()}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {/* Phase 5: Weak-Match Confirmation Modal */}
      <Dialog
        isOpen={isWeakMatchModalOpen}
        onClose={() => setIsWeakMatchModalOpen(false)}
        title="Track this company anyway?"
      >
        <div className="space-y-6">
          <div className="flex gap-4 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800">Review match quality</p>
              <p className="text-xs leading-relaxed text-amber-700/80">
                A possible careers source was found, but the match is less certain. You can still track it, but results may be less reliable.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border bg-zinc-50/50 p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--foreground-muted)" }}>Company</span>
              <span className="max-w-[18rem] text-right font-semibold break-words" style={{ color: "var(--foreground)" }}>{resolveResult?.canonicalCompanyLabel}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--foreground-muted)" }}>Careers source</span>
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>{resolveResult?.atsProvider ?? "Unknown"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--foreground-muted)" }}>Confidence</span>
              <div className="flex items-center gap-1.5 font-semibold text-danger">
                <div className="h-1.5 w-1.5 rounded-full bg-danger" />
                <span className="capitalize">{resolveResult?.confidence}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setIsWeakMatchModalOpen(false)}
            >
              Go back
            </Button>
            <Button
              className="flex-1"
              style={{ background: "#0c0a09" }}
              onClick={() => handleTrackCompany(true)}
              isLoading={isTracking}
            >
              Track anyway
            </Button>
          </div>
        </div>
      </Dialog>

      <Toast 
        message={toastMessage} 
        type={toastType} 
        isVisible={!!toastMessage} 
        onClose={() => setToastMessage(null)} 
      />
    </div>
  );
}
