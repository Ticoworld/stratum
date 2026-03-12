import { fetchProviderSnapshotForResolvedCompany } from "@/lib/providers/ats/fetchProviderSnapshot";
import type { ResolvedCompany } from "@/lib/providers/ats/types";

export async function fetchResolvedCompanySnapshot(resolvedCompany: ResolvedCompany) {
  return fetchProviderSnapshotForResolvedCompany(resolvedCompany);
}
