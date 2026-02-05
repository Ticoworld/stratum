/**
 * Stratum Unified Analyzer
 * Corporate Strategy Analyst - Analyzes job boards to derive strategic insights
 */

import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";
import type { Job } from "@/lib/api/boards";

export interface StratumAnalysisResult {
  hiringVelocity: string;   // e.g. "High", "Moderate", "Low"
  strategicVerdict: string; // e.g. "Aggressive Expansion", "R&D Pivot", "Maintenance Mode"
  engineeringVsSalesRatio: string;
  keywordFindings: string[];  // AI, Crypto, Enterprise, etc.
  notableRoles?: string[];    // 3–5 role titles that best illustrate strategic focus
  summary: string;
  thoughtSummary?: string;
}

const systemInstruction = `You are Stratum, a Corporate Strategy Analyst. Analyze this list of open jobs.
- Calculate the ratio of Engineering vs. Sales roles.
- Detect keywords like 'AI', 'Crypto', or 'Enterprise' in job titles and departments.
- Output a verdict on the company's strategic focus (e.g., 'Aggressive Expansion', 'R&D Pivot', 'Maintenance Mode').
- Assess hiring velocity based on total open roles and recency of postings.
- Extract strategic_highlights: 3–5 specific job titles that serve as PROOF of your verdict (e.g., "Head of Crypto", "Founding Engineer - VR", "Senior Staff ML Engineer - GenAI"). These are the roles that best illustrate the strategic focus.
Respond with ONLY valid JSON in this exact format:
{
  "hiringVelocity": "<High|Moderate|Low>",
  "strategicVerdict": "<e.g. Aggressive Expansion, R&D Pivot, Maintenance Mode>",
  "engineeringVsSalesRatio": "<e.g. 3:1 or 1:2>",
  "keywordFindings": ["<keyword> - <count or context>", ...],
  "strategic_highlights": ["<job title 1>", "<job title 2>", ...],
  "summary": "<2-3 sentence strategic summary>"
}
Pick 3–5 strategic_highlights: job titles that prove your verdict. Omit if no jobs.`;

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
    const p = JSON.parse(jsonString);
    return {
      hiringVelocity: p.hiringVelocity ?? "Unknown",
      strategicVerdict: p.strategicVerdict ?? "Unknown",
      engineeringVsSalesRatio: p.engineeringVsSalesRatio ?? "—",
      keywordFindings: Array.isArray(p.keywordFindings) ? p.keywordFindings : [],
      notableRoles: Array.isArray(p.strategic_highlights) ? p.strategic_highlights.filter(Boolean) : (Array.isArray(p.notableRoles) ? p.notableRoles.filter(Boolean) : undefined),
      summary: p.summary ?? "Analysis complete.",
    };
  } catch {
    return null;
  }
}

export async function runStratumAnalysis(
  companyName: string,
  jobs: Job[]
): Promise<StratumAnalysisResult | null> {
  if (!isGeminiAvailable()) return null;
  const ai = getGeminiClient();
  if (!ai) return null;

  const jobsText = jobs.length === 0
    ? "No jobs found."
    : jobs.map((j) => `- ${j.title} | ${j.department} | ${j.location} | ${j.updated_at}`).join("\n");

  const prompt = `Company: ${companyName}\n\nOpen Jobs:\n${jobsText}\n\nAnalyze and return JSON as specified.`;

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
      const t = (part as { text?: string; thought?: boolean }).text ?? "";
      if (!t) continue;
      if ((part as { thought?: boolean }).thought) thoughtSummary += t;
      else mainText += t;
    }
    if (!mainText && response.text) mainText = response.text;

    const result = parseStratumResponse(mainText);
    if (result) result.thoughtSummary = thoughtSummary || undefined;
    return result;
  } catch (error) {
    console.error("[Stratum] Analysis failed:", error);
    return null;
  }
}
