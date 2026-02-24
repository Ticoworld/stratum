/**
 * Probe script: try multiple slugs for a company across all ATS APIs.
 * Use to find the correct board token when the main app shows 0 jobs.
 *
 * Usage: npx tsx scripts/probe-company-slug.ts [company]
 * Example: npx tsx scripts/probe-company-slug.ts framer
 *
 * Slugs tried: company name + common variants (e.g. framer -> framer, useframer, framer-website).
 */

const SLUGS_BY_COMPANY: Record<string, string[]> = {
  framer: ["framer", "useframer", "framer-website", "framer-com", "framerteam"],
  // Add more companies and slug guesses as needed
};

const ENDPOINTS = {
  GREENHOUSE: (slug: string) =>
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
  LEVER: (slug: string) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
  ASHBY: (slug: string) =>
    `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
  WORKABLE: (slug: string) =>
    `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
} as const;

async function probe(
  url: string,
  source: string,
  getCount: (data: unknown) => number
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, count: 0, error: `${res.status}` };
    const data = await res.json();
    const count = getCount(data);
    return { ok: true, count };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, count: 0, error: msg.slice(0, 60) };
  }
}

function getJobCount(source: keyof typeof ENDPOINTS, data: unknown): number {
  if (data == null) return 0;
  if (source === "LEVER" && Array.isArray(data)) return data.length;
  if (typeof data !== "object") return 0;
  const o = data as Record<string, unknown>;
  switch (source) {
    case "GREENHOUSE":
      return Array.isArray(o.jobs) ? (o.jobs as unknown[]).length : 0;
    case "ASHBY":
      return Array.isArray(o.jobs) ? (o.jobs as unknown[]).length : 0;
    case "WORKABLE":
      return Array.isArray(o.jobs) ? (o.jobs as unknown[]).length : 0;
    default:
      return 0;
  }
}

async function main() {
  const company = (process.argv[2] || "framer").trim().toLowerCase();
  const slugs =
    SLUGS_BY_COMPANY[company] ??
    [company, company.replace(/\s+/g, ""), company.replace(/\s+/g, "-")];

  console.log(`\nProbing "${company}" with slugs: ${slugs.join(", ")}\n`);
  console.log("Source      | Slug           | Status  | Job count");
  console.log("------------|----------------|--------|----------");

  let found: { source: string; slug: string; count: number } | null = null;

  for (const source of Object.keys(ENDPOINTS) as (keyof typeof ENDPOINTS)[]) {
    for (const slug of slugs) {
      const url = ENDPOINTS[source](slug);
      const getCount = (d: unknown) => getJobCount(source, d);
      const result = await probe(url, source, getCount);
      const status = result.ok ? "OK" : (result.error ?? "fail");
      const count = result.ok ? result.count : 0;
      if (count > 0) found = { source, slug, count };
      console.log(
        `${source.padEnd(11)} | ${slug.padEnd(14)} | ${status.padEnd(6)} | ${count}`
      );
    }
  }

  console.log("");
  if (found) {
    console.log(
      `>>> Use this: slug "${found.slug}" on ${found.source} (${found.count} jobs)`
    );
    console.log(
      `    Add to FALLBACK_TOKENS in boards.ts: "${company}": ["${found.slug}"]`
    );
    if (found.slug !== company) {
      console.log(
        `    Or use BOARD_ALIASES: "${company}": "${found.slug}" to try that slug first.`
      );
    }
  } else {
    console.log(">>> No jobs found for any slug. Company may use another ATS or a different slug.");
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
