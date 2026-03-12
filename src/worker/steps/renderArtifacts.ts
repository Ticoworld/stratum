import { renderPublishedReportArtifacts } from "@/lib/artifacts/ensureReportArtifact";

export async function renderArtifacts(reportVersionId: string) {
  return renderPublishedReportArtifacts(reportVersionId);
}
