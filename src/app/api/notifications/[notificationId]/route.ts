import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { updateNotificationInboxState } from "@/lib/watchlists/notificationCandidateRepository";

interface NotificationRouteContext {
  params: Promise<{
    notificationId: string;
  }>;
}

export async function PATCH(request: Request, context: NotificationRouteContext) {
  try {
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
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Notification could not be updated.",
      },
      { status: 500 }
    );
  }
}
