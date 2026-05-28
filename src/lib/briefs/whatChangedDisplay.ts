export type WhatChangedDisplay =
  | { kind: "archived" }
  | { kind: "baseline" }
  | { kind: "standard"; heading: string | null; summary: string; comparisonStrength: "standard" | "weak" | "unavailable" }
  | { kind: "weak_caveat"; heading: string | null; caveat: string; fullSummary: string };

/**
 * Determines what the "What Changed" block should display for a saved brief page.
 *
 * Rules:
 * - older brief: the entry-level diff (history[0] vs history[1]) is unrelated → return "archived"
 * - no comparison yet: return "baseline"
 * - previous brief (history[1]): add "Since this brief was saved" heading so the forward
 *   direction is explicit; the diff is comparing this brief to the current latest
 * - latest brief (history[0]): standard display with no extra framing
 * - weak comparison strength: collapse raw summary behind "Show detailed change log";
 *   surface the comparison note as the primary caveat instead
 */
export function buildWhatChangedDisplay(args: {
  briefPosition: "latest" | "previous" | "older" | null | undefined;
  comparisonAvailable: boolean | null | undefined;
  comparisonStrength: "standard" | "weak" | "unavailable" | null | undefined;
  comparisonSummary: string | null | undefined;
  comparisonNotes: string[] | null | undefined;
}): WhatChangedDisplay {
  const { briefPosition, comparisonAvailable, comparisonStrength, comparisonSummary, comparisonNotes } = args;

  // Older briefs: the entry-level diff is always history[0] vs history[1], which is
  // unrelated to this archived brief. Showing it would be misleading.
  if (briefPosition === "older") {
    return { kind: "archived" };
  }

  // No comparison data exists yet for this entry.
  if (!comparisonAvailable || !comparisonSummary) {
    return { kind: "baseline" };
  }

  // For the previous brief (history[1]), the diff shows what changed FROM this brief
  // TO the latest. Add a heading so the temporal direction is unambiguous.
  const heading = briefPosition === "previous" ? "Since this brief was saved" : null;

  // Weak comparison: surface the comparison note as the primary text and collapse
  // the full raw summary so giant-board department churn isn't the first thing shown.
  if (comparisonStrength === "weak") {
    const caveat =
      comparisonNotes?.[0] ??
      "Comparison is limited because one side uses legacy or incomplete comparison data. Treat this as directional movement, not a clean strategic shift.";
    return { kind: "weak_caveat", heading, caveat, fullSummary: comparisonSummary };
  }

  return {
    kind: "standard",
    heading,
    summary: comparisonSummary,
    comparisonStrength: comparisonStrength ?? "standard",
  };
}
