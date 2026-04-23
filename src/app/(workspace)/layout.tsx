"use client";

import { AppShell } from "@/components/shell/AppShell";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBriefPage = pathname.startsWith("/briefs/");
  const isWatchlistsPage = pathname === "/watchlists";

  return (
    <AppShell variant={isBriefPage ? "wide" : isWatchlistsPage ? "minimal" : "full"}>
      {children}
    </AppShell>
  );
}
