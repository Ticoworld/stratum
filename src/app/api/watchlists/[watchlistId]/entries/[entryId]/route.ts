import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  canWriteWorkspace,
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
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
    const session = await requireAuthSession();
    if (!canWriteWorkspace(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { watchlistId, entryId } = await context.params;
    const removed = await removeWatchlistEntry({
      tenantId: session.tenantId,
      watchlistId,
      entryId,
    });

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
    console.error("[API] Watchlist entry removal failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json({ success: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: "Watchlist entry could not be removed. Please try again." 
    }, { status: 400 });
  }
}

export async function GET(_: Request, context: WatchlistEntryRouteContext) {
  try {
    const session = await requireAuthSession();
    const { watchlistId, entryId } = await context.params;
    const detail = await getWatchlistEntryDetail({
      scope: { tenantId: session.tenantId },
      watchlistId,
      entryId,
    });

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
    console.error("[API] Watchlist entry load failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json({ success: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: "Watchlist entry could not be loaded. Please refresh the page." 
    }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: WatchlistEntryRouteContext) {
  try {
    const session = await requireAuthSession();
    if (!canWriteWorkspace(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

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
      tenantId: session.tenantId,
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
    console.error("[API] Watchlist schedule update failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json({ success: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: "Watchlist schedule could not be updated. Please try again." 
    }, { status: 400 });
  }
}
