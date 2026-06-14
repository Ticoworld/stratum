export interface WatchlistActionCopyInput {
  verdict?: string | null;
  resultState?: string | null;
  latestUnreadAlertPriority?: string | null;
  latestWatchlistReadLabel?: string | null;
  latestBriefId?: string | null;
  latestObservedJobsCount?: number | null;
  previousObservedJobsCount?: number | null;
  latestTopHiringBucket?: string | null;
  latestTopHiringBucketCount?: number | null;
  previousTopHiringBucket?: string | null;
  previousTopHiringBucketCount?: number | null;
  /** True while a refresh is in flight for this entry (e.g. the first check after tracking). */
  isCheckingNow?: boolean | null;
}

export interface WatchlistActionCopy {
  mainLine: string;
  nextStep: string;
}

const SALES_HINTS = [
  "sales",
  "gtm",
  "go-to-market",
  "go to market",
  "go to-market",
  "revenue",
  "revops",
  "business development",
  "customer success",
  "account executive",
  "partnership",
  "partnerships",
  "sdr",
  "bdr",
  "demand generation",
];

const MARKETING_HINTS = [
  "marketing",
  "product marketing",
  "brand",
  "content",
];

const FINANCE_HINTS = [
  "finance",
  "financial",
  "accounting",
  "controller",
  "treasury",
  "fp&a",
  "billing",
  "bookkeeping",
];

const LEADERSHIP_HINTS = [
  "leadership",
  "head of",
  "vice president",
  "vp ",
  " vp",
  "chief ",
  "director",
  "general manager",
  " gm ",
  "founder",
  "executive",
];

const OPERATIONS_HINTS = [
  "operations",
  " ops",
  "ops ",
  "platform",
  "infrastructure",
  "devops",
  "sre",
  "reliability",
  "security",
  "compliance",
  "risk",
  "trust",
  "governance",
  "logistics",
  "supply chain",
];

const ENGINEERING_HINTS = [
  "engineering",
  "engineer",
  "technical",
  "technology",
  "software",
  "backend",
  "frontend",
  "full stack",
  "data",
  "ai",
  "machine learning",
  "ml",
  "developer",
];

const PRODUCT_HINTS = [
  "product",
  "product manager",
  "product management",
  "design",
  "ux",
];

const NO_CLEAR_LEAD_HINTS = [
  "limited",
  "thin",
  "tentative",
  "no clear",
  "no signal",
  "zero openings",
];

const MIXED_HINTS = [
  "mixed",
  "broad",
  "multi-function",
  "multi function",
  "broad platform",
  "broad multi-function",
];

const APPEARANCE_HINTS = [
  "risk and compliance",
  "risk",
  "compliance",
  "security",
  "trust",
  "governance",
  "legal",
  "privacy",
];

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function includesAny(text: string, hints: string[]): boolean {
  return hints.some((hint) => text.includes(hint));
}

function isBriefPresent(args: WatchlistActionCopyInput): boolean {
  return Boolean(args.latestBriefId);
}

function deriveLeadLabel(label: string | null | undefined): string | null {
  const normalized = normalizeText(label);
  if (!normalized) return null;

  if (includesAny(normalized, NO_CLEAR_LEAD_HINTS)) {
    return "No clear lead";
  }

  if (includesAny(normalized, SALES_HINTS)) {
    return "Sales-led";
  }

  if (includesAny(normalized, MARKETING_HINTS)) {
    return "Marketing-led";
  }

  if (includesAny(normalized, FINANCE_HINTS)) {
    return "Finance-led";
  }

  if (includesAny(normalized, LEADERSHIP_HINTS)) {
    return "Leadership-led";
  }

  if (includesAny(normalized, OPERATIONS_HINTS)) {
    return "Operations-led";
  }

  if (includesAny(normalized, ENGINEERING_HINTS)) {
    return "Engineering-led";
  }

  if (includesAny(normalized, PRODUCT_HINTS)) {
    return "Product-led";
  }

  if (includesAny(normalized, MIXED_HINTS)) {
    return "Mixed";
  }

  return "No clear lead";
}

function formatHeadlineForLead(leadLabel: string): string {
  if (leadLabel === "Mixed" || leadLabel === "No clear lead") {
    return "Hiring changed";
  }

  return `${leadLabel.replace(/-led$/, "")} hiring`;
}

function formatObservedJobsSuffix(count: number | null | undefined): string {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return "";
  return `, ${count} ${count === 1 ? "job" : "jobs"}`;
}

function hasNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Whether a row has any data from a previous scan to compare against.
 * Exposed so callers (e.g. the daily summary) can detect "first scan" rows
 * from real fields instead of parsing mainLine copy.
 */
export function hasWatchlistComparisonData(args: {
  previousObservedJobsCount?: number | null;
  previousTopHiringBucket?: string | null;
  previousTopHiringBucketCount?: number | null;
}): boolean {
  return (
    hasNumber(args.previousObservedJobsCount) ||
    hasText(args.previousTopHiringBucket) ||
    hasNumber(args.previousTopHiringBucketCount)
  );
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeText(left) === normalizeText(right);
}

function isAppearanceBucket(label: string | null | undefined): boolean {
  const normalized = normalizeText(label);
  if (!normalized) return false;
  return includesAny(normalized, APPEARANCE_HINTS);
}

const CLEAR_TOP_BUCKET_SHARE_THRESHOLD = 0.35;

interface ComparisonState {
  latestObservedJobsCount: number | null;
  previousObservedJobsCount: number | null;
  latestTopHiringBucket: string | null;
  latestTopHiringBucketCount: number | null;
  previousTopHiringBucket: string | null;
  previousTopHiringBucketCount: number | null;
  hasComparisonData: boolean;
  hasTopBucketComparison: boolean;
  sameTopBucket: boolean;
}

function buildComparisonState(args: WatchlistActionCopyInput): ComparisonState {
  const latestObservedJobsCount = hasNumber(args.latestObservedJobsCount)
    ? args.latestObservedJobsCount
    : null;
  const previousObservedJobsCount = hasNumber(args.previousObservedJobsCount)
    ? args.previousObservedJobsCount
    : null;
  const latestTopHiringBucket = hasText(args.latestTopHiringBucket)
    ? args.latestTopHiringBucket.trim()
    : null;
  const latestTopHiringBucketCount = hasNumber(args.latestTopHiringBucketCount)
    ? args.latestTopHiringBucketCount
    : null;
  const previousTopHiringBucket = hasText(args.previousTopHiringBucket)
    ? args.previousTopHiringBucket.trim()
    : null;
  const previousTopHiringBucketCount = hasNumber(args.previousTopHiringBucketCount)
    ? args.previousTopHiringBucketCount
    : null;

  return {
    latestObservedJobsCount,
    previousObservedJobsCount,
    latestTopHiringBucket,
    latestTopHiringBucketCount,
    previousTopHiringBucket,
    previousTopHiringBucketCount,
    hasComparisonData:
      previousObservedJobsCount !== null ||
      previousTopHiringBucket !== null ||
      previousTopHiringBucketCount !== null,
    hasTopBucketComparison:
      latestTopHiringBucket !== null &&
      previousTopHiringBucket !== null &&
      latestTopHiringBucketCount !== null &&
      previousTopHiringBucketCount !== null,
    sameTopBucket:
      latestTopHiringBucket !== null &&
      previousTopHiringBucket !== null &&
      sameText(latestTopHiringBucket, previousTopHiringBucket),
  };
}

function hasClearTopBucketLead(comparison: ComparisonState): boolean {
  if (!comparison.sameTopBucket || !comparison.latestTopHiringBucket) return false;

  const shares: number[] = [];

  if (
    comparison.latestTopHiringBucketCount !== null &&
    comparison.latestObservedJobsCount !== null &&
    comparison.latestObservedJobsCount > 0
  ) {
    shares.push(comparison.latestTopHiringBucketCount / comparison.latestObservedJobsCount);
  }

  if (
    comparison.previousTopHiringBucketCount !== null &&
    comparison.previousObservedJobsCount !== null &&
    comparison.previousObservedJobsCount > 0
  ) {
    shares.push(comparison.previousTopHiringBucketCount / comparison.previousObservedJobsCount);
  }

  if (shares.length === 0) return true;
  return Math.max(...shares) >= CLEAR_TOP_BUCKET_SHARE_THRESHOLD;
}

export function buildWatchlistActionCopy(
  args: WatchlistActionCopyInput
): WatchlistActionCopy {
  if (!isBriefPresent(args)) {
    if (args.isCheckingNow) {
      return {
        mainLine: "First check in progress.",
        nextStep: "We'll show the result when it finishes.",
      };
    }

    return {
      mainLine: "No scan yet.",
      nextStep: "Refresh to run the first check.",
    };
  }

  const leadLabel = deriveLeadLabel(args.latestWatchlistReadLabel);
  const sourceIssueAlert = args.latestUnreadAlertPriority === "source_issue";
  const actSignal = args.verdict === "act" || args.latestUnreadAlertPriority === "immediate";
  const comparison = buildComparisonState(args);
  const hasLeadLabel = leadLabel && leadLabel !== "Mixed" && leadLabel !== "No clear lead";
  const isFirstScan = !comparison.hasComparisonData && args.latestUnreadAlertPriority !== "digest";
  const isLaterScanWithoutPreviousCount =
    !comparison.hasComparisonData && args.latestUnreadAlertPriority === "digest";

  if (args.verdict === "verify_source") {
    return {
      mainLine: "Source needs checking.",
      nextStep: "Check the source before using this.",
    };
  }

  if (sourceIssueAlert || args.resultState === "provider_failure") {
    return {
      mainLine: "Refresh failed.",
      nextStep: "Check the source before using this signal.",
    };
  }

  if (actSignal) {
    if (comparison.hasComparisonData) {
      if (
        comparison.latestTopHiringBucket &&
        comparison.previousTopHiringBucket &&
        !comparison.sameTopBucket
      ) {
        return {
          mainLine: `Hiring shifted from ${comparison.previousTopHiringBucket} to ${comparison.latestTopHiringBucket}.`,
          nextStep: "Check the brief before acting.",
        };
      }

      if (
        comparison.hasTopBucketComparison &&
        comparison.sameTopBucket &&
        comparison.latestTopHiringBucket
      ) {
        const latestTopCount = comparison.latestTopHiringBucketCount;
        const previousTopCount = comparison.previousTopHiringBucketCount;

        if (latestTopCount !== null && previousTopCount !== null && latestTopCount > previousTopCount) {
          return {
            mainLine: `${comparison.latestTopHiringBucket} hiring grew from ${previousTopCount} to ${latestTopCount} jobs.`,
            nextStep: "Use this for account timing.",
          };
        }

        if (latestTopCount !== null && previousTopCount !== null && latestTopCount < previousTopCount) {
          return {
            mainLine: `${comparison.latestTopHiringBucket} hiring dropped from ${previousTopCount} to ${latestTopCount} jobs.`,
            nextStep: "Use this for account timing.",
          };
        }
      }

      if (
        comparison.latestTopHiringBucket &&
        isAppearanceBucket(comparison.latestTopHiringBucket) &&
        comparison.latestTopHiringBucketCount !== null &&
        (comparison.previousTopHiringBucketCount === null || comparison.previousTopHiringBucketCount === 0)
      ) {
        return {
          mainLine: `${comparison.latestTopHiringBucket} roles appeared.`,
          nextStep: "Use this for account or competitor research.",
        };
      }

      if (
        comparison.latestObservedJobsCount !== null &&
        comparison.previousObservedJobsCount !== null
      ) {
        if (comparison.latestObservedJobsCount > comparison.previousObservedJobsCount) {
          return {
            mainLine: `Hiring grew from ${comparison.previousObservedJobsCount} to ${comparison.latestObservedJobsCount} jobs.`,
            nextStep: "Use this for account research.",
          };
        }

        if (comparison.latestObservedJobsCount < comparison.previousObservedJobsCount) {
          return {
            mainLine: `Hiring dropped from ${comparison.previousObservedJobsCount} to ${comparison.latestObservedJobsCount} jobs.`,
            nextStep: "Use this for account timing.",
          };
        }
      }

      if (comparison.latestTopHiringBucket) {
        return {
          mainLine: `${comparison.latestTopHiringBucket} still leads.`,
          nextStep: "Check the brief before acting.",
        };
      }

      return {
        mainLine: "Hiring changed enough to act on.",
        nextStep: "Check the brief before acting.",
      };
    }

    return {
      mainLine:
        hasLeadLabel && leadLabel
          ? `${formatHeadlineForLead(leadLabel)} increased since last scan.`
          : "Hiring changed enough to act on.",
      nextStep: "Use this for account research or outreach timing.",
    };
  }

  if (args.verdict === "wait") {
    return {
      mainLine: "Not enough hiring data yet.",
      nextStep: "Keep it on the watchlist.",
    };
  }

  if (args.verdict === "ignore") {
    return {
      mainLine: "No useful hiring signal.",
      nextStep: "No action needed.",
    };
  }

  if (args.verdict === "watch") {
    if (isFirstScan) {
      return {
        mainLine:
          hasLeadLabel && leadLabel
            ? `${leadLabel} first scan${formatObservedJobsSuffix(args.latestObservedJobsCount)}.`
            : `First scan${formatObservedJobsSuffix(args.latestObservedJobsCount)}.`,
        nextStep: "Wait for the next scan to see what changed.",
      };
    }

    if (isLaterScanWithoutPreviousCount) {
      return {
        mainLine: "Still watching. No major change yet.",
        nextStep: "Keep tracking.",
      };
    }

    if (comparison.hasComparisonData) {
      if (
        comparison.latestObservedJobsCount !== null &&
        comparison.previousObservedJobsCount !== null &&
        comparison.latestObservedJobsCount < comparison.previousObservedJobsCount
      ) {
        return {
          mainLine: `Hiring dropped from ${comparison.previousObservedJobsCount} to ${comparison.latestObservedJobsCount} jobs.`,
          nextStep: "Keep watching unless the drop matters to your workflow.",
        };
      }

      if (
        comparison.latestTopHiringBucket &&
        comparison.previousTopHiringBucket &&
        !comparison.sameTopBucket
      ) {
        return {
          mainLine: `Hiring shifted from ${comparison.previousTopHiringBucket} to ${comparison.latestTopHiringBucket}.`,
          nextStep: "Keep watching.",
        };
      }

      if (
        comparison.sameTopBucket &&
        comparison.latestTopHiringBucket
      ) {
        if (hasClearTopBucketLead(comparison)) {
          return {
            mainLine: `${comparison.latestTopHiringBucket} still leads. No major change since last scan.`,
            nextStep: "Keep watching.",
          };
        }

        return {
          mainLine: `${comparison.latestTopHiringBucket} hiring changed slightly.`,
          nextStep: "Keep watching.",
        };
      }

      if (
        comparison.latestObservedJobsCount !== null &&
        comparison.previousObservedJobsCount !== null
      ) {
        if (comparison.latestObservedJobsCount === comparison.previousObservedJobsCount) {
          if (comparison.latestTopHiringBucket) {
            return {
              mainLine: `${comparison.latestTopHiringBucket} still leads. No major change since last scan.`,
              nextStep: "Keep watching.",
            };
          }

          return {
            mainLine: "Still watching. No major change yet.",
            nextStep: "Keep tracking.",
          };
        }

        return {
          mainLine: "Hiring changed slightly.",
          nextStep: "Keep watching.",
        };
      }
    }

    return {
      mainLine: "Still watching. No major change yet.",
      nextStep: "Keep tracking.",
    };
  }

  return {
    mainLine: "First scan complete.",
    nextStep: "Wait for the next scan to see what changed.",
  };
}
