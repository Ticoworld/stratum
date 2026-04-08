import { notFound } from "next/navigation";
import { TruthConsole } from "@/components/truth/TruthConsole";
import { getStratumBriefById } from "@/lib/briefs/repository";
import { getScheduledAutomationStatus } from "@/lib/watchlists/automation";
import { attachWatchlistMonitoringToResult } from "@/lib/watchlists/monitoring";
import { getWatchlistBriefReplayContext } from "@/lib/watchlists/repository";

type BriefPageProps = {
  params: Promise<{
    briefId: string;
  }>;
};

export default async function StratumBriefPage({ params }: BriefPageProps) {
  const { briefId } = await params;
  const brief = await getStratumBriefById(briefId);
  const automationStatus = getScheduledAutomationStatus();

  if (!brief) {
    notFound();
  }

  const replayContext = brief.watchlistEntryId
    ? await getWatchlistBriefReplayContext({
        watchlistEntryId: brief.watchlistEntryId,
        briefId: brief.id,
      })
    : null;
  const initialResult = attachWatchlistMonitoringToResult(
    {
      ...brief.resultSnapshot,
      watchlistEntryId: brief.watchlistEntryId ?? brief.resultSnapshot.watchlistEntryId,
    },
    replayContext?.monitoring ?? null
  );

  return (
    <main className="h-screen overflow-hidden">
      <TruthConsole automationStatus={automationStatus} initialResult={initialResult} />
    </main>
  );
}
