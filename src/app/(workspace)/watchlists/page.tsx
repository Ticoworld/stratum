import { redirect } from "next/navigation";
import { WatchlistConsole } from "@/components/watchlist/WatchlistConsole";
import {
  canWriteWorkspace,
  buildSignInRedirectPath,
  requireAuthSession,
} from "@/lib/auth/session";
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
  const t0 = performance.now();
  let session;
  try {
    session = await requireAuthSession();
  } catch {
    redirect(buildSignInRedirectPath("/watchlists"));
  }
  const tAuth = performance.now();
  console.log(`[PERF] requireAuthSession: ${(tAuth - t0).toFixed(2)}ms`);

  const params = await searchParams;
  const watchlists = await listWatchlistsWithEntries(session.tenantId);
  const tList = performance.now();
  console.log(`[PERF] listWatchlistsWithEntries: ${(tList - tAuth).toFixed(2)}ms`);

  const automationStatus = getScheduledAutomationStatus();
  const preferredWatchlistId = watchlists.find((watchlist) => watchlist.slug === "default")?.id ?? null;
  const activeWatchlistId =
    params.watchlistId && watchlists.some((watchlist) => watchlist.id === params.watchlistId)
      ? params.watchlistId
      : preferredWatchlistId ?? watchlists[0]?.id ?? null;

  const tRenderStart = performance.now();
  const renderEl = (
    <WatchlistConsole
      initialWatchlists={watchlists}
      automationStatus={automationStatus}
      activeWatchlistId={activeWatchlistId}
      canWriteWorkspace={canWriteWorkspace(session.role)}
    />
  );
  console.log(`[PERF] End of React render build: ${(performance.now() - tRenderStart).toFixed(2)}ms`);
  return renderEl;
}
