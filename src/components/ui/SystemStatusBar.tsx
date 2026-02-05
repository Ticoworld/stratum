"use client";

interface SystemStatusBarProps {
  apiSource?: "GREENHOUSE" | "LEVER" | "—";
  latencyMs?: number | null;
  cached?: boolean;
  inline?: boolean;
}

export function SystemStatusBar({ apiSource = "—", latencyMs = null, cached = false, inline = false }: SystemStatusBarProps) {
  return (
    <div
      className={`h-8 flex items-center gap-6 font-mono text-[10px] uppercase tracking-wider ${inline ? "justify-end" : "fixed bottom-0 left-0 right-0 justify-center border-t"}`}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: "var(--foreground-secondary)",
      }}
    >
      <span>SYSTEM: <span style={{ color: "var(--accent)" }}>ONLINE</span></span>
      <span>API: {apiSource}</span>
      <span>LATENCY: {cached ? "CACHED" : latencyMs != null ? `${latencyMs}ms` : "—"}</span>
      <span>REGION: US-EAST</span>
    </div>
  );
}
