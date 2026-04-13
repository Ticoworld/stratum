import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { phase1Env } from "@/lib/env";
import "./globals.css";

const siteUrl = phase1Env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Stratum | Watch target companies through ATS signals",
  description:
    "Watchlist intelligence for corporate development and investor teams. Save point-in-time briefs, compare latest vs previous, schedule refreshes, and keep meaningful changes in an in-app inbox.",
  keywords: [
    "stratum",
    "watchlist intelligence",
    "target company monitoring",
    "saved briefs",
    "latest vs previous",
    "scheduled refreshes",
    "in-app notifications",
    "ats monitoring",
    "greenhouse",
    "lever",
    "ashby",
    "workable",
  ],
  openGraph: {
    title: "Stratum | Watch target companies through ATS signals",
    description:
      "Watchlist intelligence for corporate development and investor teams. Save point-in-time briefs, compare latest vs previous, schedule refreshes, and keep meaningful changes in an in-app inbox.",
    url: siteUrl,
    siteName: "Stratum",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stratum | Watch target companies through ATS signals",
    description:
      "Watchlist intelligence for corporate development and investor teams. Save point-in-time briefs, compare latest vs previous, schedule refreshes, and keep meaningful changes in an in-app inbox.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
