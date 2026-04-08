import { NotificationsConsole } from "@/components/notifications/NotificationsConsole";
import {
  getNotificationInboxCounts,
  listNotificationInboxItems,
} from "@/lib/watchlists/notificationCandidateRepository";
import { resolveNotificationInboxFilter } from "@/lib/watchlists/notifications";

interface NotificationsPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const params = await searchParams;
  const activeFilter = resolveNotificationInboxFilter(
    typeof params.status === "string" ? params.status : null
  );
  const [counts, notifications] = await Promise.all([
    getNotificationInboxCounts(),
    listNotificationInboxItems({
      status: activeFilter,
      limit: 100,
    }),
  ]);

  return (
    <NotificationsConsole
      activeFilter={activeFilter}
      counts={counts}
      notifications={notifications}
    />
  );
}
