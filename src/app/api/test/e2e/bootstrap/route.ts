import { NextResponse } from "next/server";
import { seedE2eFixtures } from "@/lib/testing/e2eFixtures";
import { isEnabledTestRoute } from "@/lib/testing/testRoutes";

export async function POST(request: Request) {
  if (!isEnabledTestRoute(request)) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const runKey =
      typeof body?.runKey === "string" && body.runKey.trim() ? body.runKey.trim() : null;

    if (!runKey) {
      return NextResponse.json(
        { success: false, error: "runKey is required." },
        { status: 400 }
      );
    }

    const data = await seedE2eFixtures(runKey);

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Fixture bootstrap failed.",
      },
      { status: 500 }
    );
  }
}
