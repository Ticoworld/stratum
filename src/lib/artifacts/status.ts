export type PersistedArtifactLike = {
  artifactType: string;
  status: string;
};

export type ReportArtifactStatus =
  | "missing"
  | "queued"
  | "rendering"
  | "available"
  | "failed";

export function describeArtifactStatus(status: ReportArtifactStatus): string {
  if (status === "available") {
    return "Available";
  }

  if (status === "queued" || status === "rendering") {
    return "Preparing";
  }

  if (status === "failed") {
    return "Unavailable";
  }

  return "Pending";
}

export function getReportArtifactStatus(
  artifacts: PersistedArtifactLike[],
  artifactType: string
): ReportArtifactStatus {
  const artifact = artifacts.find((candidate) => candidate.artifactType === artifactType);

  if (!artifact) {
    return "missing";
  }

  if (
    artifact.status === "queued" ||
    artifact.status === "rendering" ||
    artifact.status === "available" ||
    artifact.status === "failed"
  ) {
    return artifact.status;
  }

  return "missing";
}
