import { NextResponse } from "next/server";
import { isUnauthorizedError, requireAuthSession } from "@/lib/auth/session";
import { getNotificationInboxCounts } from "@/lib/watchlists/notificationCandidateRepository";

export async function GET() {
  try {
    const session = await requireAuthSession();
    const counts = await getNotificationInboxCounts({ tenantId: session.tenantId });

    return NextResponse.json({
      success: true,
      data: { unreadCount: counts.unreadCount },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] Unread notification count failed:", error);

    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        { success: false, error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Unread count could not be loaded." },
      { status: 500 }
    );
  }
}
