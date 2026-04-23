import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  canWriteWorkspace,
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
import { resolveWatchlistByIdOrDefault } from "@/lib/watchlists/repository";
import { runDueScheduledRefreshes } from "@/lib/watchlists/scheduledRefreshRunner";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();
    if (!canWriteWorkspace(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const watchlistId =
      typeof body?.watchlistId === "string" && body.watchlistId.trim()
        ? body.watchlistId.trim()
        : null;
    const requestedLimit = typeof body?.limit === "number" ? body.limit : undefined;

    if (watchlistId) {
      const watchlist = await resolveWatchlistByIdOrDefault({
        tenantId: session.tenantId,
        watchlistId,
      });

      if (!watchlist) {
        return NextResponse.json(
          { success: false, error: "Watchlist not found." },
          { status: 404 }
        );
      }
    }

    const summary = await runDueScheduledRefreshes({
      scope: { tenantId: session.tenantId },
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
    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }
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
