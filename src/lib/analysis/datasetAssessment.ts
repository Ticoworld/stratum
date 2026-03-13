export type EvidenceStrength = "strong" | "moderate" | "limited" | "weak";
export type ExecutiveTone = "standard" | "narrow" | "strictly_narrow";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface AnalysisDatasetAssessment {
  totalJobs: number;
  recentJobCount: number;
  midRecencyJobCount: number;
  staleJobCount: number;
  unknownRecencyJobCount: number;
  latestSnapshotAgeDays: number | null;
  evidenceStrength: EvidenceStrength;
  executiveTone: ExecutiveTone;
  confidenceCap: ConfidenceLevel;
  cautionReasons: string[];
  deterministicCaveats: string[];
}

function roundDownDays(diffMs: number) {
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function assessDataset(params: {
  asOfTime: Date;
  totalJobs: number;
  recencyBuckets: Array<{ bucket: string; count: number }>;
  latestSnapshotFetchedAt: Date | null;
}): AnalysisDatasetAssessment {
  const recentJobCount =
    params.recencyBuckets.find((bucket) => bucket.bucket === "0_30_days")?.count ?? 0;
  const midRecencyJobCount =
    params.recencyBuckets.find((bucket) => bucket.bucket === "31_90_days")?.count ?? 0;
  const staleJobCount =
    params.recencyBuckets.find((bucket) => bucket.bucket === "91_plus_days")?.count ?? 0;
  const unknownRecencyJobCount =
    params.recencyBuckets.find((bucket) => bucket.bucket === "unknown")?.count ?? 0;

  const knownRecencyCount = recentJobCount + midRecencyJobCount + staleJobCount;
  const staleShare = knownRecencyCount > 0 ? staleJobCount / knownRecencyCount : 0;
  const unknownShare = params.totalJobs > 0 ? unknownRecencyJobCount / params.totalJobs : 0;
  const latestSnapshotAgeDays = params.latestSnapshotFetchedAt
    ? roundDownDays(params.asOfTime.getTime() - params.latestSnapshotFetchedAt.getTime())
    : null;

  let evidenceStrength: EvidenceStrength = "strong";

  if (
    params.totalJobs <= 4 ||
    (knownRecencyCount > 0 && staleShare >= 0.75) ||
    (recentJobCount === 0 && midRecencyJobCount === 0 && params.totalJobs <= 12)
  ) {
    evidenceStrength = "weak";
  } else if (
    params.totalJobs <= 10 ||
    staleShare >= 0.5 ||
    unknownShare > 0.5 ||
    (latestSnapshotAgeDays !== null && latestSnapshotAgeDays > 45)
  ) {
    evidenceStrength = "limited";
  } else if (
    params.totalJobs <= 25 ||
    staleShare >= 0.25 ||
    (latestSnapshotAgeDays !== null && latestSnapshotAgeDays > 21)
  ) {
    evidenceStrength = "moderate";
  }

  const cautionReasons: string[] = [];

  if (params.totalJobs <= 4) {
    cautionReasons.push(`Only ${params.totalJobs} roles were captured.`);
  } else if (params.totalJobs <= 10) {
    cautionReasons.push(`Only ${params.totalJobs} roles were captured, which is still a limited sample.`);
  }

  if (knownRecencyCount > 0 && staleShare >= 0.5) {
    cautionReasons.push("Most cited roles were last updated more than 90 days before the capture date.");
  } else if (knownRecencyCount > 0 && staleShare >= 0.25) {
    cautionReasons.push("A meaningful share of the captured roles appears stale.");
  }

  if (unknownShare > 0.5) {
    cautionReasons.push("More than half of the captured roles have unclear posting recency.");
  }

  if (latestSnapshotAgeDays !== null && latestSnapshotAgeDays > 45) {
    cautionReasons.push(`The latest captured snapshot is ${latestSnapshotAgeDays} days old.`);
  }

  const deterministicCaveats =
    evidenceStrength === "weak"
      ? [
          "This report is based on a very small and/or stale captured role set. Read it as a narrow point-in-time signal, not a broad company conclusion.",
          ...cautionReasons,
        ]
      : evidenceStrength === "limited"
        ? [
            "This report is based on limited evidence. Any interpretation should stay close to the captured roles rather than implying a broad hiring strategy.",
            ...cautionReasons,
          ]
        : cautionReasons;

  return {
    totalJobs: params.totalJobs,
    recentJobCount,
    midRecencyJobCount,
    staleJobCount,
    unknownRecencyJobCount,
    latestSnapshotAgeDays,
    evidenceStrength,
    executiveTone:
      evidenceStrength === "weak"
        ? "strictly_narrow"
        : evidenceStrength === "limited"
          ? "narrow"
          : "standard",
    confidenceCap:
      evidenceStrength === "weak"
        ? "low"
        : evidenceStrength === "limited"
          ? "medium"
          : "high",
    cautionReasons,
    deterministicCaveats,
  };
}
