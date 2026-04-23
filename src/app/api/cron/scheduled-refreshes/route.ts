/**
 * Automatic scheduled refresh execution for cron-enabled deployments.
 *
 * This route is intended to be invoked by Vercel Cron via `vercel.json`.
 * It stays callable from other schedulers too, but only with the configured
 * cron secret or the platform cron header.
 */

import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  getScheduledAutomationStatus,
  getScheduledCronBatchLimit,
  getScheduledCronSecret,
} from "@/lib/watchlists/automation";
import { runDueScheduledRefreshes } from "@/lib/watchlists/scheduledRefreshRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = getScheduledCronSecret();
  const authorization = request.headers.get("authorization");

  if (cronSecret) {
    return authorization === `Bearer ${cronSecret}`;
  }

  return request.headers.has("x-vercel-cron");
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized cron request.",
      },
      { status: 401 }
    );
  }

  try {
    const summary = await runDueScheduledRefreshes({
      scope: { globalScheduler: true },
      limit: getScheduledCronBatchLimit(),
    });

    if (summary.processedCount > 0) {
      revalidatePath("/watchlists");
    }

    return NextResponse.json({
      success: true,
      data: summary,
      automation: getScheduledAutomationStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Automatic scheduled refreshes could not be executed.",
      },
      { status: 500 }
    );
  }
}
