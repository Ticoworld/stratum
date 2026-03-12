/**
 * In-memory cache for Stratum analysis results.
 * Repeat company lookups return instantly; data is fresh for CACHE_TTL_MS.
 * Job board data changes slowly — 24h TTL is reasonable.
 */

import type { StratumResult } from "@/lib/services/StratumInvestigator";

const CACHE_TTL_MS =
  typeof process.env.STRATUM_CACHE_TTL_HOURS === "string"
    ? Math.max(1, parseInt(process.env.STRATUM_CACHE_TTL_HOURS, 10)) * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000; // 24 hours default

function normalizeKey(companyName: string): string {
  return companyName.trim().toLowerCase().replace(/\s+/g, " ");
}

interface CacheEntry {
  result: StratumResult;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCached(companyName: string): { result: StratumResult; cachedAt: number } | null {
  const key = normalizeKey(companyName);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCached(companyName: string, result: StratumResult): void {
  const key = normalizeKey(companyName);
  cache.set(key, { result, cachedAt: Date.now() });
}
