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

function getClaimLabel(claimType: string): string {
  if (claimType === "fact") {
    return "Observed hiring signal";
  }

  if (claimType === "inference") {
    return "Cautious interpretation";
  }

  return toLabel(claimType);
}

function getCaveatGroupTitle(type: string): string {
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
      claimLabel: getClaimLabel(claim.claimType),
      confidenceLabel: toLabel(claim.confidence),
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
      items.push(caveat.text);
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
