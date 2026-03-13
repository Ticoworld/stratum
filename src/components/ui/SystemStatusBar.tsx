"use client";

import {
  describeArtifactStatus,
  type ReportArtifactStatus,
} from "@/lib/artifacts/status";
import { presentDataMode } from "@/lib/reports/presentation";

interface SystemStatusBarProps {
  reportStatus?: string | null;
  dataMode?: string | null;
  htmlStatus?: ReportArtifactStatus | null;
  pdfStatus?: ReportArtifactStatus | null;
  inline?: boolean;
}

function formatArtifactStatus(status: ReportArtifactStatus | null | undefined) {
  if (!status) {
    return "Pending";
  }
  return describeArtifactStatus(status);
}

export function SystemStatusBar({
  reportStatus = null,
  dataMode = null,
  htmlStatus = null,
  pdfStatus = null,
  inline = false,
}: SystemStatusBarProps) {
  return (
    <div
      className={`mt-6 flex min-h-11 flex-wrap items-center gap-x-6 gap-y-2 border px-4 py-3 font-data text-[11px] uppercase tracking-[0.18em] ${
        inline ? "justify-end rounded-2xl" : "rounded-2xl"
      }`}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: "var(--foreground-secondary)",
      }}
    >
      <span>Report status: {reportStatus ?? "Idle"}</span>
      <span>Coverage: {presentDataMode(dataMode)}</span>
      <span>Web report: {formatArtifactStatus(htmlStatus)}</span>
      <span>PDF: {formatArtifactStatus(pdfStatus)}</span>
    </div>
  );
}
