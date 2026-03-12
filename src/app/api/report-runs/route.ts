import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError, requireTenantRole } from "@/lib/auth/requireTenantRole";
import { createReportRun } from "@/lib/reports/createReportRun";

export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantRole("analyst");
    const body = await request.json();

    const result = await createReportRun({
      tenantId: session.tenantId,
      requestedByUserId: session.user.id,
      companyName: body?.companyName,
      websiteDomain: body?.websiteDomain,
    });

    return NextResponse.json(
      {
        reportRunId: result.reportRunId,
        companyId: result.companyId,
        status: result.status,
        statusUrl: `/api/report-runs/${result.reportRunId}`,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Invalid report-run request.",
        },
        { status: 400 }
      );
    }

    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[report-runs] Failed to create report run:", error);
    return NextResponse.json({ error: "Failed to create report run." }, { status: 500 });
  }
}
