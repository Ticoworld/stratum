"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NOTIFICATIONS_UPDATED_EVENT } from "@/components/shell/AppShell";

const UNREAD_COUNT_ENDPOINT = "/api/notifications/unread-count";

function formatUnreadLabel(count: number | null): string | null {
  if (!count || count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

/**
 * Compact "Inbox" entry point for pages that render without the AppShell
 * sidebar (e.g. /watchlists and the entry detail page use variant="minimal").
 * Links to /notifications and shows the unread count via the same endpoint
 * and refresh event the sidebar badge uses.
 */
export function NotificationsInboxLink({ className }: { className?: string }) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  const loadUnreadCount = useCallback(() => {
    fetch(UNREAD_COUNT_ENDPOINT)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (typeof data?.data?.unreadCount === "number") {
          setUnreadCount(data.data.unreadCount);
        }
      })
      .catch(() => {
        // Badge stays hidden if the count can't be loaded.
      });
  }, []);

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount]);

  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, loadUnreadCount);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, loadUnreadCount);
  }, [loadUnreadCount]);

  const unreadLabel = formatUnreadLabel(unreadCount);

  return (
    <Link
      href="/notifications"
      className={
        className ??
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-semibold transition-colors hover:bg-[var(--surface-elevated)]"
      }
      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
    >
      <Bell className="h-4 w-4" />
      Inbox
      {unreadLabel ? (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{ background: "var(--accent)", color: "var(--background)" }}
        >
          {unreadLabel}
        </span>
      ) : null}
    </Link>
  );
}
