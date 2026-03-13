"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  describeArtifactStatus,
  type ReportArtifactStatus,
} from "@/lib/artifacts/status";

type ReportArtifactActionsProps = {
  reportVersionId: string;
  htmlStatus: ReportArtifactStatus;
  pdfStatus: ReportArtifactStatus;
};

export function ReportArtifactActions({
  reportVersionId,
  htmlStatus,
  pdfStatus,
}: ReportArtifactActionsProps) {
  const [loading, setLoading] = useState(false);
  const [localPdfStatus, setLocalPdfStatus] = useState<ReportArtifactStatus>(pdfStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalPdfStatus(pdfStatus);
  }, [pdfStatus]);

  async function ensurePdf() {
    setLoading(true);
    setError(null);
    setLocalPdfStatus("rendering");

    try {
      const response = await fetch(`/api/reports/${reportVersionId}/artifacts/pdf/ensure`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            status?: ReportArtifactStatus;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to ensure PDF.");
      }

      setLocalPdfStatus(payload?.status ?? "available");
    } catch (fetchError) {
      setLocalPdfStatus("failed");
      setError(fetchError instanceof Error ? fetchError.message : "Failed to ensure PDF.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Link className="rounded-full border px-4 py-2 text-white" style={{ borderColor: "var(--border)" }} href="/">
        Back to home
      </Link>
      {htmlStatus === "available" ? (
        <Link
          className="rounded-full border px-4 py-2 text-white"
          style={{ borderColor: "var(--border)" }}
          href={`/api/reports/${reportVersionId}/artifacts/html`}
        >
          Open standalone HTML
        </Link>
      ) : (
        <span style={{ color: "var(--foreground-secondary)" }}>
          Web report: {describeArtifactStatus(htmlStatus)}
        </span>
      )}
      {localPdfStatus === "available" ? (
        <Link
          className="rounded-full px-4 py-2 text-white"
          style={{ background: "var(--accent)" }}
          href={`/api/reports/${reportVersionId}/artifacts/pdf`}
        >
          Download PDF
        </Link>
      ) : localPdfStatus === "queued" || localPdfStatus === "rendering" ? (
        <span style={{ color: "var(--foreground-secondary)" }}>PDF is being prepared automatically</span>
      ) : (
        <button
          type="button"
          onClick={() => void ensurePdf()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-white disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {localPdfStatus === "failed" ? "Retry PDF generation" : "Generate PDF now"}
        </button>
      )}
      {error ? <p style={{ color: "#fecaca" }}>{error}</p> : null}
    </div>
  );
}
