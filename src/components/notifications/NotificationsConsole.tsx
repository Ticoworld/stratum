"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Bell, Loader2 } from "lucide-react";
import type {
  NotificationInboxCounts,
  StratumNotificationInboxFilter,
  WatchlistNotificationInboxItem,
} from "@/lib/watchlists/notifications";
import {
  formatNotificationCandidateKindLabel,
  formatNotificationChangeTypeLabel,
  formatNotificationDeliveryModeLabel,
  formatNotificationStatusLabel,
} from "@/lib/watchlists/notifications";

interface NotificationsConsoleProps {
  activeFilter: StratumNotificationInboxFilter;
  counts: NotificationInboxCounts;
  notifications: WatchlistNotificationInboxItem[];
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

const FILTERS: Array<{
  value: StratumNotificationInboxFilter;
  label: string;
}> = [
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

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

function NotificationActionButtons({
  notification,
  pending,
  onAction,
}: {
  notification: WatchlistNotificationInboxItem;
  pending: boolean;
  onAction: (action: "mark_read" | "mark_unread" | "dismiss") => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
      {notification.status !== "read" && notification.status !== "dismissed" ? (
        <button
          onClick={() => void onAction("mark_read")}
          disabled={pending}
          className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
        >
          Mark Read
        </button>
      ) : null}
      {notification.status !== "unread" ? (
        <button
          onClick={() => void onAction("mark_unread")}
          disabled={pending}
          className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
        >
          Mark Unread
        </button>
      ) : null}
      {notification.status !== "dismissed" ? (
        <button
          onClick={() => void onAction("dismiss")}
          disabled={pending}
          className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export function NotificationsConsole({
  activeFilter,
  counts,
  notifications,
}: NotificationsConsoleProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleAction = async (
    notification: WatchlistNotificationInboxItem,
    action: "mark_read" | "mark_unread" | "dismiss"
  ) => {
    setPendingId(notification.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Notification could not be updated.");
        return;
      }

      setMessage(
        action === "mark_read"
          ? "Notification marked as read."
          : action === "mark_unread"
            ? "Notification marked as unread."
            : "Notification dismissed from the active inbox."
      );
      router.refresh();
    } catch {
      setError("Notification could not be updated.");
    } finally {
      setPendingId(null);
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
              Notifications
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
              Meaningful monitoring changes now surface in Stratum&apos;s in-product inbox. No email, push, Slack, or
              external delivery channel exists yet.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded border px-4 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              <ArrowLeft className="h-4 w-4" />
              Brief Builder
            </Link>
            <Link
              href="/watchlists"
              className="inline-flex items-center gap-2 rounded border px-4 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
            >
              <Bell className="h-4 w-4" />
              Watchlists
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

        <section
          className="rounded border p-5"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            borderWidth: "1px",
          }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                Inbox state
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Unread", value: counts.unreadCount },
                  { label: "Read", value: counts.readCount },
                  { label: "Dismissed", value: counts.dismissedCount },
                  { label: "Total", value: counts.totalCount },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded border p-4"
                    style={{
                      background: "var(--background)",
                      borderColor: "var(--border)",
                      borderWidth: "1px",
                    }}
                  >
                    <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                      {item.label}
                    </p>
                    <p className="mt-3 text-xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => {
                const active = activeFilter === filter.value;
                return (
                  <Link
                    key={filter.value}
                    href={filter.value === "unread" ? "/notifications" : `/notifications?status=${filter.value}`}
                    className="rounded border px-3 py-2 text-xs font-data uppercase tracking-[0.18em] transition-all duration-200"
                    style={{
                      background: active ? "var(--background)" : "var(--surface)",
                      borderColor: active ? "var(--accent)" : "var(--border)",
                      color: active ? "var(--foreground)" : "var(--foreground-secondary)",
                    }}
                  >
                    {filter.label} ({getFilterCount(filter.value, counts)})
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-5 space-y-4">
          {notifications.length > 0 ? (
            notifications.map((notification) => {
              const pending = pendingId === notification.id;
              const preferredBriefId = notification.relatedBriefId ?? notification.latestBriefId;
              return (
                <article
                  key={notification.id}
                  className="rounded border p-5"
                  style={{
                    background: "var(--surface)",
                    borderColor:
                      notification.status === "unread" ? "var(--accent)" : "var(--border)",
                    borderWidth: "1px",
                  }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className="rounded border px-2 py-1 text-[10px] font-data uppercase tracking-[0.22em]"
                          style={{
                            borderColor:
                              notification.status === "unread" ? "var(--accent)" : "var(--border)",
                            color:
                              notification.status === "unread"
                                ? "var(--accent)"
                                : "var(--foreground-muted)",
                          }}
                        >
                          {formatNotificationStatusLabel(notification.status)}
                        </span>
                        <span
                          className="rounded border px-2 py-1 text-[10px] font-data uppercase tracking-[0.22em]"
                          style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}
                        >
                          {formatNotificationCandidateKindLabel(notification.candidateKind)}
                        </span>
                      </div>
                      <p className="mt-3 text-lg font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
                        {notification.summary}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                        {notification.watchlistName} · {notification.requestedQuery}
                        {notification.latestMatchedCompanyName
                          ? ` · latest matched company: ${notification.latestMatchedCompanyName}`
                          : ""}
                      </p>
                    </div>

                    {pending ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--foreground-muted)" }} /> : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Created",
                        value: formatDateTimeValue(notification.createdAt) ?? "Unknown time",
                      },
                      {
                        label: "Delivery",
                        value: formatNotificationDeliveryModeLabel(notification.deliveryMode),
                      },
                      {
                        label: "Read at",
                        value: formatDateTimeValue(notification.readAt) ?? "Not read yet",
                      },
                      {
                        label: "Dismissed at",
                        value: formatDateTimeValue(notification.dismissedAt) ?? "Active inbox item",
                      },
                    ].map((item) => (
                      <div
                        key={`${notification.id}-${item.label}`}
                        className="rounded border p-4"
                        style={{
                          background: "var(--background)",
                          borderColor: "var(--border)",
                          borderWidth: "1px",
                        }}
                      >
                        <p className="text-[10px] font-data uppercase tracking-[0.22em]" style={{ color: "var(--foreground-muted)" }}>
                          {item.label}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {notification.changeTypes.map((changeType) => (
                      <span
                        key={`${notification.id}-${changeType}`}
                        className="rounded border px-2 py-1 text-[10px] font-data uppercase tracking-[0.22em]"
                        style={{
                          background: "var(--background)",
                          borderColor: "var(--border)",
                          color: "var(--foreground-muted)",
                        }}
                      >
                        {formatNotificationChangeTypeLabel(changeType)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <NotificationActionButtons
                      notification={notification}
                      pending={pending}
                      onAction={(action) => handleAction(notification, action)}
                    />

                    <div className="flex flex-wrap gap-3 text-xs font-data uppercase tracking-[0.18em]">
                      <Link
                        href={`/watchlists?watchlistId=${notification.watchlistId}&entryId=${notification.watchlistEntryId}`}
                        className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                      >
                        Open Entry Detail
                      </Link>
                      {preferredBriefId ? (
                        <Link
                          href={`/briefs/${preferredBriefId}`}
                          className="rounded border px-3 py-2 transition-all duration-200 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                        >
                          {notification.relatedBriefId ? "Open Related Brief" : "Open Latest Brief"}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div
              className="rounded border p-5 text-sm leading-relaxed"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                borderWidth: "1px",
                color: "var(--foreground-secondary)",
              }}
            >
              No notifications match this inbox view yet. Stratum only creates inbox records for meaningful monitoring changes, and it keeps them in-app only.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
