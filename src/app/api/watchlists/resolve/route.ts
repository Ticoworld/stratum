import { NextRequest, NextResponse } from "next/server";
import { isUnauthorizedError, requireAuthSession } from "@/lib/auth/session";
import { resolveCompanyIntake } from "@/lib/watchlists/intakeResolution";

export async function POST(request: NextRequest) {
  try {
    await requireAuthSession();

    const body = await request.json().catch(() => ({}));
    const input = typeof body?.input === "string" ? body.input : "";
    const resolution = await resolveCompanyIntake(input);

    return NextResponse.json({
      success: true,
      data: resolution,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] Watchlist resolve failed:", error);
    
    if (isUnauthorizedError(error)) {
      return NextResponse.json({ success: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
    }

    return NextResponse.json({ 
      success: false, 
      error: "Could not verify company details. Please check the provided information." 
    }, { status: 400 });
  }
}
