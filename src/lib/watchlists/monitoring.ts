import type { StratumResult } from "@/lib/services/StratumInvestigator";
import type { WatchlistMonitoringSnapshot } from "@/lib/watchlists/repository";

export function attachWatchlistMonitoringToResult(
  result: StratumResult,
  monitoring: (WatchlistMonitoringSnapshot & { briefPosition?: "latest" | "previous" | "older" }) | null
): StratumResult {
  if (!monitoring) return result;

  return {
    ...result,
    watchlistEntryId: monitoring.entryId,
    watchlistId: monitoring.watchlistId,
    watchlistName: monitoring.watchlistName,
    watchlistMonitoring: monitoring,
  };
}
