import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/requireTenantRole";
import { requireReportAccess } from "@/lib/auth/requireReportAccess";
import { getObjectBuffer } from "@/lib/storage/s3";

const artifactTypeSchema = z.enum(["html", "pdf"]);

type RouteContext = {
  params: Promise<{
    reportVersionId: string;
    artifactType: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { reportVersionId, artifactType: artifactTypeParam } = await context.params;
    const artifactType = artifactTypeSchema.parse(artifactTypeParam);
    const { reportVersion } = await requireReportAccess(reportVersionId, "viewer");
    const artifact = reportVersion.artifacts.find(
      (candidate) => candidate.artifactType === artifactType && candidate.status === "available"
    );

    if (!artifact?.objectKey || !artifact.mimeType) {
      return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
    }

    const body = await getObjectBuffer(artifact.objectKey);
    const fileName = `${reportVersion.report.company.canonicalName}-${reportVersion.id}.${artifactType}`;

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition":
          artifactType === "html"
            ? `inline; filename="${fileName}"`
            : `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Unsupported artifact type." }, { status: 400 });
    }

    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[artifacts] Failed to fetch artifact:", error);
    return NextResponse.json({ error: "Failed to fetch artifact." }, { status: 500 });
  }
}
