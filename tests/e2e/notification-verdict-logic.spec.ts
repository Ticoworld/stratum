import { test, expect } from "@playwright/test";
import {
  buildNotificationCandidateDraft,
  formatNotificationAlertPriorityLabel,
  getNotificationAlertPriorityRank,
  type MonitoringStateComparisonSnapshot,
  type StratumNotificationAlertPriority,
  type WatchlistNotificationInboxItem,
} from "../../src/lib/watchlists/notifications";
import type { WatchlistMonitoringAttemptHistoryItem } from "../../src/lib/watchlists/monitoringEvents";
import type { WatchlistEntryDiff } from "../../src/lib/watchlists/history";
import { deriveVerdictArgs } from "../../src/lib/signals/verdictInputs";
import { deriveSignalVerdict } from "../../src/lib/signals/signalVerdict";

// ---------------------------------------------------------------------------
// Minimal shared fixtures
// ---------------------------------------------------------------------------

function makeAttempt(
  overrides: Partial<WatchlistMonitoringAttemptHistoryItem> = {}
): WatchlistMonitoringAttemptHistoryItem {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    watchlistEntryId: "00000000-0000-4000-8000-000000000002",
    requestedQuery: "https://boards.greenhouse.io/acme",
    attemptKind: "refresh",
    attemptOrigin: "manual_refresh",
    outcomeStatus: "saved_brief_created",
    relatedBriefId: "00000000-0000-4000-8000-000000000003",
    resultState: "supported_provider_matched_with_observed_openings",
    matchedCompanyName: "Acme Corp",
    atsSourceUsed: "GREENHOUSE",
    watchlistReadLabel: "Go-to-market hiring signal",
    watchlistReadConfidence: "high",
    companyMatchConfidence: "high",
    sourceCoverageCompleteness: "single_matched_provider_only",
    errorSummary: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(
  overrides: Partial<MonitoringStateComparisonSnapshot> = {}
): MonitoringStateComparisonSnapshot {
  return {
    basis: "saved_brief",
    resultState: "supported_provider_matched_with_observed_openings",
    watchlistReadLabel: "Go-to-market hiring signal",
    watchlistReadConfidence: "high",
    atsSourceUsed: "GREENHOUSE",
    ...overrides,
  };
}

function makeDiff(overrides: Partial<WatchlistEntryDiff> = {}): WatchlistEntryDiff {
  return {
    comparisonAvailable: true,
    comparisonStrength: "standard",
    comparisonNotes: [],
    summary: "Observed roles expanded.",
    changes: [],
    hasMaterialChange: true,
    hasSignificantChange: true,
    significanceDrivers: ["count"],
    changeDirection: "expansion",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 1: buildNotificationCandidateDraft — alertPriority wiring
// ---------------------------------------------------------------------------

test.describe("buildNotificationCandidateDraft alertPriority", () => {

  test("T-NP1: ACT verdict → alertPriority immediate", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "act",
      previousSignalVerdict: "watch",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("immediate");
  });

  test("T-NP2: WATCH verdict with material change → alertPriority digest", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "watch",
      previousSignalVerdict: null,
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("digest");
  });

  test("T-NP3: VERIFY_SOURCE → alertPriority source_issue", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt({
        resultState: "provider_failure",
      }),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState({ resultState: "provider_failure" }),
      diff: makeDiff({ hasMaterialChange: false }),
      currentSignalVerdict: "verify_source",
      previousSignalVerdict: "watch",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("source_issue");
  });

  test("T-NP4: WAIT verdict → notification suppressed (null)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "wait",
      previousSignalVerdict: "wait",
    });
    expect(draft).toBeNull();
  });

  test("T-NP5: IGNORE verdict → notification suppressed (null)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "ignore",
      previousSignalVerdict: "ignore",
    });
    expect(draft).toBeNull();
  });

  test("T-NP6: WATCH → ACT transition → immediate (not digest)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "act",
      previousSignalVerdict: "watch",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("immediate");
  });

  test("T-NP7: WAIT → ACT transition → immediate", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "act",
      previousSignalVerdict: "wait",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("immediate");
  });

  test("T-NP8: IGNORE → ACT transition → immediate", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "act",
      previousSignalVerdict: "ignore",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("immediate");
  });

  test("T-NP9: ACT → ACT with material change → immediate (not suppressed)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: true }),
      currentSignalVerdict: "act",
      previousSignalVerdict: "act",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("immediate");
  });

  test("T-NP10: ACT → ACT without material change → suppressed (null)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: false }),
      currentSignalVerdict: "act",
      previousSignalVerdict: "act",
    });
    expect(draft).toBeNull();
  });

  test("T-NP11: WATCH → WATCH without material change → suppressed (null)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: false }),
      currentSignalVerdict: "watch",
      previousSignalVerdict: "watch",
    });
    expect(draft).toBeNull();
  });

  test("T-NP12: WATCH → WATCH with material change → digest (not suppressed)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: true }),
      currentSignalVerdict: "watch",
      previousSignalVerdict: "watch",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("digest");
  });

  test("T-NP13: no verdict provided (null) → defaults to digest, not suppressed (legacy behavior)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: null,
      previousSignalVerdict: null,
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("digest");
  });

  test("T-NP14: refresh_failed → always source_issue regardless of verdict args", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt({ outcomeStatus: "failed", errorSummary: "timeout" }),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: false }),
      currentSignalVerdict: null,
      previousSignalVerdict: null,
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("source_issue");
    expect(draft?.changeTypes).toContain("refresh_failed");
  });

  test("T-NP15: VERIFY_SOURCE → VERIFY_SOURCE without material change → suppressed", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: false }),
      currentSignalVerdict: "verify_source",
      previousSignalVerdict: "verify_source",
    });
    expect(draft).toBeNull();
  });

  test("T-NP16: VERIFY_SOURCE → VERIFY_SOURCE with material change → source_issue (not suppressed)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: true }),
      currentSignalVerdict: "verify_source",
      previousSignalVerdict: "verify_source",
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("source_issue");
  });
});

// ---------------------------------------------------------------------------
// Section 2: deriveVerdictArgs — consistent with page.tsx computation
// ---------------------------------------------------------------------------

test.describe("deriveVerdictArgs correctness", () => {

  const strongBrief = {
    jobsObservedCount: 15,
    watchlistReadLabel: "Go-to-market hiring signal",
    watchlistReadConfidence: "high",
    companyMatchConfidence: "high",
    proofRoleGrounding: "exact",
    resultState: "supported_provider_matched_with_observed_openings",
  };

  test("T-VA1: baseline diff (no comparison) → changeSignificance=baseline, verdict=watch", () => {
    const args = deriveVerdictArgs(strongBrief, null);
    expect(args.changeSignificance).toBe("baseline");
    expect(args.changeDirection).toBe("baseline");
    const verdict = deriveSignalVerdict(args);
    expect(verdict.verdict).toBe("watch");
    expect(verdict.alertPriority).toBe("digest");
  });

  test("T-VA2: expansion diff → changeSignificance=meaningful_change, verdict=act", () => {
    const args = deriveVerdictArgs(strongBrief, {
      comparisonAvailable: true,
      hasMaterialChange: true,
      hasSignificantChange: true,
      significanceDrivers: ["count"],
      comparisonStrength: "standard",
      changeDirection: "expansion",
    });
    expect(args.changeSignificance).toBe("meaningful_change");
    expect(args.changeDirection).toBe("expansion");
    const verdict = deriveSignalVerdict(args);
    expect(verdict.verdict).toBe("act");
    expect(verdict.alertPriority).toBe("immediate");
  });

  test("T-VA3: geography_shift → verdict=watch (not act)", () => {
    const args = deriveVerdictArgs(strongBrief, {
      comparisonAvailable: true,
      hasMaterialChange: true,
      hasSignificantChange: true,
      significanceDrivers: ["geography"],
      comparisonStrength: "standard",
      changeDirection: "geography_shift",
    });
    const verdict = deriveSignalVerdict(args);
    expect(verdict.verdict).toBe("watch");
    expect(verdict.verdict).not.toBe("act");
    expect(verdict.alertPriority).toBe("digest");
  });

  test("T-VA4: partial provider failure (Greenhouse success) → NOT verify_source", () => {
    // resultState shows observed openings — Greenhouse succeeded; Ashby failure is irrelevant.
    const args = deriveVerdictArgs(
      {
        ...strongBrief,
        resultState: "supported_provider_matched_with_observed_openings",
      },
      null
    );
    const verdict = deriveSignalVerdict(args);
    expect(verdict.verdict).not.toBe("verify_source");
  });

  test("T-VA5: provider_failure resultState → verify_source", () => {
    const args = deriveVerdictArgs(
      {
        ...strongBrief,
        resultState: "provider_failure",
      },
      null
    );
    const verdict = deriveSignalVerdict(args);
    expect(verdict.verdict).toBe("verify_source");
  });

  test("T-VA6: weak evidence (1 job) → ignore (not act)", () => {
    const args = deriveVerdictArgs(
      {
        ...strongBrief,
        jobsObservedCount: 1,
      },
      {
        comparisonAvailable: true,
        hasMaterialChange: true,
        hasSignificantChange: true,
        significanceDrivers: ["count"],
        comparisonStrength: "standard",
        changeDirection: "expansion",
      }
    );
    const verdict = deriveSignalVerdict(args);
    expect(verdict.verdict).toBe("ignore");
    expect(verdict.verdict).not.toBe("act");
  });
});

// ---------------------------------------------------------------------------
// Section 3: geography_shift safety (audit requirement)
// ---------------------------------------------------------------------------

test.describe("geography_shift does not produce ACT or immediate notification", () => {

  test("T-GS1: geography_shift with strong evidence produces watch verdict", () => {
    const args = deriveVerdictArgs(
      {
        jobsObservedCount: 20,
        watchlistReadLabel: "Product and engineering buildout signal",
        watchlistReadConfidence: "high",
        companyMatchConfidence: "high",
        proofRoleGrounding: "exact",
        resultState: "supported_provider_matched_with_observed_openings",
      },
      {
        comparisonAvailable: true,
        hasMaterialChange: true,
        hasSignificantChange: true,
        significanceDrivers: ["geography"],
        comparisonStrength: "standard",
        changeDirection: "geography_shift",
      }
    );
    const verdict = deriveSignalVerdict(args);
    expect(verdict.verdict).toBe("watch");
    expect(verdict.alertPriority).toBe("digest");
  });

  test("T-GS2: geography_shift does not create immediate notification", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ changeDirection: "geography_shift" }),
      currentSignalVerdict: "watch",
      previousSignalVerdict: "watch",
    });
    // watch + material change → digest, not immediate
    expect(draft?.alertPriority).not.toBe("immediate");
    if (draft) {
      expect(draft.alertPriority).toBe("digest");
    }
  });
});

// ---------------------------------------------------------------------------
// Section 4: Backward compatibility — no verdict args passed
// ---------------------------------------------------------------------------

test.describe("backward compatibility: no verdict args", () => {

  test("T-BC1: no verdict args → draft created with digest priority", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff(),
    });
    expect(draft).not.toBeNull();
    expect(draft?.alertPriority).toBe("digest");
  });

  test("T-BC2: no verdict args + no change types → null (existing behavior unchanged)", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "saved_brief" }),
      currentState: makeState(),
      diff: makeDiff({ hasMaterialChange: false }),
    });
    // result_state did not change, watchlist_read did not change, ats_source did not change,
    // hasMaterialChange is false → no change types → null
    expect(draft).toBeNull();
  });

  test("T-BC3: first baseline (previousState.basis=none) → null regardless of verdict", () => {
    const draft = buildNotificationCandidateDraft({
      currentAttempt: makeAttempt(),
      previousAttempt: null,
      previousState: makeState({ basis: "none" }),
      currentState: makeState(),
      diff: makeDiff(),
      currentSignalVerdict: "act",
      previousSignalVerdict: null,
    });
    // Existing gate: no notification for first scan.
    expect(draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Section 5: Phase 6E-3 — alert priority labels, ranks, and sort ordering
// ---------------------------------------------------------------------------

test.describe("formatNotificationAlertPriorityLabel", () => {
  test("T-PL1: immediate → 'Immediate'", () => {
    expect(formatNotificationAlertPriorityLabel("immediate")).toBe("Immediate");
  });

  test("T-PL2: source_issue → 'Source issue'", () => {
    expect(formatNotificationAlertPriorityLabel("source_issue")).toBe("Source issue");
  });

  test("T-PL3: digest → 'Watch update'", () => {
    expect(formatNotificationAlertPriorityLabel("digest")).toBe("Watch update");
  });

  test("T-PL4: suppressed → 'Suppressed'", () => {
    expect(formatNotificationAlertPriorityLabel("suppressed")).toBe("Suppressed");
  });
});

test.describe("getNotificationAlertPriorityRank sort ordering", () => {
  test("T-PR1: immediate has lowest rank (sorts first)", () => {
    expect(getNotificationAlertPriorityRank("immediate")).toBe(0);
  });

  test("T-PR2: source_issue has rank 1 (above digest)", () => {
    expect(getNotificationAlertPriorityRank("source_issue")).toBe(1);
  });

  test("T-PR3: digest has rank 2", () => {
    expect(getNotificationAlertPriorityRank("digest")).toBe(2);
  });

  test("T-PR4: suppressed has highest rank (sorts last)", () => {
    expect(getNotificationAlertPriorityRank("suppressed")).toBe(3);
  });

  test("T-PR5: immediate ranks lower than source_issue", () => {
    expect(getNotificationAlertPriorityRank("immediate")).toBeLessThan(
      getNotificationAlertPriorityRank("source_issue")
    );
  });

  test("T-PR6: source_issue ranks lower than digest", () => {
    expect(getNotificationAlertPriorityRank("source_issue")).toBeLessThan(
      getNotificationAlertPriorityRank("digest")
    );
  });

  test("T-PR7: digest ranks lower than suppressed", () => {
    expect(getNotificationAlertPriorityRank("digest")).toBeLessThan(
      getNotificationAlertPriorityRank("suppressed")
    );
  });
});

test.describe("sortAndFilterNotifications behavior (via rank helper)", () => {
  function makeInboxItem(
    id: string,
    alertPriority: StratumNotificationAlertPriority,
    createdAt: string
  ): WatchlistNotificationInboxItem {
    return {
      id,
      watchlistEntryId: "entry-1",
      monitoringEventId: "event-1",
      relatedBriefId: null,
      attemptOrigin: "manual_refresh",
      candidateKind: "meaningful_monitoring_change",
      status: "unread",
      changeTypes: ["saved_brief_material_change"],
      summary: "Test summary",
      alertPriority,
      createdAt,
      readAt: null,
      dismissedAt: null,
      externalDeliveryAt: null,
      deliveryMode: "in_app_inbox_only",
      watchlistId: "wl-1",
      watchlistName: "Test Watchlist",
      requestedQuery: "https://boards.greenhouse.io/test",
      latestMatchedCompanyName: "Test Corp",
      latestBriefId: null,
    };
  }

  test("T-SF1: immediate sorts before digest", () => {
    const items = [
      makeInboxItem("b", "digest", "2025-01-02T00:00:00Z"),
      makeInboxItem("a", "immediate", "2025-01-01T00:00:00Z"),
    ];
    const sorted = [...items].sort(
      (a, b) =>
        getNotificationAlertPriorityRank(a.alertPriority) -
        getNotificationAlertPriorityRank(b.alertPriority)
    );
    expect(sorted[0].alertPriority).toBe("immediate");
    expect(sorted[1].alertPriority).toBe("digest");
  });

  test("T-SF2: source_issue sorts before digest", () => {
    const items = [
      makeInboxItem("b", "digest", "2025-01-01T00:00:00Z"),
      makeInboxItem("a", "source_issue", "2025-01-01T00:00:00Z"),
    ];
    const sorted = [...items].sort(
      (a, b) =>
        getNotificationAlertPriorityRank(a.alertPriority) -
        getNotificationAlertPriorityRank(b.alertPriority)
    );
    expect(sorted[0].alertPriority).toBe("source_issue");
  });

  test("T-SF3: immediate sorts before source_issue", () => {
    const items = [
      makeInboxItem("b", "source_issue", "2025-01-01T00:00:00Z"),
      makeInboxItem("a", "immediate", "2025-01-01T00:00:00Z"),
    ];
    const sorted = [...items].sort(
      (a, b) =>
        getNotificationAlertPriorityRank(a.alertPriority) -
        getNotificationAlertPriorityRank(b.alertPriority)
    );
    expect(sorted[0].alertPriority).toBe("immediate");
    expect(sorted[1].alertPriority).toBe("source_issue");
  });

  test("T-SF4: within same priority, newer createdAt sorts first", () => {
    const items = [
      makeInboxItem("older", "digest", "2025-01-01T00:00:00Z"),
      makeInboxItem("newer", "digest", "2025-01-03T00:00:00Z"),
    ];
    // Simulate the sort: rank equal → sort by createdAt desc
    const sorted = [...items].sort((a, b) => {
      const rankDiff =
        getNotificationAlertPriorityRank(a.alertPriority) -
        getNotificationAlertPriorityRank(b.alertPriority);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    expect(sorted[0].id).toBe("newer");
    expect(sorted[1].id).toBe("older");
  });

  test("T-SF5: suppressed items are removed by priority filter", () => {
    const items = [
      makeInboxItem("a", "immediate", "2025-01-01T00:00:00Z"),
      makeInboxItem("b", "suppressed", "2025-01-01T00:00:00Z"),
      makeInboxItem("c", "digest", "2025-01-01T00:00:00Z"),
    ];
    const filtered = items.filter((item) => item.alertPriority !== "suppressed");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((item) => item.alertPriority !== "suppressed")).toBe(true);
  });

  test("T-SF6: legacy notification without alertPriority defaults to digest behavior", () => {
    // alertPriority defaults to "digest" in the DB and in mapNotificationCandidateRow.
    // Any notification missing the field at the type level would still produce "digest"
    // via the null coalescing in the repository mapper.
    const item = makeInboxItem("legacy", "digest", "2025-01-01T00:00:00Z");
    expect(getNotificationAlertPriorityRank(item.alertPriority)).toBe(2);
    expect(formatNotificationAlertPriorityLabel(item.alertPriority)).toBe("Watch update");
  });
});
