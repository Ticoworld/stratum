"use client";

export function AnalysisSkeleton() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-4 pb-6">
        <div
          className="rounded border"
          style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
        >
          <div className="p-6">
            <div className="h-3 w-48 rounded bg-white/10 animate-shimmer" />
            <div className="mt-2 h-4 w-64 rounded bg-white/8 animate-shimmer" />
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded border p-4"
                  style={{ borderColor: "var(--border)", borderWidth: "1px" }}
                >
                  <div className="h-3 w-24 rounded bg-white/10 animate-shimmer" />
                  <div className="mt-3 h-6 w-28 rounded bg-white/15 animate-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div
            className="rounded border"
            style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
          >
            <div className="p-6">
              <div className="h-3 w-28 rounded bg-white/10 animate-shimmer" />
              <div className="mt-2 h-4 w-56 rounded bg-white/8 animate-shimmer" />
              <div className="mt-5 h-8 w-2/3 rounded bg-white/15 animate-shimmer" />
              <div className="mt-4 h-4 w-full rounded bg-white/10 animate-shimmer" />
              <div className="mt-2 h-4 w-5/6 rounded bg-white/8 animate-shimmer" />
              <div className="mt-5 space-y-2">
                <div className="h-3 w-36 rounded bg-white/8 animate-shimmer" />
                <div className="h-3 w-44 rounded bg-white/8 animate-shimmer" />
              </div>
            </div>
          </div>

          <div
            className="rounded border"
            style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
          >
            <div className="p-6">
              <div className="h-3 w-20 rounded bg-white/10 animate-shimmer" />
              <div className="mt-2 h-4 w-40 rounded bg-white/8 animate-shimmer" />
              <div className="mt-5 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-4 rounded bg-white/8 animate-shimmer"
                    style={{ width: `${68 + i * 5}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          className="rounded border"
          style={{ background: "var(--surface)", borderColor: "var(--border)", borderWidth: "1px" }}
        >
          <div className="p-6">
            <div className="h-3 w-28 rounded bg-white/10 animate-shimmer" />
            <div className="mt-2 h-4 w-52 rounded bg-white/8 animate-shimmer" />
            <div className="mt-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-4 rounded bg-white/8 animate-shimmer"
                  style={{ width: `${72 + i * 6}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
