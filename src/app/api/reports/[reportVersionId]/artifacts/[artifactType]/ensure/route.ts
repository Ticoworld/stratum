import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureReportArtifact } from "@/lib/artifacts/ensureReportArtifact";
import { requireReportAccess } from "@/lib/auth/requireReportAccess";
import { AuthorizationError } from "@/lib/auth/requireTenantRole";

const ensureArtifactTypeSchema = z.literal("pdf");

type RouteContext = {
  params: Promise<{
    reportVersionId: string;
    artifactType: string;
  }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { reportVersionId, artifactType: artifactTypeParam } = await context.params;
    const artifactType = ensureArtifactTypeSchema.parse(artifactTypeParam);
    await requireReportAccess(reportVersionId, "analyst");
    const artifact = await ensureReportArtifact({
      reportVersionId,
      artifactType,
    });

    return NextResponse.json({
      reportVersionId,
      artifactType: artifact.artifactType,
      status: artifact.status,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
      sha256: artifact.sha256,
      completedAt: artifact.completedAt,
      failureCode: artifact.failureCode,
      failureMessage: artifact.failureMessage,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Only PDF ensure is supported." }, { status: 400 });
    }

    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes("Object storage is not configured")) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("[artifacts] Failed to ensure artifact:", error);
    return NextResponse.json({ error: "Failed to ensure artifact." }, { status: 500 });
  }
}
