interface RawSnapshotObjectKeyParams {
  tenantId: string;
  companyId: string;
  reportRunId: string;
  provider: string;
  sourceSnapshotId: string;
}

export function buildRawSnapshotObjectKey(params: RawSnapshotObjectKeyParams): string {
  const { tenantId, companyId, reportRunId, provider, sourceSnapshotId } = params;
  return `raw/${tenantId}/${companyId}/${reportRunId}/${provider.toLowerCase()}/${sourceSnapshotId}.json.gz`;
}

interface AnalysisObjectKeyParams {
  reportRunId: string;
  analysisRunId: string;
}

export function buildAnalysisInputObjectKey(params: AnalysisObjectKeyParams): string {
  return `analysis-input/${params.reportRunId}/${params.analysisRunId}.json`;
}

export function buildAnalysisOutputObjectKey(params: AnalysisObjectKeyParams): string {
  return `analysis-output/${params.reportRunId}/${params.analysisRunId}.json`;
}

export function buildReportObjectKey(reportVersionId: string): string {
  return `reports/${reportVersionId}/report.json`;
}
