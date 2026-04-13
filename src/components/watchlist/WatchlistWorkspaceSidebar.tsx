"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import type { StratumScheduledAutomationStatus } from "@/lib/watchlists/automation";
import type { WatchlistOverview } from "@/lib/watchlists/repository";

interface WatchlistWorkspaceSidebarProps {
  watchlists: WatchlistOverview[];
  activeWatchlistId: string | null;
  activeWatchlist: WatchlistOverview | null;
  automationStatus: StratumScheduledAutomationStatus;
  dueScheduledEntryCount: number;
  newWatchlistName: string;
  setNewWatchlistName: (value: string) => void;
  pendingCreate: boolean;
  onCreateWatchlist: () => void;
  newQuery: string;
  setNewQuery: (value: string) => void;
  pendingAdd: boolean;
  onAddEntry: () => void;
  pendingScheduledRun: boolean;
  onRunDueScheduledRefreshes: () => void;
}

export function WatchlistWorkspaceSidebar({
  watchlists,
  activeWatchlistId,
  activeWatchlist,
  automationStatus,
  dueScheduledEntryCount,
  newWatchlistName,
  setNewWatchlistName,
  pendingCreate,
  onCreateWatchlist,
  newQuery,
  setNewQuery,
  pendingAdd,
  onAddEntry,
  pendingScheduledRun,
  onRunDueScheduledRefreshes,
}: WatchlistWorkspaceSidebarProps) {
  const [activeComposer, setActiveComposer] = useState<"watchlist" | "target" | null>(null);

  return (
    <aside className="rounded-[24px] border bg-[var(--surface)] px-4 py-5" style={{ borderColor: "var(--border)" }}>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium tracking-tight" style={{ color: "var(--foreground)" }}>
            Watchlists
          </p>
          <p className="mt-1 text-[13px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
            Switch tracking context without losing the active workspace.
          </p>

          <div className="mt-4 space-y-1.5">
            {watchlists.map((watchlist) => {
              const isActive = activeWatchlistId === watchlist.id;

              return (
                <Link
                  key={watchlist.id}
                  href={`/watchlists?watchlistId=${watchlist.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors"
                  aria-current={isActive ? "page" : undefined}
                  style={{
                    background: isActive ? "rgba(16,24,40,0.06)" : "transparent",
                    color: isActive ? "var(--foreground)" : "var(--foreground-secondary)",
                    boxShadow: isActive ? "inset 2px 0 0 var(--foreground)" : "none",
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium tracking-tight">{watchlist.name}</p>
                    <p className="mt-1 text-[12px]" style={{ color: "var(--foreground-muted)" }}>
                      {watchlist.id === activeWatchlistId ? "Active watchlist" : "Open watchlist"}
                    </p>
                  </div>
                  <span className="text-[12px] tabular-nums" style={{ color: "var(--foreground-muted)" }}>
                    {watchlist.entryCount}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveComposer((current) => (current === "watchlist" ? null : "watchlist"))}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3 text-[13px] transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              New watchlist
            </button>
            <button
              onClick={() => setActiveComposer((current) => (current === "target" ? null : "target"))}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3 text-[13px] transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add target
            </button>
          </div>

          {activeComposer === "watchlist" ? (
            <div className="mt-4 space-y-2 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <p className="text-[12px] font-medium" style={{ color: "var(--foreground)" }}>
                Create a new watchlist
              </p>
              <input
                type="text"
                value={newWatchlistName}
                onChange={(event) => setNewWatchlistName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && onCreateWatchlist()}
                placeholder="Name this watchlist"
                disabled={pendingCreate}
                className="h-10 w-full rounded-xl border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
              <button
                onClick={onCreateWatchlist}
                disabled={pendingCreate || !newWatchlistName.trim()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                {pendingCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create watchlist
              </button>
            </div>
          ) : null}

          {activeComposer === "target" ? (
            <div className="mt-4 space-y-2 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <p className="text-[12px] font-medium" style={{ color: "var(--foreground)" }}>
                Add a tracked company
              </p>
              <input
                type="text"
                value={newQuery}
                onChange={(event) => setNewQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && onAddEntry()}
                placeholder={activeWatchlist ? "Company name or source URL" : "Select a watchlist first"}
                disabled={pendingAdd || !activeWatchlist}
                className="h-10 w-full rounded-xl border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
              <button
                onClick={onAddEntry}
                disabled={pendingAdd || !newQuery.trim() || !activeWatchlist}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
              >
                {pendingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add to watchlist
              </button>
            </div>
          ) : null}
        </div>

        <div className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--foreground)" }}>
                Scheduled refreshes
              </p>
              <p className="mt-1 text-[13px] leading-6" style={{ color: "var(--foreground-secondary)" }}>
                {automationStatus.label}
              </p>
            </div>
            {activeWatchlist ? (
              <span className="text-[12px] tabular-nums" style={{ color: "var(--foreground-muted)" }}>
                {dueScheduledEntryCount} due
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[12px] leading-6" style={{ color: "var(--foreground-muted)" }}>
            {automationStatus.summary}
          </p>
          <button
            onClick={onRunDueScheduledRefreshes}
            disabled={pendingScheduledRun || !activeWatchlist}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border px-3 text-[13px] transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            {pendingScheduledRun ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
            Run due refreshes
          </button>
        </div>
      </div>
    </aside>
  );
}
