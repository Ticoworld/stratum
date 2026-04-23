"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { WatchlistOverview } from "@/lib/watchlists/repository";

interface WatchlistWorkspaceSidebarProps {
  watchlists: WatchlistOverview[];
  activeWatchlistId: string | null;
  activeWatchlist: WatchlistOverview | null;
  onOpenCreateModal: () => void;
  onClearIntake: () => void;
}

export function WatchlistWorkspaceSidebar({
  watchlists,
  activeWatchlistId,
  onOpenCreateModal,
  onClearIntake,
}: WatchlistWorkspaceSidebarProps) {
  return (
    <aside
      className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border bg-[var(--surface)] xl:min-h-[calc(100vh-4.5rem)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="shrink-0 border-b px-4 pt-4 pb-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium tracking-[0.02em]" style={{ color: "var(--foreground)" }}>
            Watchlists
          </p>
          <button
            onClick={() => {
              onClearIntake();
              onOpenCreateModal();
            }}
            title="Create a new watchlist"
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-medium transition-colors hover:bg-zinc-50 hover:text-foreground"
            style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-1">
          {watchlists.map((watchlist) => {
            const isActive = activeWatchlistId === watchlist.id;

            return (
              <Link
                key={watchlist.id}
                href={`/watchlists?watchlistId=${watchlist.id}`}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors"
                aria-current={isActive ? "page" : undefined}
                style={{
                  background: isActive ? "rgba(16,24,40,0.06)" : "transparent",
                  color: isActive ? "var(--foreground)" : "var(--foreground-secondary)",
                  boxShadow: isActive ? "inset 2px 0 0 var(--foreground)" : "none",
                }}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[14px] font-medium tracking-tight">{watchlist.name}</p>
                    {isActive && (
                      <span
                        className="rounded-xl border px-2 py-0.5 text-[10px] font-medium tracking-[0.02em]"
                        style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--foreground-muted)" }}>
                  {watchlist.entryCount}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
