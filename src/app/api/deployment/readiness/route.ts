import { NextResponse } from "next/server";
import { getDeploymentReadinessSummary } from "@/lib/deployment/readiness";

export async function GET() {
  try {
    const readiness = await getDeploymentReadinessSummary();

    return NextResponse.json(readiness);
  } catch (error) {
    console.error("[deployment] Failed to compute readiness:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to compute deployment readiness.",
      },
      { status: 500 }
    );
  }
}
