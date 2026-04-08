import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createWatchlist, listWatchlistsWithEntries } from "@/lib/watchlists/repository";

export async function GET() {
  try {
    const watchlists = await listWatchlistsWithEntries();
    return NextResponse.json({
      success: true,
      data: { watchlists },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchlists could not be loaded.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name : "";
    const watchlist = await createWatchlist(name);
    revalidatePath("/watchlists");

    return NextResponse.json({
      success: true,
      data: { watchlist },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchlist could not be created.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
