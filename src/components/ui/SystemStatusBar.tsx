"use client";

interface SystemStatusBarProps {
  reportRunId?: string | null;
  reportVersionId?: string | null;
  reportStatus?: string | null;
  dataMode?: string | null;
  htmlAvailable?: boolean | null;
  pdfAvailable?: boolean | null;
  inline?: boolean;
}

export function SystemStatusBar({
  reportRunId = null,
  reportVersionId = null,
  reportStatus = null,
  dataMode = null,
  htmlAvailable = null,
  pdfAvailable = null,
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
      <span>Run: {reportRunId ? reportRunId.slice(0, 8) : "none"}</span>
      <span>Status: {reportStatus ?? "idle"}</span>
      <span>Data mode: {dataMode ?? "pending"}</span>
      <span>Report: {reportVersionId ? reportVersionId.slice(0, 8) : "pending"}</span>
      <span>HTML: {htmlAvailable == null ? "pending" : htmlAvailable ? "available" : "missing"}</span>
      <span>PDF: {pdfAvailable == null ? "pending" : pdfAvailable ? "available" : "missing"}</span>
    </div>
  );
}
