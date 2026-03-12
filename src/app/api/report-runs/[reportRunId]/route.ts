import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireTenantRole } from "@/lib/auth/requireTenantRole";
import { getReportRun } from "@/lib/reports/getReportRun";

type RouteContext = {
  params: Promise<{
    reportRunId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireTenantRole("viewer");
    const { reportRunId } = await context.params;

    const reportRun = await getReportRun({
      reportRunId,
      tenantId: session.tenantId,
    });

    if (!reportRun) {
      return NextResponse.json({ error: "Report run not found." }, { status: 404 });
    }

    return NextResponse.json(reportRun);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[report-runs] Failed to load report run:", error);
    return NextResponse.json({ error: "Failed to load report run." }, { status: 500 });
  }
}
