import { TruthConsole } from "@/components/truth/TruthConsole";
import { getScheduledAutomationStatus } from "@/lib/watchlists/automation";

interface HomePageProps {
  searchParams: Promise<{
    company?: string;
    watchlistId?: string;
    watchlistEntryId?: string;
    autorun?: string;
    manualRefresh?: string;
  }>;
}

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const automationStatus = getScheduledAutomationStatus();

  return (
    <main className="h-screen overflow-hidden">
      <TruthConsole
        automationStatus={automationStatus}
        initialQuery={typeof params.company === "string" ? params.company : ""}
        initialWatchlistId={typeof params.watchlistId === "string" ? params.watchlistId : null}
        initialWatchlistEntryId={
          typeof params.watchlistEntryId === "string" ? params.watchlistEntryId : null
        }
        autoRun={params.autorun === "1"}
        initialManualRefresh={params.manualRefresh === "1"}
      />
    </main>
  );
}
