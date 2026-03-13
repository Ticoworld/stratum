import { type ReportJson } from "@/lib/reports/reportJson";

type ReportClaim = ReportJson["claims"][number];
type ReportEvidence = ReportJson["evidenceAppendix"][number];

export type PresentedExecutiveSummaryItem = ReportJson["executiveSummary"][number] & {
  evidenceNumbers: number[];
};

export type PresentedClaim = ReportClaim & {
  claimNumber: number;
  evidenceNumbers: number[];
  claimLabel: string;
  confidenceLabel: string;
};

export type PresentedEvidence = ReportEvidence & {
  evidenceNumber: number;
  claimNumbers: number[];
};

export interface PresentedCaveatGroup {
  title: string;
  items: string[];
}

export interface PresentedReport {
  executiveSummary: PresentedExecutiveSummaryItem[];
  claims: PresentedClaim[];
  evidenceAppendix: PresentedEvidence[];
  caveatGroups: PresentedCaveatGroup[];
}

const PROVIDER_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
};

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function toLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function presentProviderName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return PROVIDER_LABELS[normalized] ?? toLabel(value);
}

export function presentRunStatus(value: string): string {
  switch (value) {
    case "queued":
      return "Awaiting worker";
    case "claimed":
      return "Worker started";
    case "resolving":
      return "Resolving company";
    case "fetching":
      return "Capturing hiring snapshot";
    case "normalizing":
      return "Preparing hiring dataset";
    case "analyzing":
      return "Analyzing hiring evidence";
    case "validating":
      return "Validating evidence and publication checks";
    case "publishing":
      return "Publishing report";
    case "completed":
      return "Published";
    case "completed_partial":
      return "Published with partial coverage";
    case "completed_zero_data":
      return "Published with no active roles observed";
    case "failed":
      return "Run failed";
    case "needs_resolution":
      return "Needs company review";
    default:
      return toLabel(value);
  }
}

export function presentDataMode(value: string | null | undefined): string {
  switch (value) {
    case "completed":
      return "Complete coverage";
    case "partial-data":
      return "Partial coverage";
    case "zero-data":
      return "No active roles observed";
    default:
      return "In progress";
  }
}

export function presentCompanyResolution(value: string): string {
  switch (value) {
    case "resolved":
      return "Resolved";
    case "resolving":
      return "In progress";
    case "needs_resolution":
      return "Needs company review";
    default:
      return toLabel(value);
  }
}

export function presentSnapshotStatus(value: string): string {
  switch (value) {
    case "captured":
      return "Snapshot captured";
    case "zero_data":
      return "No active roles observed";
    case "provider_error":
      return "Provider unavailable";
    case "skipped":
      return "Skipped";
    default:
      return toLabel(value);
  }
}

function getClaimLabel(supportStatus: string): string {
  if (supportStatus.trim().length > 0) {
    return supportStatus;
  }

  return "Observed hiring signal";
}

function getCaveatGroupTitle(type: string): string {
  if (type === "dataset_quality") {
    return "Evidence strength";
  }

  if (type === "unknown") {
    return "What the evidence does not show";
  }

  if (type === "analysis") {
    return "Interpretation limits";
  }

  if (type === "provider_failure") {
    return "Coverage notes";
  }

  return "Additional context";
}

function normalizeCaveatText(value: string) {
  return value
    .replace(/\bASHBY\b/g, presentProviderName("ashby"))
    .replace(/\bGREENHOUSE\b/g, presentProviderName("greenhouse"))
    .replace(/\bLEVER\b/g, presentProviderName("lever"))
    .replace(/\bWORKABLE\b/g, presentProviderName("workable"));
}

export function presentReport(report: ReportJson): PresentedReport {
  const claimNumbersById = new Map<string, number>();
  const evidenceNumbersByNormalizedJobId = new Map<string, number>();
  const normalizedJobIdByCitationId = new Map<string, string>();
  const claimsById = new Map<string, PresentedClaim>();

  report.evidenceAppendix.forEach((evidence, index) => {
    evidenceNumbersByNormalizedJobId.set(evidence.normalizedJobId, index + 1);
  });

  report.citations.forEach((citation) => {
    normalizedJobIdByCitationId.set(citation.citationId, citation.normalizedJobId);
  });

  const claims = report.claims.map((claim, index) => {
    const claimNumber = index + 1;
    claimNumbersById.set(claim.claimId, claimNumber);

    const evidenceNumbers = uniqueSorted(
      claim.citationRefs
        .map((citationId) => normalizedJobIdByCitationId.get(citationId))
        .filter((normalizedJobId): normalizedJobId is string => Boolean(normalizedJobId))
        .map((normalizedJobId) => evidenceNumbersByNormalizedJobId.get(normalizedJobId))
        .filter((evidenceNumber): evidenceNumber is number => typeof evidenceNumber === "number")
    );

    const presentedClaim = {
      ...claim,
      claimNumber,
      evidenceNumbers,
      claimLabel: getClaimLabel(claim.supportStatus),
      confidenceLabel: `Confidence: ${toLabel(claim.confidence)}`,
    };

    claimsById.set(claim.claimId, presentedClaim);
    return presentedClaim;
  });

  const executiveSummary = report.executiveSummary.map((item) => ({
    ...item,
    evidenceNumbers: uniqueSorted(
      item.claimRefs
        .map((claimId) => claimsById.get(claimId))
        .filter((claim): claim is PresentedClaim => Boolean(claim))
        .flatMap((claim) => claim.evidenceNumbers)
    ),
  }));

  const evidenceAppendix = report.evidenceAppendix.map((evidence, index) => ({
    ...evidence,
    evidenceNumber: index + 1,
    claimNumbers: uniqueSorted(
      evidence.citedByClaimIds
        .map((claimId) => claimNumbersById.get(claimId))
        .filter((claimNumber): claimNumber is number => typeof claimNumber === "number")
    ),
  }));

  const caveatGroups = Array.from(
    report.caveats.reduce((groups, caveat) => {
      const title = getCaveatGroupTitle(caveat.type);
      const items = groups.get(title) ?? [];
      items.push(normalizeCaveatText(caveat.text));
      groups.set(title, items);
      return groups;
    }, new Map<string, string[]>())
  ).map(([title, items]) => ({ title, items }));

  return {
    executiveSummary,
    claims,
    evidenceAppendix,
    caveatGroups,
  };
}
