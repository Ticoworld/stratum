import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireTenantRole } from "@/lib/auth/requireTenantRole";
import { listReportVersions } from "@/lib/reports/listReportVersions";

export async function GET(request: NextRequest) {
  try {
    const session = await requireTenantRole("viewer");
    const companyId = request.nextUrl.searchParams.get("companyId") ?? undefined;
    const reports = await listReportVersions({
      tenantId: session.tenantId,
      companyId,
    });

    return NextResponse.json({
      reports,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[reports] Failed to list report versions:", error);
    return NextResponse.json({ error: "Failed to list reports." }, { status: 500 });
  }
}
