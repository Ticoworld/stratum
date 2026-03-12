import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireTenantRole } from "@/lib/auth/requireTenantRole";
import { getReportVersion } from "@/lib/reports/getReportVersion";

type RouteContext = {
  params: Promise<{
    reportVersionId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireTenantRole("viewer");
    const { reportVersionId } = await context.params;
    const reportVersion = await getReportVersion({
      reportVersionId,
      tenantId: session.tenantId,
    });

    if (!reportVersion) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json({
      reportVersionId: reportVersion.id,
      reportRunId: reportVersion.reportRunId,
      companyId: reportVersion.companyId,
      status: reportVersion.status,
      versionNumber: reportVersion.versionNumber,
      templateVersion: reportVersion.templateVersion,
      generatedAt: reportVersion.generatedAt,
      publishedAt: reportVersion.publishedAt,
      artifactAvailability: {
        html: false,
        pdf: false,
      },
      report: reportVersion.report,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[reports] Failed to load report version:", error);
    return NextResponse.json({ error: "Failed to load report." }, { status: 500 });
  }
}
