import assert from "node:assert/strict";
import { buildNotificationDisplayCopy, deriveNotificationTag } from "@/lib/watchlists/notificationDisplay";
import { deriveWatchlistInboxSection } from "@/lib/watchlists/inboxSection";
import {
  buildNotificationCandidateDraft,
  type MonitoringStateComparisonSnapshot,
  type WatchlistNotificationInboxItem,
} from "@/lib/watchlists/notifications";
import type { WatchlistMonitoringAttemptHistoryItem } from "@/lib/watchlists/monitoringEvents";
import type { WatchlistEntryDiff } from "@/lib/watchlists/history";

const BASE_NOTIFICATION: WatchlistNotificationInboxItem = {
  id: "notification-1",
  watchlistEntryId: "entry-1",
  monitoringEventId: "event-1",
  relatedBriefId: "brief-1",
  attemptOrigin: "manual_refresh",
  candidateKind: "meaningful_monitoring_change",
  status: "unread",
  changeTypes: ["result_state_changed", "saved_brief_material_change"],
  summary: "Result state changed from No result state to Supported provider matched with observed openings.",
  alertPriority: "immediate",
  // No stored snapshot by default — exercises the legacy fallback path.
  displayTag: null,
  displayMainLine: null,
  displayNextStep: null,
  createdAt: new Date().toISOString(),
  readAt: null,
  dismissedAt: null,
  externalDeliveryAt: null,
  deliveryMode: "in_app_inbox_only",
  watchlistId: "watchlist-1",
  watchlistName: "Test Watchlist",
  requestedQuery: "Ramp",
  latestMatchedCompanyName: "Ramp",
  latestBriefId: "brief-1",
  latestResultState: "supported_provider_matched_with_observed_openings",
  latestWatchlistReadLabel: "Broader product and GTM buildout",
  latestSignalVerdict: "act",
  latestObservedJobsCount: 68,
  previousObservedJobsCount: 50,
  latestTopHiringBucket: "Sales",
  latestTopHiringBucketCount: 68,
  previousTopHiringBucket: "Sales",
  previousTopHiringBucketCount: 50,
};

function buildNotification(
  overrides: Partial<WatchlistNotificationInboxItem>
): WatchlistNotificationInboxItem {
  return { ...BASE_NOTIFICATION, ...overrides };
}

const BANNED_PHRASES = [
  "Meaningful change detected",
  "Result state changed",
  "Watchlist read changed",
  "ATS source changed",
  "Saved brief material change",
  "meaningful change",
  "signal clarity",
  "evidence quality",
  "monitoring state",
  "material movement",
  "baseline still forming",
  "notification candidate",
  "digest alert",
];

function assertNoBannedPhrases(label: string, copy: { tag: string; mainLine: string; nextStep: string }) {
  for (const phrase of BANNED_PHRASES) {
    assert.ok(
      !copy.mainLine.toLowerCase().includes(phrase.toLowerCase()),
      `${label} mainLine "${copy.mainLine}" must not contain "${phrase}"`
    );
    assert.ok(
      !copy.nextStep.toLowerCase().includes(phrase.toLowerCase()),
      `${label} nextStep "${copy.nextStep}" must not contain "${phrase}"`
    );
    assert.ok(
      !copy.tag.toLowerCase().includes(phrase.toLowerCase()),
      `${label} tag "${copy.tag}" must not contain "${phrase}"`
    );
  }
}

// ---------------------------------------------------------------------------
// buildNotificationCandidateDraft fixtures (creation-time snapshot)
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
    watchlistReadLabel: "Broader product and GTM buildout",
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
    watchlistReadLabel: "Broader product and GTM buildout",
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
// 1. ACT unread notification priority agrees with the watchlist inbox
//    "needs_attention" section for the same entry state.
// ---------------------------------------------------------------------------
{
  const notification = buildNotification({ alertPriority: "immediate" });
  const section = deriveWatchlistInboxSection({
    signalVerdict: notification.latestSignalVerdict,
    latestUnreadAlertPriority: notification.alertPriority,
    latestResultState: notification.latestResultState,
    latestBriefId: notification.latestBriefId,
  });

  assert.equal(notification.alertPriority, "immediate", "ACT notification should be immediate priority");
  assert.equal(section, "needs_attention", "ACT entry should land in needs_attention");
}

// ---------------------------------------------------------------------------
// 2. source_issue notification priority agrees with the watchlist inbox
//    "source_issues" section for the same entry state.
// ---------------------------------------------------------------------------
{
  const notification = buildNotification({
    alertPriority: "source_issue",
    changeTypes: [],
    summary: "Verify source review needed.",
    latestSignalVerdict: "verify_source",
    relatedBriefId: null,
  });
  const section = deriveWatchlistInboxSection({
    signalVerdict: notification.latestSignalVerdict,
    latestUnreadAlertPriority: notification.alertPriority,
    latestResultState: notification.latestResultState,
    latestBriefId: notification.latestBriefId,
  });

  assert.equal(notification.alertPriority, "source_issue", "VERIFY_SOURCE notification should be source_issue priority");
  assert.equal(section, "source_issues", "VERIFY_SOURCE entry should land in source_issues");
}

// ---------------------------------------------------------------------------
// 3. digest/WATCH notifications do not appear as needs_attention.
// ---------------------------------------------------------------------------
{
  const notification = buildNotification({
    alertPriority: "digest",
    changeTypes: ["watchlist_read_changed", "saved_brief_material_change"],
    latestSignalVerdict: "watch",
    latestObservedJobsCount: 95,
    previousObservedJobsCount: 95,
    latestTopHiringBucket: "Sales",
    latestTopHiringBucketCount: 40,
    previousTopHiringBucket: "Sales",
    previousTopHiringBucketCount: 38,
  });
  const section = deriveWatchlistInboxSection({
    signalVerdict: notification.latestSignalVerdict,
    latestUnreadAlertPriority: notification.alertPriority,
    latestResultState: notification.latestResultState,
    latestBriefId: notification.latestBriefId,
  });

  assert.notEqual(section, "needs_attention", "WATCH/digest entry must not be needs_attention");
  assert.equal(section, "watching", "WATCH/digest entry should be watching");
}

// ---------------------------------------------------------------------------
// 4. Legacy notification (no stored snapshot) whose related brief is still
//    the entry's latest falls back to the same main-line style as the
//    watchlist row.
// ---------------------------------------------------------------------------
{
  const notification = buildNotification({});
  const displayCopy = buildNotificationDisplayCopy(notification);

  assert.deepEqual(displayCopy, {
    mainLine: "Sales hiring grew from 50 to 68 jobs.",
    nextStep: "Use this for account timing.",
    tag: "Hiring changed",
  });
}

// ---------------------------------------------------------------------------
// 5. Internal/bad copy is never returned by the display formatter for legacy
//    fallback rows.
// ---------------------------------------------------------------------------
{
  const scenarios: Partial<WatchlistNotificationInboxItem>[] = [
    {}, // ACT with saved brief comparison
    {
      alertPriority: "digest",
      changeTypes: ["watchlist_read_changed", "saved_brief_material_change"],
      latestSignalVerdict: "watch",
      latestObservedJobsCount: 95,
      previousObservedJobsCount: 95,
      latestTopHiringBucket: "Sales",
      latestTopHiringBucketCount: 40,
      previousTopHiringBucket: "Sales",
      previousTopHiringBucketCount: 38,
    },
    {
      alertPriority: "digest",
      changeTypes: ["ats_source_changed", "result_state_changed"],
      relatedBriefId: null,
      latestBriefId: null,
      latestSignalVerdict: null,
      latestObservedJobsCount: null,
      previousObservedJobsCount: null,
      latestTopHiringBucket: null,
      latestTopHiringBucketCount: null,
      previousTopHiringBucket: null,
      previousTopHiringBucketCount: null,
    },
    {
      alertPriority: "source_issue",
      changeTypes: ["refresh_failed"],
      relatedBriefId: null,
      summary: "Manual refresh failed and did not replace the current monitoring state: simulated provider timeout.",
    },
    {
      alertPriority: "source_issue",
      changeTypes: [],
      latestSignalVerdict: "verify_source",
      relatedBriefId: null,
    },
  ];

  for (const overrides of scenarios) {
    const notification = buildNotification(overrides);
    const displayCopy = buildNotificationDisplayCopy(notification);
    const tag = deriveNotificationTag(notification);

    assertNoBannedPhrases("legacy fallback", { ...displayCopy, tag });
  }
}

// ---------------------------------------------------------------------------
// 6. New ACT notification stores point-in-time display copy matching the
//    watchlist row's "hiring grew" wording.
// ---------------------------------------------------------------------------
{
  const draft = buildNotificationCandidateDraft({
    currentAttempt: makeAttempt(),
    previousAttempt: null,
    previousState: makeState({ resultState: null }),
    currentState: makeState(),
    diff: makeDiff({ hasMaterialChange: false, hasSignificantChange: false, significanceDrivers: [] }),
    currentSignalVerdict: "act",
    previousSignalVerdict: "watch",
    latestBriefId: "00000000-0000-4000-8000-000000000003",
    latestObservedJobsCount: 68,
    previousObservedJobsCount: 50,
    latestTopHiringBucket: "Sales",
    latestTopHiringBucketCount: 68,
    previousTopHiringBucket: "Sales",
    previousTopHiringBucketCount: 50,
  });

  assert.ok(draft, "ACT draft should not be suppressed");
  assert.equal(draft?.alertPriority, "immediate");
  assert.deepEqual(
    {
      displayTag: draft?.displayTag,
      displayMainLine: draft?.displayMainLine,
      displayNextStep: draft?.displayNextStep,
    },
    {
      displayTag: "Hiring changed",
      displayMainLine: "Sales hiring grew from 50 to 68 jobs.",
      displayNextStep: "Use this for account timing.",
    }
  );
}

// ---------------------------------------------------------------------------
// 7. refresh_failed notification stores point-in-time "Refresh failed" copy.
// ---------------------------------------------------------------------------
{
  const draft = buildNotificationCandidateDraft({
    currentAttempt: makeAttempt({
      outcomeStatus: "failed",
      relatedBriefId: null,
      errorSummary: "simulated provider timeout",
    }),
    previousAttempt: makeAttempt({ outcomeStatus: "saved_brief_created", errorSummary: null }),
    previousState: makeState(),
    currentState: makeState(),
    diff: makeDiff(),
  });

  assert.ok(draft, "refresh_failed draft should not be null");
  assert.ok(draft?.changeTypes.includes("refresh_failed"));
  assert.ok(
    ["Refresh failed", "Source needs checking"].includes(draft!.displayTag),
    `displayTag "${draft?.displayTag}" should be "Refresh failed" or "Source needs checking"`
  );
  assert.equal(draft?.displayMainLine, "Refresh failed.");
  assert.equal(draft?.displayNextStep, "Check the source before using this signal.");
}

// ---------------------------------------------------------------------------
// 8. Notification inbox rendering prefers the stored display snapshot over
//    copy recomputed from the entry's current state.
// ---------------------------------------------------------------------------
{
  const notification = buildNotification({
    displayTag: "Hiring changed",
    displayMainLine: "Sales hiring grew from 50 to 68 jobs.",
    displayNextStep: "Use this for account timing.",
    // The entry has since moved on — recomputing from current state would no
    // longer say "grew from 50 to 68".
    latestSignalVerdict: "watch",
    latestObservedJobsCount: 68,
    previousObservedJobsCount: 68,
  });

  const displayCopy = buildNotificationDisplayCopy(notification);

  assert.deepEqual(displayCopy, {
    tag: "Hiring changed",
    mainLine: "Sales hiring grew from 50 to 68 jobs.",
    nextStep: "Use this for account timing.",
  });
}

// ---------------------------------------------------------------------------
// 9. Legacy notification (no stored snapshot) whose related brief is no
//    longer the entry's latest must not show a confident current-state
//    mainLine — it should read as an older update instead.
// ---------------------------------------------------------------------------
{
  const notification = buildNotification({
    displayTag: null,
    displayMainLine: null,
    displayNextStep: null,
    relatedBriefId: "brief-old",
    latestBriefId: "brief-new",
    // Current state would otherwise produce a confident "grew" mainLine.
    latestSignalVerdict: "act",
    latestObservedJobsCount: 68,
    previousObservedJobsCount: 50,
    latestTopHiringBucket: "Sales",
    latestTopHiringBucketCount: 68,
    previousTopHiringBucket: "Sales",
    previousTopHiringBucketCount: 50,
  });

  const displayCopy = buildNotificationDisplayCopy(notification);

  assert.notEqual(
    displayCopy.mainLine,
    "Sales hiring grew from 50 to 68 jobs.",
    "stale legacy row must not show a confident current-state mainLine"
  );
  assert.equal(displayCopy.mainLine, "Update from an earlier scan.");
  assert.equal(displayCopy.nextStep, "See details for what changed.");
}

// ---------------------------------------------------------------------------
// 10. Internal/bad copy is never stored in displayTag/displayMainLine/
//     displayNextStep at creation time.
// ---------------------------------------------------------------------------
{
  const actDraft = buildNotificationCandidateDraft({
    currentAttempt: makeAttempt(),
    previousAttempt: null,
    previousState: makeState({ resultState: null }),
    currentState: makeState(),
    diff: makeDiff({ hasMaterialChange: false, hasSignificantChange: false, significanceDrivers: [] }),
    currentSignalVerdict: "act",
    previousSignalVerdict: "watch",
    latestBriefId: "00000000-0000-4000-8000-000000000003",
    latestObservedJobsCount: 68,
    previousObservedJobsCount: 50,
    latestTopHiringBucket: "Sales",
    latestTopHiringBucketCount: 68,
    previousTopHiringBucket: "Sales",
    previousTopHiringBucketCount: 50,
  });

  const refreshFailedDraft = buildNotificationCandidateDraft({
    currentAttempt: makeAttempt({
      outcomeStatus: "failed",
      relatedBriefId: null,
      errorSummary: "simulated provider timeout",
    }),
    previousAttempt: makeAttempt({ outcomeStatus: "saved_brief_created", errorSummary: null }),
    previousState: makeState(),
    currentState: makeState(),
    diff: makeDiff(),
  });

  const watchDraft = buildNotificationCandidateDraft({
    currentAttempt: makeAttempt(),
    previousAttempt: null,
    previousState: makeState({ watchlistReadLabel: "Focused product hiring" }),
    currentState: makeState({ watchlistReadLabel: "Broader product and GTM buildout" }),
    diff: makeDiff({
      hasMaterialChange: true,
      summary: "Saved brief comparison now shows commercial hiring mixed into the same target.",
    }),
    currentSignalVerdict: "watch",
    previousSignalVerdict: "watch",
    latestBriefId: "00000000-0000-4000-8000-000000000003",
    latestObservedJobsCount: 95,
    previousObservedJobsCount: 95,
    latestTopHiringBucket: "Sales",
    latestTopHiringBucketCount: 40,
    previousTopHiringBucket: "Sales",
    previousTopHiringBucketCount: 38,
  });

  for (const draft of [actDraft, refreshFailedDraft, watchDraft]) {
    assert.ok(draft, "draft should not be null");
    assertNoBannedPhrases("stored snapshot", {
      tag: draft!.displayTag,
      mainLine: draft!.displayMainLine,
      nextStep: draft!.displayNextStep,
    });
  }
}

// ---------------------------------------------------------------------------
// 11. deriveNotificationTag priority: immediate/ACT notifications are always
//     tagged "Hiring changed", even when saved_brief_material_change is also
//     present. "Brief updated" is reserved for lower-priority digest/watch
//     updates. refresh_failed and source_issue still win over everything.
// ---------------------------------------------------------------------------
{
  assert.equal(
    deriveNotificationTag({
      alertPriority: "immediate",
      changeTypes: ["result_state_changed", "saved_brief_material_change"],
    }),
    "Hiring changed",
    "immediate priority must be tagged Hiring changed, not Brief updated"
  );

  assert.equal(
    deriveNotificationTag({
      alertPriority: "digest",
      changeTypes: ["watchlist_read_changed", "saved_brief_material_change"],
    }),
    "Brief updated",
    "digest priority with a material brief change is still Brief updated"
  );

  assert.equal(
    deriveNotificationTag({
      alertPriority: "source_issue",
      changeTypes: [],
    }),
    "Source needs checking"
  );

  assert.equal(
    deriveNotificationTag({
      alertPriority: "immediate",
      changeTypes: ["refresh_failed", "saved_brief_material_change"],
    }),
    "Refresh failed",
    "refresh_failed always wins regardless of alertPriority"
  );
}

console.log("notification-display checks passed.");
