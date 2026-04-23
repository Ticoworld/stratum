import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  canWriteWorkspace,
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
import { addWatchlistEntry } from "@/lib/watchlists/repository";
import type { JobBoardSource } from "@/lib/api/boards";

const SUPPORTED_SOURCE_VALUES = new Set<JobBoardSource>(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]);

interface WatchlistEntriesRouteContext {
  params: Promise<{
    watchlistId: string;
  }>;
}

export async function POST(request: NextRequest, context: WatchlistEntriesRouteContext) {
  try {
    const session = await requireAuthSession();
    if (!canWriteWorkspace(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { watchlistId } = await context.params;
    const body = await request.json();
    const requestedQuery = typeof body?.requestedQuery === "string" ? body.requestedQuery : "";
    const briefId =
      typeof body?.briefId === "string" && body.briefId.trim() ? body.briefId.trim() : null;
    const matchedCompanyName =
      typeof body?.matchedCompanyName === "string" && body.matchedCompanyName.trim()
        ? body.matchedCompanyName.trim()
        : null;
    const atsSourceUsed =
      typeof body?.atsSourceUsed === "string" && body.atsSourceUsed.trim() && SUPPORTED_SOURCE_VALUES.has(body.atsSourceUsed.trim() as JobBoardSource)
        ? (body.atsSourceUsed.trim() as JobBoardSource)
        : null;

    const result = await addWatchlistEntry({
      tenantId: session.tenantId,
      watchlistId,
      requestedQuery,
      briefId,
      latestMatchedCompanyName: matchedCompanyName,
      latestAtsSourceUsed: atsSourceUsed,
    });
    revalidatePath("/watchlists");

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[API] Watchlist entry save failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json({ success: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: "Watchlist entry could not be saved. Please try again." 
    }, { status: 400 });
  }
}
