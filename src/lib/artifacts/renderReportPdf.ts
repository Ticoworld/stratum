import { existsSync } from "fs";
import path from "path";
import { chromium } from "playwright";

function getBrowserLaunchEnv() {
  const fallbackLibraryPath = path.join(
    process.cwd(),
    ".phase6-playwright-libs",
    "extracted",
    "usr",
    "lib",
    "x86_64-linux-gnu"
  );

  if (!existsSync(fallbackLibraryPath)) {
    return process.env;
  }

  const existing = process.env.LD_LIBRARY_PATH;

  return {
    ...process.env,
    LD_LIBRARY_PATH: existing
      ? `${fallbackLibraryPath}:${existing}`
      : fallbackLibraryPath,
  };
}

export async function renderReportPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    env: getBrowserLaunchEnv(),
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "16mm",
        right: "12mm",
        bottom: "16mm",
        left: "12mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
