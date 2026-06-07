export interface WatchlistActionCopyInput {
  verdict?: string | null;
  resultState?: string | null;
  latestUnreadAlertPriority?: string | null;
  latestWatchlistReadLabel?: string | null;
  latestBriefId?: string | null;
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

export function buildWatchlistActionCopy(
  args: WatchlistActionCopyInput
): WatchlistActionCopy {
  if (!isBriefPresent(args)) {
    return {
      mainLine: "No scan yet.",
      nextStep: "Add or refresh this company to start tracking.",
    };
  }

  const leadLabel = deriveLeadLabel(args.latestWatchlistReadLabel);
  const sourceIssueAlert = args.latestUnreadAlertPriority === "source_issue";
  const actSignal = args.verdict === "act" || args.latestUnreadAlertPriority === "immediate";

  if (actSignal) {
    return {
      mainLine:
        leadLabel && leadLabel !== "Mixed" && leadLabel !== "No clear lead"
          ? `${formatHeadlineForLead(leadLabel)} increased since last scan.`
          : "Hiring changed enough to act.",
      nextStep: "Use this for account research or outreach timing.",
    };
  }

  if (args.verdict === "verify_source") {
    return {
      mainLine: "Source needs checking.",
      nextStep: "Check the source before using this.",
    };
  }

  if (sourceIssueAlert || args.resultState === "provider_failure") {
    return {
      mainLine: "Scan problem.",
      nextStep: "Check source details.",
    };
  }

  if (args.verdict === "wait") {
    return {
      mainLine: "Not enough signal yet.",
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
    if (args.latestUnreadAlertPriority === "digest") {
      return {
        mainLine: "Still watching. No major change yet.",
        nextStep: "Keep tracking.",
      };
    }

    return {
      mainLine:
        leadLabel && leadLabel !== "Mixed" && leadLabel !== "No clear lead"
          ? `${leadLabel} first scan.`
          : "First scan complete.",
      nextStep: "Wait for the next scan to see what changed.",
    };
  }

  return {
    mainLine: "First scan complete.",
    nextStep: "Wait for the next scan to see what changed.",
  };
}
