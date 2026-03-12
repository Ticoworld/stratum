import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/lib/env";
import type { AnalysisInput } from "@/lib/analysis/buildAnalysisInput";
import {
  ANALYSIS_MODEL_NAME,
  ANALYSIS_MODEL_PROVIDER,
  ANALYSIS_MODEL_VERSION,
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_RESPONSE_JSON_SCHEMA,
  ANALYSIS_SYSTEM_INSTRUCTION,
} from "@/lib/analysis/promptSpec";
import {
  parseStructuredAnalysisResponse,
} from "@/lib/analysis/validateAnalysisOutput";

export interface StructuredAnalysisExecutionResult {
  modelProvider: string;
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  rawText: string;
}

function getResponseText(response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>) {
  if (typeof response.text === "string" && response.text.trim().length > 0) {
    return response.text;
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new Error("Structured analysis response did not include any text output.");
  }

  return text;
}

export async function runStructuredAnalysis(
  input: AnalysisInput
): Promise<StructuredAnalysisExecutionResult> {
  const apiKey = getGeminiApiKey();
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model: ANALYSIS_MODEL_NAME,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify(input),
          },
        ],
      },
    ],
    config: {
      systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: ANALYSIS_RESPONSE_JSON_SCHEMA,
      temperature: 0,
    },
  });

  const rawText = getResponseText(response);
  parseStructuredAnalysisResponse(rawText);

  return {
    modelProvider: ANALYSIS_MODEL_PROVIDER,
    modelName: ANALYSIS_MODEL_NAME,
    modelVersion: ANALYSIS_MODEL_VERSION,
    promptVersion: ANALYSIS_PROMPT_VERSION,
    rawText,
  };
}
