import { notFound, redirect } from "next/navigation";
import {
  canWriteWorkspace,
  buildSignInRedirectPath,
  requireAuthSession,
} from "@/lib/auth/session";
import { getScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { getWatchlistEntryDetail } from "@/lib/watchlists/repository";
import { WatchlistEntryDetailPage } from "@/components/watchlist";

interface WatchlistEntryPageProps {
  params: Promise<{
    watchlistId: string;
    entryId: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function WatchlistEntryPage({ params }: WatchlistEntryPageProps) {
  let session;
  try {
    session = await requireAuthSession();
  } catch {
    const { watchlistId, entryId } = await params;
    redirect(buildSignInRedirectPath(`/watchlists/${watchlistId}/entries/${entryId}`));
  }

  const { watchlistId, entryId } = await params;
  const automationStatus = getScheduledAutomationStatus();
  
  let detail;
  try {
    detail = await getWatchlistEntryDetail({
      scope: { tenantId: session.tenantId },
      watchlistId,
      entryId,
    });
  } catch (err) {
    console.error("Failed to load watchlist entry detail:", err);
    // Graceful error handling in the page itself or via error.tsx
    // For now, we'll let the component handle null detail as a "not found" or "error" state
  }

  if (!detail) {
    notFound();
  }

  return (
    <WatchlistEntryDetailPage
      detail={detail}
      automationStatus={automationStatus}
      canWriteWorkspace={canWriteWorkspace(session.role)}
      tenantId={session.tenantId}
    />
  );
}
