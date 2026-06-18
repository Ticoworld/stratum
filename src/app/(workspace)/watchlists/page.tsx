import { redirect } from "next/navigation";
import { WatchlistConsole } from "@/components/watchlist/WatchlistConsole";
import {
  canWriteWorkspace,
  buildSignInRedirectPath,
  requireAuthSession,
} from "@/lib/auth/session";
import { getScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { listWatchlistsWithEntries } from "@/lib/watchlists/repository";

interface WatchlistsPageProps {
  searchParams: Promise<{
    watchlistId?: string;
    entryId?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function WatchlistsPage({ searchParams }: WatchlistsPageProps) {
  let session;
  try {
    session = await requireAuthSession();
  } catch {
    redirect(buildSignInRedirectPath("/watchlists"));
  }

  const params = await searchParams;
  const watchlists = await listWatchlistsWithEntries(session.tenantId);

  const automationStatus = getScheduledAutomationStatus();
  const preferredWatchlistId = watchlists.find((watchlist) => watchlist.slug === "default")?.id ?? null;
  const activeWatchlistId =
    params.watchlistId && watchlists.some((watchlist) => watchlist.id === params.watchlistId)
      ? params.watchlistId
      : preferredWatchlistId ?? watchlists[0]?.id ?? null;

  return (
    <WatchlistConsole
      initialWatchlists={watchlists}
      automationStatus={automationStatus}
      activeWatchlistId={activeWatchlistId}
      canWriteWorkspace={canWriteWorkspace(session.role)}
    />
  );
}
