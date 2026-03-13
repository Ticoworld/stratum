"use client";

interface SystemStatusBarProps {
  reportStatus?: string | null;
  dataMode?: string | null;
  htmlAvailable?: boolean | null;
  pdfAvailable?: boolean | null;
  inline?: boolean;
}

export function SystemStatusBar({
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
      <span>Status: {reportStatus ?? "Idle"}</span>
      <span>Coverage: {dataMode ?? "Pending"}</span>
      <span>Web report: {htmlAvailable == null ? "Pending" : htmlAvailable ? "Available" : "In progress"}</span>
      <span>PDF: {pdfAvailable == null ? "Pending" : pdfAvailable ? "Available" : "In progress"}</span>
    </div>
  );
}
