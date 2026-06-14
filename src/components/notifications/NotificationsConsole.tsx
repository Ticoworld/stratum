"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  NotificationInboxCounts,
  StratumNotificationAlertPriority,
  StratumNotificationInboxFilter,
  WatchlistNotificationInboxItem,
} from "@/lib/watchlists/notifications";
import {
  formatNotificationAlertPriorityLabel,
  formatNotificationStatusLabel,
  getNotificationAlertPriorityRank,
} from "@/lib/watchlists/notifications";
import { buildNotificationDisplayCopy } from "@/lib/watchlists/notificationDisplay";
import { NOTIFICATIONS_UPDATED_EVENT } from "@/components/shell/AppShell";
import {
  buildWatchlistDisplayIdentity,
  formatWatchlistDateTime,
  formatWatchlistMetadataLine,
} from "@/lib/watchlists/presentation";

interface NotificationsConsoleProps {
  activeFilter: StratumNotificationInboxFilter;
  counts: NotificationInboxCounts;
  notifications: WatchlistNotificationInboxItem[];
  previewMode?: boolean;
}

const FILTERS: Array<{
  value: StratumNotificationInboxFilter;
  label: string;
}> = [
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

// ---------------------------------------------------------------------------
// Phase 6E-3: Alert priority presentation
// ---------------------------------------------------------------------------

/** Visual configuration for each alert priority level. */
const PRIORITY_CHIP_STYLES: Record<
  StratumNotificationAlertPriority,
  { textColor: string; borderColor: string }
> = {
  immediate:    { textColor: "rgb(146, 64, 14)",    borderColor: "rgba(245, 158, 11, 0.45)" },
  source_issue: { textColor: "rgb(185, 28, 28)",    borderColor: "rgba(239, 68, 68, 0.35)"  },
  digest:       { textColor: "var(--foreground-muted)", borderColor: "var(--border)"          },
  suppressed:   { textColor: "var(--foreground-muted)", borderColor: "var(--border)"          },
};

/** Left-border accent color for unread notifications, keyed by priority. */
const PRIORITY_BORDER_ACCENT: Record<StratumNotificationAlertPriority, string> = {
  immediate:    "rgba(245, 158, 11, 0.85)",
  source_issue: "rgba(239, 68, 68, 0.65)",
  digest:       "var(--foreground)",
  suppressed:   "var(--foreground-muted)",
};

/**
 * Sort notifications by alertPriority rank ascending, then by createdAt
 * descending within the same priority level.
 * Suppressed items are moved to the end and excluded from the main view
 * (they should never be inserted, but this is a defensive guard).
 */
function sortAndFilterNotifications(
  items: WatchlistNotificationInboxItem[]
): WatchlistNotificationInboxItem[] {
  return items
    .filter((item) => item.alertPriority !== "suppressed")
    .sort((a, b) => {
      const rankDiff =
        getNotificationAlertPriorityRank(a.alertPriority) -
        getNotificationAlertPriorityRank(b.alertPriority);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

function getFilterCount(
  filter: StratumNotificationInboxFilter,
  counts: NotificationInboxCounts
): number {
  switch (filter) {
    case "unread":
      return counts.unreadCount;
    case "read":
      return counts.readCount;
    case "dismissed":
      return counts.dismissedCount;
    case "all":
      return counts.totalCount;
  }
}

function formatNotificationStatusDetail(
  notification: WatchlistNotificationInboxItem
): string {
  if (notification.status === "dismissed") {
    return notification.dismissedAt
      ? `Dismissed ${formatWatchlistDateTime(notification.dismissedAt, "recently")}`
      : "Dismissed from active queue";
  }

  if (notification.status === "read") {
    return notification.readAt
      ? `Read ${formatWatchlistDateTime(notification.readAt, "recently")}`
      : "Reviewed";
  }

  return "Needs review";
}

function NotificationActionButtons({
  notification,
  pending,
  previewMode,
  onAction,
}: {
  notification: WatchlistNotificationInboxItem;
  pending: boolean;
  previewMode: boolean;
  onAction: (action: "mark_read" | "mark_unread" | "dismiss") => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-[12px]">
      {notification.status !== "read" && notification.status !== "dismissed" ? (
        <button
          onClick={() => void onAction("mark_read")}
          disabled={pending || previewMode}
          className="rounded-full border px-3 py-2 font-medium transition-colors disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
        >
          Mark read
        </button>
      ) : null}
      {notification.status !== "unread" ? (
        <button
          onClick={() => void onAction("mark_unread")}
          disabled={pending || previewMode}
          className="rounded-full border px-3 py-2 font-medium transition-colors disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
        >
          Mark unread
        </button>
      ) : null}
      {notification.status !== "dismissed" ? (
        <button
          onClick={() => void onAction("dismiss")}
          disabled={pending || previewMode}
          className="rounded-full border px-3 py-2 font-medium transition-colors disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

function adjustCounts(
  current: NotificationInboxCounts,
  previousStatus: WatchlistNotificationInboxItem["status"],
  nextStatus: WatchlistNotificationInboxItem["status"]
): NotificationInboxCounts {
  if (previousStatus === nextStatus) return current;

  const next = { ...current };
  switch (previousStatus) {
    case "unread":
      next.unreadCount = Math.max(0, next.unreadCount - 1);
      break;
    case "read":
      next.readCount = Math.max(0, next.readCount - 1);
      break;
    case "dismissed":
      next.dismissedCount = Math.max(0, next.dismissedCount - 1);
      break;
  }

  switch (nextStatus) {
    case "unread":
      next.unreadCount += 1;
      break;
    case "read":
      next.readCount += 1;
      break;
    case "dismissed":
      next.dismissedCount += 1;
      break;
  }

  return next;
}

function matchesFilter(
  status: WatchlistNotificationInboxItem["status"],
  filter: StratumNotificationInboxFilter
): boolean {
  return filter === "all" || filter === status;
}

export function NotificationsConsole({
  activeFilter,
  counts,
  notifications,
  previewMode = false,
}: NotificationsConsoleProps) {
  const [notificationsState, setNotificationsState] = useState(notifications);
  const [countsState, setCountsState] = useState(counts);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    setNotificationsState(notifications);
  }, [notifications]);

  useEffect(() => {
    setCountsState(counts);
  }, [counts]);

  const handleAction = async (
    notification: WatchlistNotificationInboxItem,
    action: "mark_read" | "mark_unread" | "dismiss"
  ) => {
    if (previewMode) return;
    setPendingId(notification.id);
    setMessage(
      action === "mark_read"
        ? "Marking notification as read..."
        : action === "mark_unread"
          ? "Marking notification as unread..."
          : "Dismissing notification..."
    );
    setError(null);

    try {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        setError(data?.error ?? "Inbox item could not be updated.");
        setMessage(null);
        return;
      }

      const nextStatus: WatchlistNotificationInboxItem["status"] =
        action === "mark_read" ? "read" : action === "mark_unread" ? "unread" : "dismissed";
      const nowIso = new Date().toISOString();
      const readAt =
        nextStatus === "read" || nextStatus === "dismissed" ? notification.readAt ?? nowIso : null;
      const dismissedAt = nextStatus === "dismissed" ? nowIso : null;

      setNotificationsState((current) =>
        current
          .map((item) =>
            item.id === notification.id
              ? {
                  ...item,
                  status: nextStatus,
                  readAt,
                  dismissedAt,
                }
              : item
          )
          .filter((item) => matchesFilter(item.status, activeFilter))
      );
      setCountsState((current) => adjustCounts(current, notification.status, nextStatus));
      setMessage(
        action === "mark_read"
          ? "Inbox item marked as read."
          : action === "mark_unread"
            ? "Inbox item marked as unread."
            : "Inbox item dismissed from the active queue."
      );
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
    } catch {
      setError("Inbox item could not be updated.");
      setMessage(null);
    } finally {
      setPendingId(null);
    }
  };

  const sortedNotifications = sortAndFilterNotifications(notificationsState);

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-4 py-4 lg:px-6 lg:py-6">
        <header
          className="rounded-[22px] border bg-[var(--surface)] px-6 py-4 lg:px-7 lg:py-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
                Inbox
              </p>
              <h1
                className="mt-2 text-[1.7rem] font-semibold tracking-[-0.03em] lg:text-[1.95rem]"
                style={{ color: "var(--foreground)" }}
              >
                Important updates
              </h1>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                Updates from companies you&apos;re tracking.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]" style={{ color: "var(--foreground-secondary)" }}>
              <span>
                <strong style={{ color: "var(--foreground)" }}>{countsState.unreadCount}</strong> unread
              </span>
              <span>
                <strong style={{ color: "var(--foreground)" }}>{countsState.readCount}</strong> reviewed
              </span>
              <span>
                <strong style={{ color: "var(--foreground)" }}>{countsState.dismissedCount}</strong> dismissed
              </span>
              <span>
                <strong style={{ color: "var(--foreground)" }}>{countsState.totalCount}</strong> total
              </span>
            </div>
          </div>

          <div
            className="mt-4 flex flex-wrap gap-2 border-t pt-4"
            style={{ borderColor: "var(--border)" }}
          >
            {FILTERS.map((filter) => {
              const active = activeFilter === filter.value;
              return (
                <Link
                  key={filter.value}
                  href={filter.value === "unread" ? "/notifications" : `/notifications?status=${filter.value}`}
                  className="rounded-full border px-3 py-2 text-[12px] font-medium transition-colors"
                  style={{
                    background: active ? "rgba(16,24,40,0.04)" : "transparent",
                    borderColor: active ? "var(--foreground)" : "var(--border)",
                    color: active ? "var(--foreground)" : "var(--foreground-secondary)",
                  }}
                >
                  {filter.label} {getFilterCount(filter.value, countsState)}
                </Link>
              );
            })}
          </div>
        </header>

        {(message || error) && (
          <div
            className="mt-5 rounded-2xl border px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--surface)",
              borderColor: error ? "#fca5a5" : "var(--border)",
              color: error ? "#b91c1c" : "var(--foreground-secondary)",
            }}
          >
            {error ?? message}
          </div>
        )}

        <section
          className="mt-5 overflow-hidden rounded-[28px] border bg-[var(--surface)]"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="flex flex-col gap-2 border-b px-6 py-4 sm:flex-row sm:items-end sm:justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <p className="text-sm font-medium tracking-tight" style={{ color: "var(--foreground-muted)" }}>
                Triage queue
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--foreground-secondary)" }}>
                {sortedNotifications.length} item{sortedNotifications.length === 1 ? "" : "s"} in this view
              </p>
            </div>
          </div>

          {sortedNotifications.length > 0 ? (
            <div>
              {sortedNotifications.map((notification, index) => {
                const pending = pendingId === notification.id;
                const preferredBriefId = notification.relatedBriefId ?? notification.latestBriefId;
                const identity = buildWatchlistDisplayIdentity({
                  requestedQuery: notification.requestedQuery,
                  matchedCompanyName: notification.latestMatchedCompanyName,
                  atsSourceUsed: null,
                });
                const identityMeta = formatWatchlistMetadataLine([
                  notification.watchlistName,
                  identity.meta ??
                    (identity.uncertain ? "Identity unresolved" : identity.sourceGrounding.primary),
                ]);
                const displayCopy = buildNotificationDisplayCopy(notification);
                const priority = notification.alertPriority ?? "digest";
                const priorityChip = PRIORITY_CHIP_STYLES[priority];
                const priorityBorderAccent =
                  notification.status === "unread"
                    ? PRIORITY_BORDER_ACCENT[priority]
                    : "none";

                return (
                  <article
                    key={notification.id}
                    className="px-6 py-5"
                    style={{
                      borderTop: index === 0 ? "none" : `1px solid var(--border)`,
                      background:
                        notification.status === "unread" ? "rgba(16,24,40,0.03)" : "transparent",
                      boxShadow:
                        notification.status === "unread"
                          ? `inset 3px 0 0 ${priorityBorderAccent}`
                          : "none",
                    }}
                  >
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.35fr)_15rem]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background:
                                notification.status === "unread"
                                  ? "var(--foreground)"
                                  : "var(--foreground-muted)",
                            }}
                          />
                          <span
                            className="text-[12px] font-medium"
                            style={{ color: "var(--foreground-secondary)" }}
                          >
                            {formatNotificationStatusLabel(notification.status)}
                          </span>
                          {/* Priority chip — always visible, styled by alertPriority */}
                          <span
                            className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              borderColor: priorityChip.borderColor,
                              color: priorityChip.textColor,
                            }}
                          >
                            {formatNotificationAlertPriorityLabel(priority)}
                          </span>
                        </div>

                        <h2
                          className="mt-3 text-[1.1rem] font-semibold leading-6 tracking-[-0.02em]"
                          style={{ color: "var(--foreground)" }}
                        >
                          {identity.primary}
                        </h2>

                        {identityMeta ? (
                          <p
                            className="mt-2 text-[12px] leading-5"
                            style={{ color: "var(--foreground-secondary)" }}
                          >
                            {identityMeta}
                          </p>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <span
                          className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            borderColor: "var(--border)",
                            color: "var(--foreground-secondary)",
                          }}
                        >
                          {displayCopy.tag}
                        </span>
                        <p className="mt-2 text-sm font-medium leading-6" style={{ color: "var(--foreground)" }}>
                          {displayCopy.mainLine}
                        </p>

                        {notification.summary && notification.summary !== displayCopy.mainLine ? (
                          <details className="mt-3 text-[12px]" style={{ color: "var(--foreground-secondary)" }}>
                            <summary className="cursor-pointer font-medium" style={{ color: "var(--foreground-muted)" }}>
                              Details
                            </summary>
                            <p className="mt-2 leading-5">{notification.summary}</p>
                          </details>
                        ) : null}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <p className="text-[12px] font-medium" style={{ color: "var(--foreground-muted)" }}>
                            Created
                          </p>
                          <p className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                            {formatWatchlistDateTime(notification.createdAt, "Unknown")}
                          </p>
                          <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                            {formatNotificationStatusDetail(notification)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[12px] font-medium" style={{ color: "var(--foreground-muted)" }}>
                            Next step
                          </p>
                          <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--foreground-secondary)" }}>
                            {displayCopy.nextStep}
                          </p>
                          <div className="mt-2 flex flex-col gap-2 text-[12px]">
                            {previewMode ? (
                              <span
                                className="rounded-full border px-3 py-2 font-medium opacity-70"
                                style={{
                                  borderColor: "var(--foreground)",
                                  color: "var(--foreground)",
                                }}
                              >
                                Inspect target
                              </span>
                            ) : (
                              <Link
                                href={`/watchlists?watchlistId=${notification.watchlistId}&entryId=${notification.watchlistEntryId}`}
                                className="rounded-full border px-3 py-2 font-medium transition-colors"
                                style={{
                                  borderColor: "var(--foreground)",
                                  color: "var(--foreground)",
                                }}
                              >
                                Inspect target
                              </Link>
                            )}
                            {preferredBriefId ? (
                              previewMode ? (
                                <span
                                  className="rounded-full border px-3 py-2 font-medium opacity-70"
                                  style={{
                                    borderColor: "var(--border)",
                                    color: "var(--foreground-secondary)",
                                  }}
                                >
                                  Open brief
                                </span>
                              ) : (
                                <Link
                                  href={`/briefs/${preferredBriefId}`}
                                  className="rounded-full border px-3 py-2 font-medium transition-colors"
                                  style={{
                                    borderColor: "var(--border)",
                                    color: "var(--foreground-secondary)",
                                  }}
                                >
                                  Open brief
                                </Link>
                              )
                            ) : null}
                          </div>
                        </div>

                        <div>
                          {pending ? (
                            <div
                              className="mb-2 flex items-center gap-2 text-[12px]"
                              style={{ color: "var(--foreground-muted)" }}
                            >
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Updating
                            </div>
                          ) : null}
                          <NotificationActionButtons
                            notification={notification}
                            pending={pending}
                            previewMode={previewMode}
                            onAction={(action) => handleAction(notification, action)}
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-8 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
              {notificationsState.length > 0
                ? "All items in this view have been suppressed and are hidden from the inbox."
                : "No inbox items match this view."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
