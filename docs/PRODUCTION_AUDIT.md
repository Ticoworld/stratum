# Stratum — Production Readiness Audit

## 1. "0 Roles" / Maintenance Mode Handling ✅

**Current behavior:**
- When a company has no job board or 0 roles: verdict shows "Maintenance Mode" or "No job board found"
- Eng:Sales shows "—" instead of "0:0"
- Footer shows "No job board found for this company." instead of "based on 0 active roles"
- Verdict text uses muted color for empty-state clarity

---

## 2. What's Done

| Area | Status | Notes |
|------|--------|-------|
| Core logic | ✅ | Greenhouse/Lever fetch, AI analysis, caching |
| Caching | ✅ | 24h in-memory, configurable via `STRATUM_CACHE_TTL_HOURS` |
| Retry logic | ✅ | `fetchWithRetry` in boards.ts + frontend API calls |
| Error handling | ✅ | Service Interruption modal, no red error boxes |
| Rate limiting | ✅ | RateLimiter in API route |
| UI (Pure Signal) | ✅ | Bento HUD, no raw lists, single-screen |

---

## 3. Remaining for Production

### High priority

| Item | Description |
|------|-------------|
| **Environment** | Ensure `GEMINI_API_KEY` is set in production; no secrets in client |
| **Deploy** | Vercel/Railway/etc.; `localhost` → real domain |
| **HTTPS** | Enforce HTTPS in production |
| **API status** | Footer shows "API: —" until first analysis; consider default or loading state |

### Medium priority

| Item | Description |
|------|-------------|
| **Persistent cache** | In-memory cache resets on server restart; consider Redis/Vercel KV for multi-instance |
| **Monitoring** | Log errors, latency; optional APM (e.g. Vercel Analytics) |
| **Input validation** | Sanitize company name (length, chars) before API call |
| **SEO** | Meta tags, og:image for sharing |

### Lower priority

| Item | Description |
|------|-------------|
| **Analytics** | Track searches (anonymized) for product insight |
| **Terms / Privacy** | If collecting any data |
| **Accessibility** | Keyboard nav, aria labels, contrast check |

---

## 4. Latency

- **First load:** 8–13s (Greenhouse + Gemini) — acceptable for deep analysis
- **Cached:** &lt;50ms — repeat lookups are fast
- **Mitigation:** Caching, possible background pre-warm for popular companies

---

## 5. Security Checklist

- [ ] No API keys in client bundle
- [ ] Rate limiting enabled (✅)
- [ ] CORS configured if needed
- [ ] Input validation on API route
- [ ] No sensitive data in logs

---

## 6. Quick Pre-Launch Checklist

1. Set `GEMINI_API_KEY` in production env
2. Run `npm run build` — verify no errors
3. Deploy to Vercel/Railway
4. Test: search Airbnb, Stripe, Tesla, Grok (0-roles case)
5. Verify cache: repeat search returns instantly
6. Test Service Interruption: disconnect network, retry, reconnect
