import { WatchlistConsole } from "@/components/watchlist/WatchlistConsole";
import { getScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { getWatchlistEntryDetail, listWatchlistsWithEntries } from "@/lib/watchlists/repository";

interface WatchlistsPageProps {
  searchParams: Promise<{
    watchlistId?: string;
    entryId?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function WatchlistsPage({ searchParams }: WatchlistsPageProps) {
  const params = await searchParams;
  const watchlists = await listWatchlistsWithEntries();
  const automationStatus = getScheduledAutomationStatus();
  const activeWatchlistId =
    params.watchlistId && watchlists.some((watchlist) => watchlist.id === params.watchlistId)
      ? params.watchlistId
      : watchlists[0]?.id ?? null;
  const activeWatchlist =
    watchlists.find((watchlist) => watchlist.id === activeWatchlistId) ?? null;
  const activeEntryId =
    params.entryId && activeWatchlist?.entries.some((entry) => entry.id === params.entryId)
      ? params.entryId
      : null;
  const activeEntryDetail =
    activeWatchlistId && activeEntryId
      ? await getWatchlistEntryDetail({
          watchlistId: activeWatchlistId,
          entryId: activeEntryId,
        })
      : null;

  return (
    <WatchlistConsole
      initialWatchlists={watchlists}
      automationStatus={automationStatus}
      activeWatchlistId={activeWatchlistId}
      activeEntryId={activeEntryId}
      activeEntryDetail={activeEntryDetail}
    />
  );
}
