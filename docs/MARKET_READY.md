# Stratum — Market Readiness Audit

## Executive Summary

Stratum is **market-ready** for launch with the following in place. This document covers what's done, what's configured, and optional enhancements for scale.

---

## 1. Security ✅

| Item | Status |
|------|--------|
| API keys server-side only | ✅ `GEMINI_API_KEY` never exposed to client |
| Input validation | ✅ Company name: max 100 chars, sanitized (`<>"'` stripped) |
| Rate limiting | ✅ 5 requests/min per IP, 429 with Retry-After |
| Security headers | ✅ X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| No sensitive data in logs | ✅ Only company name and cache hits logged |

---

## 2. Reliability ✅

| Item | Status |
|------|--------|
| Retry logic | ✅ 3 attempts, 1s delay, network/timeout retries |
| Error handling | ✅ Service interruption modal, rate limit modal, 0-job handling |
| Graceful degradation | ✅ Unsupported (Meta, Tesla) skip AI, show clear message |
| Caching | ✅ 24h in-memory, configurable via `STRATUM_CACHE_TTL_HOURS` |

---

## 3. User Experience ✅

| Item | Status |
|------|--------|
| Loading states | ✅ Skeleton, REVEAL button shows "Analyzing…" |
| Error feedback | ✅ 429 → "Rate Limit" modal, 500 → "Analysis Failed" |
| Empty state | ✅ Example companies (Airbnb, Stripe, XAI) clickable |
| Cached badge | ✅ Shows when result is from cache |
| Unsupported state | ✅ "Try a supported company" with chips |
| Accessibility | ✅ aria-label, aria-busy, Escape to close modal |

---

## 4. Infrastructure

| Item | Status | Notes |
|------|--------|------|
| Build | ✅ | Run `npm run build` before deploy |
| Environment | ⚠️ | Set `GEMINI_API_KEY` in production |
| Deploy target | — | Vercel, Railway, or similar |
| HTTPS | — | Enforced by host (Vercel default) |
| Domain | — | Set `NEXT_PUBLIC_SITE_URL` for og:image links |

---

## 5. Pre-Launch Checklist

- [ ] Set `GEMINI_API_KEY` in production env
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your domain (e.g. `https://stratum.io`)
- [ ] Run `npm run build` — verify no errors
- [ ] Deploy to Vercel/Railway
- [ ] Smoke test: Airbnb, Stripe, Grok, Meta, Tesla
- [ ] Verify cache: repeat search returns instantly
- [ ] Test 429: spam requests, confirm rate limit modal
- [ ] Test Service Interruption: disconnect network, retry

---

## 6. Optional Enhancements (Post-Launch)

| Enhancement | Effort | Benefit |
|-------------|--------|---------|
| Persistent cache (Redis/Vercel KV) | Medium | Survives serverless cold starts, multi-instance |
| Error monitoring (Sentry) | Low | Track production errors |
| Analytics (anonymized) | Low | Understand usage patterns |
| Input: blocklist for abuse | Low | Prevent spam company names |
| Rate limit: configurable per env | Low | Tune for traffic |
| og:image for social sharing | Low | Better link previews |

---

## 7. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `STRATUM_CACHE_TTL_HOURS` | No | Cache TTL (default 24) |
| `NEXT_PUBLIC_SITE_URL` | No | Full site URL for og:image (default placeholder) |

---

## 8. Latency

- **First load:** 8–13s (Greenhouse + Lever + Gemini)
- **Cached:** <50ms
- **Mitigation:** Caching, skeleton loader, clear loading state

---

## 9. Rate Limits

- **Current:** 5 requests per minute per IP
- **429 response:** Includes `Retry-After: 60` header
- **UI:** Modal shows "Rate Limit" with retry message
