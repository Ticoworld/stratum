import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { artifacts } from "@/db/schema";
import { renderReportHtml } from "@/lib/artifacts/renderReportHtml";
import { renderReportPdf } from "@/lib/artifacts/renderReportPdf";
import { type LoadedPublishedReportVersion, loadPublishedReportVersion } from "@/lib/reports/loadPublishedReportVersion";
import { sha256Hex } from "@/lib/storage/checksums";
import {
  buildReportHtmlObjectKey,
  buildReportPdfObjectKey,
} from "@/lib/storage/objectKeys";
import { getObjectText, putObject } from "@/lib/storage/s3";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientArtifactError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error ?? "").toLowerCase();

  return [
    "timeout",
    "timed out",
    "service unavailable",
    "temporarily unavailable",
    "connection reset",
    "network",
    "socket",
    "econnreset",
    "etimedout",
  ].some((pattern) => message.includes(pattern));
}

async function withArtifactRetries<T>(
  artifactType: ReportArtifactType,
  reportVersionId: string,
  action: () => Promise<T>
) {
  const maxAttempts = artifactType === "pdf" ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (!isTransientArtifactError(error) || attempt === maxAttempts) {
        throw error;
      }

      const waitMs = attempt * 1500;
      console.warn(
        `[artifacts] Transient ${artifactType.toUpperCase()} render failure for report ${reportVersionId}; retrying in ${waitMs}ms.`,
        error
      );
      await sleep(waitMs);
    }
  }

  throw new Error(`Unexpected ${artifactType.toUpperCase()} artifact retry exhaustion.`);
}

export type ReportArtifactType = "html" | "pdf";

export interface EnsuredReportArtifact {
  id: string;
  reportVersionId: string;
  artifactType: ReportArtifactType;
  status: string;
  objectKey: string | null;
  mimeType: string | null;
  byteSize: number | null;
  sha256: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

async function getArtifactRecord(
  reportVersionId: string,
  artifactType: ReportArtifactType
): Promise<EnsuredReportArtifact | null> {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.reportVersionId, reportVersionId), eq(artifacts.artifactType, artifactType)))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    artifactType,
  };
}

async function upsertArtifactStatus(params: {
  reportVersionId: string;
  artifactType: ReportArtifactType;
  status: string;
  objectKey?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  completedAt?: Date | null;
}) {
  const existing = await getArtifactRecord(params.reportVersionId, params.artifactType);

  const values = {
    reportVersionId: params.reportVersionId,
    artifactType: params.artifactType,
    status: params.status,
    objectKey: params.objectKey ?? null,
    mimeType: params.mimeType ?? null,
    byteSize: params.byteSize ?? null,
    sha256: params.sha256 ?? null,
    failureCode: params.failureCode ?? null,
    failureMessage: params.failureMessage ?? null,
    completedAt: params.completedAt ?? null,
  };

  if (existing) {
    await db.update(artifacts).set(values).where(eq(artifacts.id, existing.id));
    return;
  }

  await db.insert(artifacts).values({
    id: randomUUID(),
    createdAt: new Date(),
    ...values,
  });
}

async function getPublishedReport(reportVersionId: string): Promise<LoadedPublishedReportVersion> {
  const reportVersion = await loadPublishedReportVersion({ reportVersionId });

  if (!reportVersion) {
    throw new Error(`Published report version ${reportVersionId} was not found.`);
  }

  return reportVersion;
}

async function ensureHtmlArtifact(reportVersionId: string): Promise<EnsuredReportArtifact> {
  const existing = await getArtifactRecord(reportVersionId, "html");

  if (existing?.status === "available" && existing.objectKey) {
    return existing;
  }

  await upsertArtifactStatus({
    reportVersionId,
    artifactType: "html",
    status: "rendering",
    failureCode: null,
    failureMessage: null,
    completedAt: null,
  });

  try {
    await withArtifactRetries("html", reportVersionId, async () => {
      const reportVersion = await getPublishedReport(reportVersionId);
      const html = renderReportHtml(reportVersion.report);
      const objectKey = buildReportHtmlObjectKey(reportVersionId);
      const buffer = Buffer.from(html, "utf8");
      const sha256 = sha256Hex(buffer);
      const completedAt = new Date();

      await putObject({
        key: objectKey,
        body: buffer,
        contentType: "text/html; charset=utf-8",
      });

      await upsertArtifactStatus({
        reportVersionId,
        artifactType: "html",
        status: "available",
        objectKey,
        mimeType: "text/html; charset=utf-8",
        byteSize: buffer.byteLength,
        sha256,
        completedAt,
      });
    });
  } catch (error) {
    await upsertArtifactStatus({
      reportVersionId,
      artifactType: "html",
      status: "failed",
      failureCode: "html_render_failed",
      failureMessage: error instanceof Error ? error.message : "Unknown HTML render failure.",
      completedAt: new Date(),
    });
    throw error;
  }

  const rendered = await getArtifactRecord(reportVersionId, "html");

  if (!rendered) {
    throw new Error(`HTML artifact metadata for ${reportVersionId} was not persisted.`);
  }

  return rendered;
}

async function ensurePdfArtifact(reportVersionId: string): Promise<EnsuredReportArtifact> {
  const existing = await getArtifactRecord(reportVersionId, "pdf");

  if (existing?.status === "available" && existing.objectKey) {
    return existing;
  }

  await upsertArtifactStatus({
    reportVersionId,
    artifactType: "pdf",
    status: "rendering",
    failureCode: null,
    failureMessage: null,
    completedAt: null,
  });

  try {
    await withArtifactRetries("pdf", reportVersionId, async () => {
      const htmlArtifact = await ensureHtmlArtifact(reportVersionId);

      if (!htmlArtifact.objectKey) {
        throw new Error(`HTML artifact for ${reportVersionId} is missing its object key.`);
      }

      const html = await getObjectText(htmlArtifact.objectKey);
      const pdf = await renderReportPdf(html);
      const objectKey = buildReportPdfObjectKey(reportVersionId);
      const sha256 = sha256Hex(pdf);
      const completedAt = new Date();

      await putObject({
        key: objectKey,
        body: pdf,
        contentType: "application/pdf",
      });

      await upsertArtifactStatus({
        reportVersionId,
        artifactType: "pdf",
        status: "available",
        objectKey,
        mimeType: "application/pdf",
        byteSize: pdf.byteLength,
        sha256,
        completedAt,
      });
    });
  } catch (error) {
    await upsertArtifactStatus({
      reportVersionId,
      artifactType: "pdf",
      status: "failed",
      failureCode: "pdf_render_failed",
      failureMessage: error instanceof Error ? error.message : "Unknown PDF render failure.",
      completedAt: new Date(),
    });
    throw error;
  }

  const rendered = await getArtifactRecord(reportVersionId, "pdf");

  if (!rendered) {
    throw new Error(`PDF artifact metadata for ${reportVersionId} was not persisted.`);
  }

  return rendered;
}

export async function ensureReportArtifact(params: {
  reportVersionId: string;
  artifactType: ReportArtifactType;
}): Promise<EnsuredReportArtifact> {
  if (params.artifactType === "html") {
    return ensureHtmlArtifact(params.reportVersionId);
  }

  return ensurePdfArtifact(params.reportVersionId);
}

export async function renderPublishedReportArtifacts(reportVersionId: string) {
  const html = await ensureReportArtifact({
    reportVersionId,
    artifactType: "html",
  });
  const pdf = await ensureReportArtifact({
    reportVersionId,
    artifactType: "pdf",
  });

  return { html, pdf };
}
