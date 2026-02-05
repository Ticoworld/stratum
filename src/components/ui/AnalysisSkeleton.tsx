"use client";

/**
 * Skeleton that mirrors the Pure Signal HUD layout (Bento Grid).
 */
export function AnalysisSkeleton() {
  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Zone A — Verdict (dominant) */}
      <div
        className="lg:col-span-2 rounded border flex flex-col"
        style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
      >
        <div className="p-6">
          <div className="h-3 w-16 mb-4 rounded bg-white/10 animate-shimmer" />
          <div className="h-8 w-3/4 max-w-md mb-4 rounded bg-white/15 animate-shimmer" />
          <div className="h-4 w-full rounded bg-white/10 animate-shimmer mb-2" />
          <div className="h-4 w-4/5 max-w-sm rounded bg-white/8 animate-shimmer" />
        </div>
      </div>

      {/* Zone C — Evidence column */}
      <div className="flex flex-col gap-4">
        <div
          className="rounded border flex-1"
          style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="h-3 w-24 rounded bg-white/10 animate-shimmer" />
          </div>
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 rounded bg-white/8 animate-shimmer" style={{ width: `${70 + i * 5}%` }} />
            ))}
          </div>
        </div>
        <div
          className="rounded border flex-1"
          style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="h-3 w-20 rounded bg-white/10 animate-shimmer" />
          </div>
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 rounded bg-white/8 animate-shimmer" style={{ width: `${60 + i * 8}%` }} />
            ))}
          </div>
        </div>
      </div>

      {/* Zone B — Metrics */}
      <div
        className="lg:col-span-2 rounded border p-6 flex gap-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
      >
        <div className="flex-1">
          <div className="h-3 w-24 mb-2 rounded bg-white/10 animate-shimmer" />
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div className="h-full w-2/3 rounded-full bg-white/20 animate-shimmer" />
          </div>
        </div>
        <div className="w-24">
          <div className="h-3 w-16 mb-2 rounded bg-white/10 animate-shimmer" />
          <div className="h-8 w-16 rounded bg-white/15 animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
