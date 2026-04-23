import { NextResponse } from "next/server";
import {
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
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
    const session = await requireAuthSession();
    const brief = await getStratumBriefById(briefId, { tenantId: session.tenantId });
    if (!brief) {
      return NextResponse.json({ success: false, error: "Brief not found" }, { status: 404 });
    }

    const replayContext = brief.watchlistEntryId
      ? await getWatchlistBriefReplayContext({
          scope: { tenantId: session.tenantId },
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
    console.error("[API] Brief load failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        { success: false, error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "The requested brief could not be loaded. Please refresh the page." },
      { status: 500 }
    );
  }
}
