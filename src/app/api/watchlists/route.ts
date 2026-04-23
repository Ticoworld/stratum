import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  canWriteWorkspace,
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
import { createWatchlist, listWatchlistsWithEntries } from "@/lib/watchlists/repository";

export async function GET() {
  try {
    const session = await requireAuthSession();
    const watchlists = await listWatchlistsWithEntries(session.tenantId);
    return NextResponse.json({
      success: true,
      data: { watchlists },
    });
  } catch (error) {
    console.error("[API] Watchlists load failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: "Watchlists could not be loaded. Please refresh the page." 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();
    if (!canWriteWorkspace(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name : "";
    const watchlist = await createWatchlist({
      tenantId: session.tenantId,
      name,
    });
    revalidatePath("/watchlists");

    return NextResponse.json({
      success: true,
      data: { watchlist },
    });
  } catch (error) {
    console.error("[API] Watchlist creation failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json({ success: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
    }
    
    // Sanitize message to prevent leaking SQL/internal details
    return NextResponse.json({ 
      success: false, 
      error: "Watchlist could not be created. Please try again." 
    }, { status: 400 });
  }
}
