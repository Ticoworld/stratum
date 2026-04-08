import type { Metadata } from "next";
import { phase1Env } from "@/lib/env";
import "./globals.css";

const siteUrl = phase1Env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Stratum | Company Watchlist Brief",
  description:
    "Observed ATS hiring signals for investors, founders, and corp dev or strategy operators. Narrow, incomplete, and external only.",
  keywords: [
    "stratum",
    "company watchlist brief",
    "ats hiring signals",
    "greenhouse",
    "lever",
    "ashby",
    "workable",
  ],
  openGraph: {
    title: "Stratum | Company Watchlist Brief",
    description:
    "Observed ATS hiring signals for investors, founders, and corp dev or strategy operators. Narrow, incomplete, and external only.",
    url: siteUrl,
    siteName: "Stratum",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stratum | Company Watchlist Brief",
    description:
      "Observed ATS hiring signals for investors, founders, and corp dev or strategy operators. Narrow, incomplete, and external only.",
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
    <html lang="en" className="dark">
      <body className="antialiased bg-[var(--background)] text-[var(--foreground)] min-h-screen">
        {children}
      </body>
    </html>
  );
}
