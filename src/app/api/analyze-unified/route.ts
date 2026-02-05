/**
 * STRATUM UNIFIED API
 *
 * POST /api/analyze-unified
 *
 * Fetches company jobs from Greenhouse/Lever and runs AI strategy analysis.
 * Results are cached for 1 hour; repeat lookups return instantly.
 */

import { NextRequest, NextResponse } from "next/server";
import { StratumInvestigator } from "@/lib/services/StratumInvestigator";
import { checkRateLimit, RateLimitExceededError } from "@/lib/security/RateLimiter";
import { getCached, setCached } from "@/lib/cache/stratum-cache";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || real || "unknown";
  return ip;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    checkRateLimit(ip);

    const body = await request.json();
    const { companyName } = body;

    if (!companyName || typeof companyName !== "string") {
      return NextResponse.json(
        { success: false, error: "Company name is required" },
        { status: 400 }
      );
    }

    const trimmed = companyName.trim();
    if (trimmed.length > 100) {
      return NextResponse.json(
        { success: false, error: "Company name must be 100 characters or less" },
        { status: 400 }
      );
    }
    const sanitized = trimmed.replace(/[<>"']/g, "").slice(0, 100).trim() || trimmed;
    const cached = getCached(sanitized);
    if (cached) {
      console.log(`[Stratum API] Cache hit: ${sanitized}`);
      return NextResponse.json({
        success: true,
        data: cached.result,
        cached: true,
        cachedAt: new Date(cached.cachedAt).toISOString(),
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[Stratum API] Strategy analysis for ${sanitized}...`);

    const investigator = new StratumInvestigator();
    const result = await investigator.investigate(sanitized);
    setCached(sanitized, result);

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }

    console.error("[Stratum API] Error:", error);

    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
