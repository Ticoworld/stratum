"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/watchlists", label: "Watchlists" },
  { href: "/notifications", label: "Inbox" },
] as const;

function getCurrentSection(pathname: string): string {
  if (pathname.startsWith("/notifications")) return "Inbox";
  if (pathname.startsWith("/briefs/")) return "Saved brief";
  return "Watchlists";
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/watchlists") {
    return pathname === "/watchlists" || pathname.startsWith("/briefs/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface AppShellProps {
  children: ReactNode;
  variant?: "full" | "minimal" | "wide";
}

export function AppShell({ children, variant = "full" }: AppShellProps) {
  const pathname = usePathname();
  const currentSection = getCurrentSection(pathname);
  const isMinimal = variant === "minimal";
  const isWide = variant === "wide";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className={`grid min-h-screen ${(isMinimal || isWide) ? "grid-cols-1" : "lg:grid-cols-[16rem_minmax(0,1fr)]"}`}>
        {(!isMinimal && !isWide) && (
          <aside className="hidden border-r bg-[var(--surface)] lg:flex lg:flex-col" style={{ borderColor: "var(--border)" }}>
            <div className="border-b px-5 py-5" style={{ borderColor: "var(--border)" }}>
              <p className="text-[10px] font-data uppercase tracking-[0.26em]" style={{ color: "var(--foreground-muted)" }}>
                Stratum
              </p>
              <p className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--foreground-secondary)" }}>
                Watchlists
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                Track companies you care about.
              </p>
            </div>

            <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded border px-4 py-3 text-sm transition-colors"
                    aria-current={active ? "page" : undefined}
                    style={{
                      background: active ? "var(--background)" : "transparent",
                      borderColor: active ? "var(--accent)" : "transparent",
                      color: active ? "var(--foreground)" : "var(--foreground-secondary)",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t px-5 py-4 text-[11px] font-medium leading-relaxed opacity-60" style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}>
              Tracking supported hiring sources
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-col">
          {!isMinimal && (
            <header
              className="flex h-14 items-center justify-between border-b bg-[var(--surface)] px-4 lg:px-6"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-[0.12em]" style={{ color: "var(--foreground-muted)" }}>
                  {currentSection.toLowerCase()}
                </p>
              </div>

              <nav className="flex items-center gap-2 lg:hidden" aria-label="Primary">
                {NAV_ITEMS.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded border px-3 py-2 text-xs font-data uppercase tracking-[0.18em] transition-colors"
                      aria-current={active ? "page" : undefined}
                      style={{
                        background: active ? "var(--background)" : "transparent",
                        borderColor: active ? "var(--accent)" : "var(--border)",
                        color: active ? "var(--foreground)" : "var(--foreground-secondary)",
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="hidden text-[11px] font-medium tracking-[0.05em] opacity-60 lg:block" style={{ color: "var(--foreground-muted)" }}>
                Tracking supported hiring sources
              </div>
            </header>
          )}

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
