/**
 * Gemini AI Client
 * Official Google GenAI SDK integration for Stratum
 */

import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini client
const apiKey = process.env.GEMINI_API_KEY;
const geminiDisabledForE2E = process.env.STRATUM_E2E_DISABLE_GEMINI === "1";

if (!apiKey) {
  console.warn("[Stratum AI] GEMINI_API_KEY not found. AI analysis will be disabled.");
} else if (geminiDisabledForE2E) {
  console.warn("[Stratum AI] Gemini disabled for E2E verification.");
}

/**
 * Get the Google GenAI client instance
 */
export function getGeminiClient(): GoogleGenAI | null {
  if (!apiKey || geminiDisabledForE2E) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * Check if Gemini AI is available
 */
export function isGeminiAvailable(): boolean {
  return !!apiKey && !geminiDisabledForE2E;
}
