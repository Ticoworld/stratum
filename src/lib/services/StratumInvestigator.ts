/**
 * STRATUM INVESTIGATOR - Corporate Strategy Service
 *
 * Flow:
 * 1. Fetch jobs from Greenhouse (or Lever fallback)
 * 2. AI analysis via Stratum unified analyzer
 * 3. Return strategic verdict + hiring velocity
 */

import { fetchCompanyJobs, type Job, type JobBoardSource } from "@/lib/api/boards";
import { runStratumAnalysis, type StratumAnalysisResult } from "@/lib/ai/unified-analyzer";

/** Aggregated hiring mix by department — for strategic insight, not job search */
export interface DepartmentBreakdown {
  department: string;
  count: number;
  sampleJobs: Job[];
}

function aggregateJobsByDepartment(jobs: Job[], sampleSize = 4): DepartmentBreakdown[] {
  const byDept = new Map<string, Job[]>();
  for (const job of jobs) {
    const dept = job.department?.trim() || "General";
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(job);
  }
  return Array.from(byDept.entries())
    .map(([department, deptJobs]) => ({
      department,
      count: deptJobs.length,
      sampleJobs: deptJobs.slice(0, sampleSize),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Deterministic calculation of Engineering vs Sales ratio.
 * Categorizes jobs by title/department keywords to avoid AI non-determinism.
 */
function calculateEngineeringVsSalesRatio(jobs: Job[]): string {
  if (jobs.length === 0) return "—";

  let engineering = 0;
  let sales = 0;

  const engKeywords = [
    "engineer",
    "engineering",
    "developer",
    "development",
    "programmer",
    "software",
    "tech",
    "technical",
    "devops",
    "sre",
    "infrastructure",
    "platform",
    "backend",
    "frontend",
    "fullstack",
    "full-stack",
    "qa",
    "quality assurance",
    "test",
    "testing",
    "security engineer",
    "data engineer",
    "ml engineer",
    "ai engineer",
  ];

  const salesKeywords = [
    "sales",
    "account executive",
    "account manager",
    "business development",
    "bdr",
    "sdr",
    "revenue",
    "revenue operations",
    "revops",
    "customer success",
    "account management",
    "partnership",
    "partnerships",
    "business development",
    "bd",
  ];

  for (const job of jobs) {
    const titleLower = (job.title || "").toLowerCase();
    const deptLower = (job.department || "").toLowerCase();
    const combined = `${titleLower} ${deptLower}`;

    const isEng = engKeywords.some((kw) => combined.includes(kw));
    const isSales = salesKeywords.some((kw) => combined.includes(kw));

    // Prioritize: if both match, prefer department over title
    if (isEng && !isSales) engineering++;
    else if (isSales && !isEng) sales++;
    else if (isEng && isSales) {
      // Ambiguous: check department first
      if (deptLower.includes("engineering") || deptLower.includes("tech")) engineering++;
      else if (deptLower.includes("sales") || deptLower.includes("revenue")) sales++;
      // If still ambiguous, default to engineering for "Product Engineer" etc.
      else engineering++;
    }
  }

  if (engineering === 0 && sales === 0) return "—";
  if (engineering === 0) return `0:${sales}`;
  if (sales === 0) return `${engineering}:0`;

  // Simplify ratio (e.g., 6:11 -> 1:1.8, 12:8 -> 1.5:1)
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(engineering, sales);
  const engSimplified = engineering / divisor;
  const salesSimplified = sales / divisor;

  // If ratio is simple (e.g., 1:2, 3:1), show as-is; otherwise show decimal
  if (engSimplified <= 5 && salesSimplified <= 5) {
    return `${engSimplified}:${salesSimplified}`;
  }
  // Show as decimal ratio (e.g., 6:11 -> 1:1.8)
  const ratio = sales / engineering;
  return ratio >= 1 ? `1:${ratio.toFixed(1)}` : `${(1 / ratio).toFixed(1)}:1`;
}

export interface StratumResult {
  companyName: string;
  jobs: Job[];
  hiringMix: DepartmentBreakdown[];
  hiringVelocity: string;
  strategicVerdict: string;
  engineeringVsSalesRatio: string;
  keywordFindings: string[];
  notableRoles?: string[];
  summary: string;
  thoughtSummary?: string;
  analyzedAt: string;
  analysisTimeMs: number;
  apiSource?: JobBoardSource | null;
  /** When we resolved via alias (e.g. Facebook → Meta). */
  matchedAs?: string;
}

export class StratumInvestigator {
  private startTime = 0;

  async investigate(companyName: string): Promise<StratumResult> {
    this.startTime = Date.now();
    const trimmed = companyName.trim();
    if (!trimmed) throw new Error("Company name is required");

    // Fetch jobs from Greenhouse / Lever
    const { jobs, source: apiSource, matchedAs } = await fetchCompanyJobs(trimmed);

    const elapsed = Date.now() - this.startTime;

    // 0 jobs — skip AI (saves cost, no insight from empty data)
    if (jobs.length === 0) {
      return {
        companyName: trimmed,
        jobs,
        hiringMix: aggregateJobsByDepartment(jobs),
        hiringVelocity: "—",
        strategicVerdict: "No job board found",
        engineeringVsSalesRatio: "—",
        keywordFindings: [],
        notableRoles: undefined,
        summary: `No job board found for "${trimmed}" on Greenhouse or Lever. Try another company (e.g. Airbnb, Stripe).`,
        analyzedAt: new Date().toISOString(),
        analysisTimeMs: elapsed,
        apiSource: null,
      };
    }

    // Calculate deterministic ENG:SALES ratio (before AI analysis)
    const deterministicRatio = calculateEngineeringVsSalesRatio(jobs);

    // Run AI analysis (only when we have jobs)
    const analysis: StratumAnalysisResult | null = await runStratumAnalysis(trimmed, jobs);

    if (!analysis) {
      return {
        companyName: trimmed,
        jobs,
        hiringMix: aggregateJobsByDepartment(jobs),
        hiringVelocity: "Unknown",
        strategicVerdict: "Analysis failed",
        engineeringVsSalesRatio: deterministicRatio,
        keywordFindings: [],
        notableRoles: undefined,
        summary: "AI analysis could not be completed.",
        analyzedAt: new Date().toISOString(),
        analysisTimeMs: elapsed,
        apiSource,
        matchedAs,
      };
    }

    return {
      companyName: trimmed,
      jobs,
      hiringMix: aggregateJobsByDepartment(jobs),
      hiringVelocity: analysis.hiringVelocity,
      strategicVerdict: analysis.strategicVerdict,
      engineeringVsSalesRatio: deterministicRatio, // Use deterministic calculation, not AI
      keywordFindings: analysis.keywordFindings,
      notableRoles: analysis.notableRoles,
      summary: analysis.summary,
      thoughtSummary: analysis.thoughtSummary,
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
      apiSource,
      matchedAs,
    };
  }
}
