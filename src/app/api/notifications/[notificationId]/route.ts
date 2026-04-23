import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  canWriteWorkspace,
  isUnauthorizedError,
  requireAuthSession,
} from "@/lib/auth/session";
import { updateNotificationInboxState } from "@/lib/watchlists/notificationCandidateRepository";

interface NotificationRouteContext {
  params: Promise<{
    notificationId: string;
  }>;
}

export async function PATCH(request: Request, context: NotificationRouteContext) {
  try {
    const session = await requireAuthSession();
    if (!canWriteWorkspace(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { notificationId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action.trim() : "";

    if (!["mark_read", "mark_unread", "dismiss"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "A valid notification action is required." },
        { status: 400 }
      );
    }

    const notification = await updateNotificationInboxState({
      notificationId,
      scope: { tenantId: session.tenantId },
      action: action as "mark_read" | "mark_unread" | "dismiss",
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: "Notification not found." },
        { status: 404 }
      );
    }

    revalidatePath("/notifications");
    revalidatePath("/");
    revalidatePath("/watchlists");

    return NextResponse.json({
      success: true,
      data: notification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] Notification update failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        { success: false, error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: "Notification state could not be updated. Please try again." },
      { status: 500 }
    );
  }
}
