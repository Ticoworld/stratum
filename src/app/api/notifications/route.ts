import { NextRequest, NextResponse } from "next/server";
import {
  getNotificationInboxCounts,
  listNotificationInboxItems,
} from "@/lib/watchlists/notificationCandidateRepository";
import { resolveNotificationInboxFilter } from "@/lib/watchlists/notifications";

export async function GET(request: NextRequest) {
  try {
    const filter = resolveNotificationInboxFilter(
      request.nextUrl.searchParams.get("status")
    );
    const notifications = await listNotificationInboxItems({
      status: filter,
      limit: 100,
    });
    const counts = await getNotificationInboxCounts();

    return NextResponse.json({
      success: true,
      data: {
        filter,
        counts,
        notifications,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Notifications could not be loaded.",
      },
      { status: 500 }
    );
  }
}
