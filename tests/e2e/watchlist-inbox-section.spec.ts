import { test, expect } from "@playwright/test";
import {
  deriveWatchlistInboxSection,
  formatWatchlistInboxSectionLabel,
  getWatchlistInboxSectionRank,
  type WatchlistInboxSection,
} from "../../src/lib/watchlists/inboxSection";

// ---------------------------------------------------------------------------
// Section 1: deriveWatchlistInboxSection — core triage logic
// ---------------------------------------------------------------------------

test.describe("deriveWatchlistInboxSection — verdict-based routing", () => {

  test("T-IS1: ACT verdict → needs_attention", () => {
    expect(deriveWatchlistInboxSection({ signalVerdict: "act", latestBriefId: "brief-1" }))
      .toBe("needs_attention");
  });

  test("T-IS2: immediate unread alert → needs_attention (even when verdict is watch)", () => {
    expect(deriveWatchlistInboxSection({
      signalVerdict: "watch",
      latestUnreadAlertPriority: "immediate",
      latestBriefId: "brief-1",
    })).toBe("needs_attention");
  });

  test("T-IS3: VERIFY_SOURCE verdict → source_issues", () => {
    expect(deriveWatchlistInboxSection({
      signalVerdict: "verify_source",
      latestBriefId: "brief-1",
    })).toBe("source_issues");
  });

  test("T-IS4: source_issue unread alert → source_issues", () => {
    expect(deriveWatchlistInboxSection({
      signalVerdict: "watch",
      latestUnreadAlertPriority: "source_issue",
      latestBriefId: "brief-1",
    })).toBe("source_issues");
  });

  test("T-IS5: provider_failure resultState → source_issues", () => {
    expect(deriveWatchlistInboxSection({
      latestResultState: "provider_failure",
      latestBriefId: "brief-1",
    })).toBe("source_issues");
  });

  test("T-IS6: unsupported_ats_or_source_pattern → source_issues", () => {
    expect(deriveWatchlistInboxSection({
      latestResultState: "unsupported_ats_or_source_pattern",
    })).toBe("source_issues");
  });

  test("T-IS7: WATCH verdict → watching", () => {
    expect(deriveWatchlistInboxSection({ signalVerdict: "watch", latestBriefId: "brief-1" }))
      .toBe("watching");
  });

  test("T-IS8: digest unread alert → watching", () => {
    expect(deriveWatchlistInboxSection({
      latestUnreadAlertPriority: "digest",
      latestBriefId: "brief-1",
    })).toBe("watching");
  });

  test("T-IS9: WAIT verdict → quiet", () => {
    expect(deriveWatchlistInboxSection({ signalVerdict: "wait", latestBriefId: "brief-1" }))
      .toBe("quiet");
  });

  test("T-IS10: IGNORE verdict → quiet", () => {
    expect(deriveWatchlistInboxSection({ signalVerdict: "ignore", latestBriefId: "brief-1" }))
      .toBe("quiet");
  });

  test("T-IS11: no brief, no result state → not_started", () => {
    expect(deriveWatchlistInboxSection({})).toBe("not_started");
  });

  test("T-IS12: no brief, no result state (explicit nulls) → not_started", () => {
    expect(deriveWatchlistInboxSection({
      signalVerdict: null,
      latestBriefId: null,
      latestResultState: null,
    })).toBe("not_started");
  });
});

test.describe("deriveWatchlistInboxSection — priority ordering", () => {

  test("T-IS13: needs_attention outranks watching", () => {
    expect(getWatchlistInboxSectionRank("needs_attention"))
      .toBeLessThan(getWatchlistInboxSectionRank("watching"));
  });

  test("T-IS14: source_issues outranks watching", () => {
    expect(getWatchlistInboxSectionRank("source_issues"))
      .toBeLessThan(getWatchlistInboxSectionRank("watching"));
  });

  test("T-IS15: needs_attention outranks source_issues", () => {
    expect(getWatchlistInboxSectionRank("needs_attention"))
      .toBeLessThan(getWatchlistInboxSectionRank("source_issues"));
  });

  test("T-IS16: watching outranks quiet", () => {
    expect(getWatchlistInboxSectionRank("watching"))
      .toBeLessThan(getWatchlistInboxSectionRank("quiet"));
  });

  test("T-IS17: quiet outranks not_started", () => {
    expect(getWatchlistInboxSectionRank("quiet"))
      .toBeLessThan(getWatchlistInboxSectionRank("not_started"));
  });

  test("T-IS18: full rank order is correct", () => {
    const order: WatchlistInboxSection[] = [
      "needs_attention",
      "source_issues",
      "watching",
      "quiet",
      "not_started",
    ];
    const ranks = order.map(getWatchlistInboxSectionRank);
    for (let i = 0; i < ranks.length - 1; i++) {
      expect(ranks[i]).toBeLessThan(ranks[i + 1]);
    }
  });
});

test.describe("deriveWatchlistInboxSection — edge cases", () => {

  test("T-IS19: legacy entry (has brief but no verdict) → watching (not quiet or not_started)", () => {
    expect(deriveWatchlistInboxSection({
      signalVerdict: null,
      latestUnreadAlertPriority: null,
      latestBriefId: "brief-legacy",
      latestResultState: "supported_provider_matched_with_observed_openings",
    })).toBe("watching");
  });

  test("T-IS20: has result state but no brief → watching (not not_started)", () => {
    expect(deriveWatchlistInboxSection({
      latestResultState: "supported_provider_matched_with_observed_openings",
      latestBriefId: null,
    })).toBe("watching");
  });

  test("T-IS21: consecutive failures >= 2 → source_issues (even with watch verdict)", () => {
    expect(deriveWatchlistInboxSection({
      signalVerdict: "watch",
      scheduleConsecutiveFailures: 2,
      latestBriefId: "brief-1",
    })).toBe("source_issues");
  });

  test("T-IS22: consecutive failures = 1 → does NOT trigger source_issues on its own", () => {
    expect(deriveWatchlistInboxSection({
      signalVerdict: "watch",
      scheduleConsecutiveFailures: 1,
      latestBriefId: "brief-1",
    })).toBe("watching");
  });

  test("T-IS23: ACT verdict takes precedence over provider_failure (needs_attention wins)", () => {
    // Unusual edge case: act verdict + provider failure simultaneously.
    // needs_attention gate fires first.
    expect(deriveWatchlistInboxSection({
      signalVerdict: "act",
      latestResultState: "provider_failure",
      latestBriefId: "brief-1",
    })).toBe("needs_attention");
  });
});

test.describe("formatWatchlistInboxSectionLabel", () => {

  test("T-IL1: needs_attention → 'Needs attention'", () => {
    expect(formatWatchlistInboxSectionLabel("needs_attention")).toBe("Needs attention");
  });

  test("T-IL2: source_issues → 'Source issues'", () => {
    expect(formatWatchlistInboxSectionLabel("source_issues")).toBe("Source issues");
  });

  test("T-IL3: watching → 'Watching'", () => {
    expect(formatWatchlistInboxSectionLabel("watching")).toBe("Watching");
  });

  test("T-IL4: quiet → 'Quiet'", () => {
    expect(formatWatchlistInboxSectionLabel("quiet")).toBe("Quiet");
  });

  test("T-IL5: not_started → 'Not started'", () => {
    expect(formatWatchlistInboxSectionLabel("not_started")).toBe("Not started");
  });
});
