import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { runDueScheduledRefreshes } from "@/lib/watchlists/scheduledRefreshRunner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const watchlistId =
      typeof body?.watchlistId === "string" && body.watchlistId.trim()
        ? body.watchlistId.trim()
        : null;
    const requestedLimit = typeof body?.limit === "number" ? body.limit : undefined;

    const summary = await runDueScheduledRefreshes({
      watchlistId,
      limit: requestedLimit,
    });

    if (summary.processedCount > 0) {
      revalidatePath("/watchlists");
    }

    return NextResponse.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Due scheduled refreshes could not be executed.",
      },
      { status: 500 }
    );
  }
}
