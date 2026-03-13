import { GoogleGenAI } from "@google/genai";
import { getAnalysisEnv } from "@/lib/env";
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

const ANALYSIS_MODEL_TIMEOUT_MS = 90000;
let injectedTransientFailuresRemaining: number | null = null;

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new Error(
              `Structured analysis timed out after ${Math.round(timeoutMs / 1000)} seconds.`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function getInjectedTransientFailuresRemaining() {
  if (injectedTransientFailuresRemaining !== null) {
    return injectedTransientFailuresRemaining;
  }

  const rawValue = process.env.STRATUM_ANALYSIS_RETRY_PROOF_FAILURES;
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : 0;

  injectedTransientFailuresRemaining =
    Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;

  return injectedTransientFailuresRemaining;
}

function maybeInjectTransientFailure() {
  const remainingFailures = getInjectedTransientFailuresRemaining();

  if (remainingFailures <= 0) {
    return;
  }

  injectedTransientFailuresRemaining = remainingFailures - 1;

  const error = new Error(
    `Injected transient network timeout for retry proof. Remaining injected failures: ${injectedTransientFailuresRemaining}.`
  );

  console.warn("[analysis] Injecting transient model failure for retry proof:", {
    remainingInjectedFailures: injectedTransientFailuresRemaining,
  });

  throw error;
}

export async function runStructuredAnalysis(
  input: AnalysisInput,
  validationFeedback?: string
): Promise<StructuredAnalysisExecutionResult> {
  const { GEMINI_API_KEY: apiKey } = getAnalysisEnv();
  const client = new GoogleGenAI({ apiKey });

  maybeInjectTransientFailure();

  const response = await withTimeout(
    client.models.generateContent({
      model: ANALYSIS_MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify(input),
            },
            ...(validationFeedback
              ? [
                  {
                    text: `Validation feedback from the previous attempt: ${validationFeedback}\nReturn corrected JSON only. Keep every claim narrow enough to match the supplied evidence.`,
                  },
                ]
              : []),
          ],
        },
      ],
      config: {
        systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: ANALYSIS_RESPONSE_JSON_SCHEMA,
        temperature: 0,
      },
    }),
    ANALYSIS_MODEL_TIMEOUT_MS
  );

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
