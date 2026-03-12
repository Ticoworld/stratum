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
