/**
 * STRATUM UNIFIED API
 *
 * POST /api/analyze-unified
 *
 * Fetches company jobs from supported ATS sources and builds a Stratum watchlist brief.
 * Repeat lookups may reuse the in-memory cache unless a tracked-entry manual refresh bypasses it.
 */

import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  canWriteWorkspace,
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
import { recordMonitoringAttempt } from "@/lib/watchlists/monitoringAttemptRecorder";
import { getWatchlistEntryOverviewById } from "@/lib/watchlists/repository";
import { runStratumRefresh } from "@/lib/watchlists/refreshRunner";
import type { StratumMonitoringAttemptOrigin } from "@/lib/watchlists/monitoringEvents";
import { checkRateLimit, RateLimitExceededError } from "@/lib/security/RateLimiter";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || real || "unknown";
  return ip;
}

function resolveAttemptOrigin(forceRefresh: boolean): StratumMonitoringAttemptOrigin {
  return forceRefresh ? "manual_refresh" : "watchlist_rerun";
}

export async function POST(request: NextRequest) {
  let session:
    | Awaited<ReturnType<typeof requireAuthSession>>
    | null = null;
  let trackingContext:
    | {
        entryId: string;
        requestedQuery: string;
        attemptOrigin: StratumMonitoringAttemptOrigin;
      }
    | null = null;

  try {
    session = await requireAuthSession();
    const body = await request.json();
    const { companyName } = body;
    const requestedWatchlistEntryId =
      typeof body?.watchlistEntryId === "string" && body.watchlistEntryId.trim()
        ? body.watchlistEntryId.trim()
        : null;
    const forceRefresh = body?.forceRefresh === true;

    if (!companyName || typeof companyName !== "string") {
      return NextResponse.json(
        { success: false, error: "Company name is required" },
        { status: 400 }
      );
    }

    const trimmed = companyName.trim();
    if (trimmed.length > 100) {
      return NextResponse.json(
        { success: false, error: "Company name must be 100 characters or less" },
        { status: 400 }
      );
    }

    const sanitized = trimmed.replace(/[<>"']/g, "").slice(0, 100).trim() || trimmed;
    const trackedEntry = requestedWatchlistEntryId
      ? await getWatchlistEntryOverviewById(requestedWatchlistEntryId, {
          tenantId: session.tenantId,
        })
      : null;

    if (requestedWatchlistEntryId && !trackedEntry) {
      return NextResponse.json(
        { success: false, error: "Watchlist entry not found." },
        { status: 404 }
      );
    }

    if (trackedEntry && !canWriteWorkspace(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    trackingContext = trackedEntry
      ? {
          entryId: trackedEntry.id,
          requestedQuery: trackedEntry.requestedQuery,
          attemptOrigin: resolveAttemptOrigin(forceRefresh),
        }
      : null;

    const ip = getClientIp(request);
    checkRateLimit(ip);

    const refresh = await runStratumRefresh({
      companyName: sanitized,
      watchlistEntryId: trackedEntry?.id ?? null,
      tenantId: session.tenantId,
      attemptOrigin: trackingContext?.attemptOrigin ?? null,
      bypassCache: forceRefresh,
      manualRefreshRequested: forceRefresh,
    });

    if (refresh.watchlistEntryId) {
      revalidatePath("/watchlists");
    }

    return NextResponse.json({
      success: true,
      data: refresh.result,
      cached: refresh.cached,
      cachedAt: refresh.cachedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        { success: false, error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }
    if (trackingContext && error instanceof RateLimitExceededError) {
      try {
        if (!session) {
          throw new Error("Authenticated session was not available for rate-limit recovery.");
        }
        await recordMonitoringAttempt({
          watchlistEntryId: trackingContext.entryId,
          scope: { tenantId: session.tenantId },
          requestedQuery: trackingContext.requestedQuery,
          attemptOrigin: trackingContext.attemptOrigin,
          outcomeStatus: "failed",
          errorSummary: error.message,
        });
      } catch (eventError) {
        console.error("[Stratum API] Failed to persist monitoring attempt event:", eventError);
      }
    }

    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }

    console.error("[Stratum API] Error:", error);

    return NextResponse.json(
      { success: false, error: "Company analysis could not be completed. Please try again or check the source URL." },
      { status: 500 }
    );
  }
}
