import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { phase1Env } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const siteUrl = phase1Env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Stratum | Corporate Intelligence",
  description: "Institutional-grade corporate strategy analysis from job board data. Hiring velocity, strategic verdict, and keyword signals.",
  keywords: ["stratum", "corporate intelligence", "job boards", "hiring strategy", "greenhouse", "lever", "gemini", "ai"],
  icons: {
    icon: "/images/logo.png",
    apple: "/images/logo.png",
  },
  openGraph: {
    title: "Stratum | Corporate Intelligence",
    description: "Institutional-grade corporate strategy analysis from job board data.",
    url: siteUrl,
    siteName: "Stratum",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stratum | Corporate Intelligence",
    description: "Institutional-grade corporate strategy analysis from job board data.",
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
