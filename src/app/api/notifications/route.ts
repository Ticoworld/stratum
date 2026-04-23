import { NextRequest, NextResponse } from "next/server";
import {
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
import {
  getNotificationInboxCounts,
  listNotificationInboxItems,
} from "@/lib/watchlists/notificationCandidateRepository";
import { resolveNotificationInboxFilter } from "@/lib/watchlists/notifications";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthSession();
    const filter = resolveNotificationInboxFilter(
      request.nextUrl.searchParams.get("status")
    );
    const notifications = await listNotificationInboxItems({
      scope: { tenantId: session.tenantId },
      status: filter,
      limit: 100,
    });
    const counts = await getNotificationInboxCounts({ tenantId: session.tenantId });

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
    console.error("[API] Notifications load failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        { success: false, error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: "Notifications could not be loaded. Please refresh the page." },
      { status: 500 }
    );
  }
}
