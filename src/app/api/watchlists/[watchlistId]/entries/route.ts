import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { addWatchlistEntry } from "@/lib/watchlists/repository";

interface WatchlistEntriesRouteContext {
  params: Promise<{
    watchlistId: string;
  }>;
}

export async function POST(request: NextRequest, context: WatchlistEntriesRouteContext) {
  try {
    const { watchlistId } = await context.params;
    const body = await request.json();
    const requestedQuery = typeof body?.requestedQuery === "string" ? body.requestedQuery : "";
    const briefId =
      typeof body?.briefId === "string" && body.briefId.trim() ? body.briefId.trim() : null;

    const result = await addWatchlistEntry({
      watchlistId,
      requestedQuery,
      briefId,
    });
    revalidatePath("/watchlists");

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchlist entry could not be saved.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
