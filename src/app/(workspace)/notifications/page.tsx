import { redirect } from "next/navigation";
import { NotificationsConsole } from "@/components/notifications/NotificationsConsole";
import {
  buildSignInRedirectPath,
  requireAuthSession,
} from "@/lib/auth/session";
import {
  getNotificationInboxCounts,
  listNotificationInboxItems,
} from "@/lib/watchlists/notificationCandidateRepository";
import {
  buildDevelopmentNotificationInboxPreview,
  resolveNotificationInboxFilter,
} from "@/lib/watchlists/notifications";

interface NotificationsPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  let session;
  try {
    session = await requireAuthSession();
  } catch {
    redirect(buildSignInRedirectPath("/notifications"));
  }

  const params = await searchParams;
  const activeFilter = resolveNotificationInboxFilter(
    typeof params.status === "string" ? params.status : null
  );
  const [counts, notifications] = await Promise.all([
    getNotificationInboxCounts({ tenantId: session.tenantId }),
    listNotificationInboxItems({
      scope: { tenantId: session.tenantId },
      status: activeFilter,
      limit: 100,
    }),
  ]);

  const usePreviewInbox =
    process.env.NODE_ENV !== "production" &&
    counts.totalCount === 0 &&
    notifications.length === 0;
  const previewState = usePreviewInbox
    ? buildDevelopmentNotificationInboxPreview({ status: activeFilter })
    : null;

  return (
    <NotificationsConsole
      activeFilter={activeFilter}
      counts={previewState?.counts ?? counts}
      notifications={previewState?.notifications ?? notifications}
      previewMode={usePreviewInbox}
    />
  );
}
