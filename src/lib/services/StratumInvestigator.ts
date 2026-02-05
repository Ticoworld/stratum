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

    // Run AI analysis (only when we have jobs)
    const analysis: StratumAnalysisResult | null = await runStratumAnalysis(trimmed, jobs);

    if (!analysis) {
      return {
        companyName: trimmed,
        jobs,
        hiringMix: aggregateJobsByDepartment(jobs),
        hiringVelocity: "Unknown",
        strategicVerdict: "Analysis failed",
        engineeringVsSalesRatio: "—",
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
      engineeringVsSalesRatio: analysis.engineeringVsSalesRatio,
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
