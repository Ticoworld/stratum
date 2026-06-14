import assert from "node:assert/strict";
import { buildWatchlistActionCopy } from "@/lib/watchlists/watchlistActionCopy";

type Case = {
  name: string;
  input: Parameters<typeof buildWatchlistActionCopy>[0];
  expected: ReturnType<typeof buildWatchlistActionCopy>;
};

const cases: Case[] = [
  {
    name: "ACT sales growth",
    input: {
      verdict: "act",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 68,
      previousObservedJobsCount: 50,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 68,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    },
    expected: {
      mainLine: "Sales hiring grew from 50 to 68 jobs.",
      nextStep: "Use this for account timing.",
    },
  },
  {
    name: "ACT total growth",
    input: {
      verdict: "act",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 140,
      previousObservedJobsCount: 111,
    },
    expected: {
      mainLine: "Hiring grew from 111 to 140 jobs.",
      nextStep: "Use this for account research.",
    },
  },
  {
    name: "ACT top bucket shift",
    input: {
      verdict: "act",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 72,
      previousObservedJobsCount: 68,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 34,
      previousTopHiringBucket: "Engineering",
      previousTopHiringBucketCount: 36,
    },
    expected: {
      mainLine: "Hiring shifted from Engineering to Sales.",
      nextStep: "Check the brief before acting.",
    },
  },
  {
    name: "ACT risk/compliance appearance",
    input: {
      verdict: "act",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 140,
      previousObservedJobsCount: 111,
      latestTopHiringBucket: "Risk and compliance",
      latestTopHiringBucketCount: 18,
      previousTopHiringBucket: null,
      previousTopHiringBucketCount: null,
    },
    expected: {
      mainLine: "Risk and compliance roles appeared.",
      nextStep: "Use this for account or competitor research.",
    },
  },
  {
    name: "ACT fallback",
    input: {
      verdict: "act",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
    },
    expected: {
      mainLine: "Sales hiring increased since last scan.",
      nextStep: "Use this for account research or outreach timing.",
    },
  },
  {
    name: "WATCH first scan",
    input: {
      verdict: "watch",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Broader product and GTM buildout",
      latestObservedJobsCount: 111,
    },
    expected: {
      mainLine: "Sales-led first scan, 111 jobs.",
      nextStep: "Wait for the next scan to see what changed.",
    },
  },
  {
    name: "WATCH minor movement",
    input: {
      verdict: "watch",
      latestBriefId: "brief-1",
      latestObservedJobsCount: 111,
      previousObservedJobsCount: 111,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 50,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 50,
    },
    expected: {
      mainLine: "Sales still leads. No major change since last scan.",
      nextStep: "Keep watching.",
    },
  },
  {
    name: "VERIFY SOURCE",
    input: {
      verdict: "verify_source",
      latestBriefId: "brief-1",
      latestWatchlistReadLabel: "Source needs verification",
      resultState: "unsupported_ats_or_source_pattern",
    },
    expected: {
      mainLine: "Source needs checking.",
      nextStep: "Check the source before using this.",
    },
  },
  {
    name: "NO BRIEF",
    input: {
      verdict: "watch",
      latestBriefId: null,
      latestWatchlistReadLabel: null,
    },
    expected: {
      mainLine: "No scan yet.",
      nextStep: "Refresh to run the first check.",
    },
  },
  {
    name: "NO BRIEF, CHECKING NOW",
    input: {
      verdict: "watch",
      latestBriefId: null,
      latestWatchlistReadLabel: null,
      isCheckingNow: true,
    },
    expected: {
      mainLine: "First check in progress.",
      nextStep: "We'll show the result when it finishes.",
    },
  },
];

for (const testCase of cases) {
  const actual = buildWatchlistActionCopy(testCase.input);
  assert.deepEqual(actual, testCase.expected, testCase.name);
}

console.log(`watchlist-action-copy ACT checks passed (${cases.length} cases).`);
