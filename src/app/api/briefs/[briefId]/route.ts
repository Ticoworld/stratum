import { NextResponse } from "next/server";
import { getStratumBriefById } from "@/lib/briefs/repository";
import { attachWatchlistMonitoringToResult } from "@/lib/watchlists/monitoring";
import { getWatchlistBriefReplayContext } from "@/lib/watchlists/repository";

type RouteContext = {
  params: Promise<{
    briefId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { briefId } = await context.params;

  if (!briefId || typeof briefId !== "string") {
    return NextResponse.json({ success: false, error: "Brief ID is required" }, { status: 400 });
  }

  try {
    const brief = await getStratumBriefById(briefId);
    if (!brief) {
      return NextResponse.json({ success: false, error: "Brief not found" }, { status: 404 });
    }

    const replayContext = brief.watchlistEntryId
      ? await getWatchlistBriefReplayContext({
          watchlistEntryId: brief.watchlistEntryId,
          briefId: brief.id,
        })
      : null;
    const resultSnapshot = attachWatchlistMonitoringToResult(
      {
        ...brief.resultSnapshot,
        watchlistEntryId: brief.watchlistEntryId ?? brief.resultSnapshot.watchlistEntryId,
      },
      replayContext?.monitoring ?? null
    );

    return NextResponse.json({
      success: true,
      data: {
        ...brief,
        resultSnapshot,
        watchlistMonitoring: replayContext?.monitoring ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Stratum Brief API] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
