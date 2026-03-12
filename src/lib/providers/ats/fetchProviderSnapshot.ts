import { fetchAshbySnapshot } from "@/lib/providers/ats/ashby";
import { fetchGreenhouseSnapshot } from "@/lib/providers/ats/greenhouse";
import { fetchLeverSnapshot } from "@/lib/providers/ats/lever";
import { resolveCompany } from "@/lib/providers/ats/resolveCompany";
import type {
  AtsProvider,
  ProviderFetchResult,
  ProviderSnapshotSelection,
} from "@/lib/providers/ats/types";
import { fetchWorkableSnapshot } from "@/lib/providers/ats/workable";

async function fetchFromProvider(
  provider: AtsProvider,
  providerToken: string
): Promise<ProviderFetchResult> {
  switch (provider) {
    case "GREENHOUSE":
      return fetchGreenhouseSnapshot(providerToken);
    case "LEVER":
      return fetchLeverSnapshot(providerToken);
    case "ASHBY":
      return fetchAshbySnapshot(providerToken);
    case "WORKABLE":
      return fetchWorkableSnapshot(providerToken);
  }
}

export async function fetchProviderSnapshotForResolvedCompany(
  resolvedCompany: ProviderSnapshotSelection["resolvedCompany"]
): Promise<ProviderSnapshotSelection | null> {
  for (const token of resolvedCompany.tokensToTry) {
    for (const provider of resolvedCompany.sourceOrder) {
      const snapshot = await fetchFromProvider(provider, token);

      if (snapshot.kind === "success") {
        return {
          resolvedCompany,
          snapshot: {
            ...snapshot,
            providerToken: token,
          },
        };
      }
    }
  }

  return null;
}

export async function fetchProviderSnapshot(
  companyName: string
): Promise<ProviderSnapshotSelection | null> {
  return fetchProviderSnapshotForResolvedCompany(resolveCompany(companyName));
}
