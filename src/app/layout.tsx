import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { getWebEnv } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const siteUrl = getWebEnv().NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Stratum | Immutable Hiring Reports",
  description: "Request report runs, review frozen hiring snapshots, and open stored HTML and PDF report artifacts.",
  keywords: ["stratum", "hiring reports", "report runs", "job boards", "published reports", "artifacts"],
  icons: {
    icon: "/images/logo.png",
    apple: "/images/logo.png",
  },
  openGraph: {
    title: "Stratum | Immutable Hiring Reports",
    description: "Request report runs and open stored report versions and artifacts.",
    url: siteUrl,
    siteName: "Stratum",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stratum | Immutable Hiring Reports",
    description: "Request report runs and open stored report versions and artifacts.",
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
      <body
        className={`${geistSans.variable} ${jetbrainsMono.variable} antialiased bg-[var(--background)] text-[var(--foreground)] min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
