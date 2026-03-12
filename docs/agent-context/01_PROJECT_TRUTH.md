# Project Truth

## What Stratum was originally
Stratum presented itself as a corporate intelligence platform. The UI and metadata used language such as "Corporate Intelligence" and "Institutional-grade corporate strategy analysis." The live user flow accepted a company name, fetched current job-board data from ATS providers, asked Gemini for a strategic summary, and rendered a single transient dashboard result.

That original product shape matters because the repo, product copy, and runtime behavior were aligned around a live demo narrative rather than a reproducible reporting system.

## What the audit proved it actually is
The completed audit proved that Stratum was not an enterprise intelligence system. It was a live ATS-to-LLM dashboard demo with limited in-memory caching.

The verified runtime flow was:
1. User enters a company name in the client.
2. Client posts to `/api/analyze-unified`.
3. Server fetches live jobs from Greenhouse, Lever, Ashby, or Workable.
4. Raw provider payloads are reduced to a tiny normalized shape.
5. Gemini is prompted with company name plus flattened job metadata.
6. The server returns a transient summary to the client.
7. Results may be cached in a process-local `Map`, then disappear on restart.

The audit also proved what did not exist:
- no raw payload storage
- no snapshot persistence
- no immutable report versions
- no claim-to-citation model
- no PDF artifact generation
- no audit trail
- no point-in-time reconstruction
- no evidence chain from source record to rendered claim

## Why the current live ATS-to-LLM dashboard model is not enterprise-safe
The live dashboard model is not enterprise-safe because it is built on live reads and transient outputs.

That creates several hard failures:
- A viewed result is not a durable artifact. It can change on the next fetch.
- The system cannot prove what exact source records were seen at the time of analysis.
- The system cannot reproduce a report from a past date.
- The system cannot support asynchronous executive sharing without loss of trust.
- The model can make narrative claims from incomplete metadata with no persistent citation trail.
- Upstream provider outages can collapse into misleading product states.
- There is no durable audit trail for what was requested, generated, viewed, or exported.

For a demo, those flaws are tolerable. For enterprise B2B reporting, they are disqualifying.

## Exact product truth
Stratum must become an immutable point-in-time intelligence report system.

That means:
- the unit of value is an immutable report version
- source data must be captured and frozen before analysis
- analysis must run only on frozen inputs
- every published claim must resolve to stored evidence
- HTML and PDF artifacts must be generated from one canonical stored report payload
- report read paths must never call live ATS APIs or live AI inference

If those conditions are not true, Stratum is still a demo with upgraded copy.
