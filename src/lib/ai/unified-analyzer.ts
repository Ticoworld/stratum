/**
 * Stratum Unified Analyzer
 * Analyzes observed ATS roles to derive a narrow watchlist read.
 */

import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";
import type { Job } from "@/lib/api/boards";
import {
  APPROVED_WATCHLIST_LABELS,
  buildApprovedWatchlistSummary,
  deriveApprovedWatchlistLabel,
} from "@/lib/signals/watchlistTaxonomy";

export interface StratumAnalysisResult {
  hiringVelocity: string;
  strategicVerdict: string;
  keywordFindings: string[];
  notableRoles?: string[];
  summary: string;
  thoughtSummary?: string;
}

const systemInstruction = `You are Stratum, a watchlist analyst working from observed ATS roles only.
- Work only from the observed ATS roles shown. Do not imply full company strategy or company-wide certainty.
- Detect concrete hiring clusters visible in titles and departments, such as product and engineering, go-to-market, platform and infrastructure, security and compliance, data and AI, leadership, multi-location, mixed, limited, or thin activity.
- Output one top-line watchlist-read label using ONLY this approved list: ${APPROVED_WATCHLIST_LABELS.join(", ")}.
- Assess hiring velocity based on total open roles and any available provider timestamps. If timestamps are sparse or missing, return a cautious label rather than a strong one.
- Extract strategic_highlights: 3-5 exact job titles from the provided list that best support your read.
- If evidence is thin, partial, or weakly timestamped, say that plainly in the summary.
- The summary should read like a short brief for an investor, founder, or strategy operator:
  1. what was observed
  2. what that may suggest
  3. why the read is limited
Respond with ONLY valid JSON in this exact format:
{
  "hiringVelocity": "<High|Moderate|Low|Unknown>",
  "strategicVerdict": "<approved watchlist-read label>",
  "keywordFindings": ["<short evidence note>", ...],
  "strategic_highlights": ["<exact job title 1>", "<exact job title 2>", ...],
  "summary": "<2-3 sentence watchlist summary grounded only in the observed ATS roles>"
}
Use only exact titles from the provided jobs list in strategic_highlights.`;

function parseStratumResponse(text: string): StratumAnalysisResult | null {
  try {
    let jsonString = text.trim();
    const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) jsonString = jsonBlockMatch[1].trim();
    else {
      const first = jsonString.indexOf("{");
      const last = jsonString.lastIndexOf("}");
      if (first !== -1 && last > first) jsonString = jsonString.slice(first, last + 1);
    }

    const parsed = JSON.parse(jsonString);
    return {
      hiringVelocity: parsed.hiringVelocity ?? "Unknown",
      strategicVerdict: parsed.strategicVerdict ?? "Unknown",
      keywordFindings: Array.isArray(parsed.keywordFindings) ? parsed.keywordFindings : [],
      notableRoles: Array.isArray(parsed.strategic_highlights)
        ? parsed.strategic_highlights.filter(Boolean)
        : Array.isArray(parsed.notableRoles)
          ? parsed.notableRoles.filter(Boolean)
          : undefined,
      summary: parsed.summary ?? "Watchlist read generated.",
    };
  } catch {
    return null;
  }
}

function buildJobsText(jobs: Job[]): string {
  if (jobs.length === 0) return "No jobs found.";

  return jobs
    .map((job) => {
      const parts = [
        `title=${job.title}`,
        `provider=${job.source}`,
        `department=${job.department ?? "unavailable"}`,
        `location=${job.location ?? "unavailable"}`,
        job.sourceTimestamp && job.sourceTimestampType
          ? `${job.sourceTimestampType}=${job.sourceTimestamp}`
          : "provider_timestamp=unavailable",
        `observed_at=${job.observedAt}`,
      ];

      if (job.jobUrl) parts.push(`job_url=${job.jobUrl}`);
      else if (job.applyUrl) parts.push(`apply_url=${job.applyUrl}`);

      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

function buildLocalFallbackAnalysis(companyName: string, jobs: Job[]): StratumAnalysisResult {
  const proofRoles = jobs.slice(0, Math.min(3, jobs.length));
  const watchlistReadConfidence = jobs.length <= 2 ? "low" : "medium";
  const companyMatchConfidence = jobs.length <= 1 ? "low" : "medium";
  const label = deriveApprovedWatchlistLabel({
    jobs,
    watchlistReadConfidence,
    companyMatchConfidence,
  });

  const summary =
    jobs.length > 0
      ? buildApprovedWatchlistSummary({
          label,
          jobs,
          proofRoles,
          apiSource: jobs[0]?.source ?? null,
          watchlistReadConfidence,
          companyMatchConfidence,
          proofRoleGrounding: jobs.length >= 3 ? "partial" : "fallback",
        })
      : `Stratum observed no open roles for ${companyName}. This local fallback is used when AI analysis is unavailable.`;

  return {
    hiringVelocity:
      jobs.length >= 6 ? "High" : jobs.length >= 3 ? "Moderate" : jobs.length >= 1 ? "Low" : "Unknown",
    strategicVerdict: label,
    keywordFindings:
      jobs.length > 0
        ? [`Local fallback analysis derived from ${jobs.length} observed role${jobs.length === 1 ? "" : "s"}.`]
        : ["Local fallback analysis found no observed roles."],
    notableRoles: proofRoles.map((job) => job.title).filter(Boolean),
    summary,
  };
}

export async function runStratumAnalysis(
  companyName: string,
  jobs: Job[]
): Promise<StratumAnalysisResult | null> {
  if (!isGeminiAvailable()) return buildLocalFallbackAnalysis(companyName, jobs);
  const ai = getGeminiClient();
  if (!ai) return buildLocalFallbackAnalysis(companyName, jobs);

  const prompt = `Company: ${companyName}\n\nObserved ATS Roles:\n${buildJobsText(jobs)}\n\nAnalyze and return JSON as specified.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction },
    });

    let mainText = "";
    let thoughtSummary = "";
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      const text = (part as { text?: string; thought?: boolean }).text ?? "";
      if (!text) continue;
      if ((part as { thought?: boolean }).thought) thoughtSummary += text;
      else mainText += text;
    }

    if (!mainText && response.text) mainText = response.text;

    const result = parseStratumResponse(mainText);
    if (result) result.thoughtSummary = thoughtSummary || undefined;
    return result;
  } catch (error) {
    console.error("[Stratum] Analysis failed:", error);
    return buildLocalFallbackAnalysis(companyName, jobs);
  }
}
