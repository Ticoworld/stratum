import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getWatchlistEntryDetail,
  removeWatchlistEntry,
  updateWatchlistEntrySchedule,
} from "@/lib/watchlists/repository";
import type { StratumWatchlistScheduleCadence } from "@/lib/watchlists/schedules";

interface WatchlistEntryRouteContext {
  params: Promise<{
    watchlistId: string;
    entryId: string;
  }>;
}

export async function DELETE(_: Request, context: WatchlistEntryRouteContext) {
  try {
    const { watchlistId, entryId } = await context.params;
    const removed = await removeWatchlistEntry({ watchlistId, entryId });

    if (!removed) {
      return NextResponse.json(
        { success: false, error: "Watchlist entry not found." },
        { status: 404 }
      );
    }

    revalidatePath("/watchlists");

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchlist entry could not be removed.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(_: Request, context: WatchlistEntryRouteContext) {
  try {
    const { watchlistId, entryId } = await context.params;
    const detail = await getWatchlistEntryDetail({ watchlistId, entryId });

    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Watchlist entry not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchlist entry could not be loaded.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: WatchlistEntryRouteContext) {
  try {
    const { watchlistId, entryId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const scheduleCadence =
      typeof body?.scheduleCadence === "string" ? body.scheduleCadence.trim() : "";

    if (!["off", "daily", "weekly"].includes(scheduleCadence)) {
      return NextResponse.json(
        { success: false, error: "A valid schedule cadence is required." },
        { status: 400 }
      );
    }

    const detail = await updateWatchlistEntrySchedule({
      watchlistId,
      entryId,
      cadence: scheduleCadence as StratumWatchlistScheduleCadence,
    });

    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Watchlist entry not found." },
        { status: 404 }
      );
    }

    revalidatePath("/watchlists");

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchlist schedule could not be updated.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
