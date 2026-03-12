export type AtsProvider = "GREENHOUSE" | "LEVER" | "ASHBY" | "WORKABLE";

export interface ResolvedCompany {
  requestedName: string;
  normalizedName: string;
  canonicalName: string;
  primaryToken: string;
  tokensToTry: string[];
  sourceOrder: AtsProvider[];
  matchedAs?: string;
}

export interface ProviderRawJob {
  providerJobId?: string | null;
  providerRequisitionId?: string | null;
  jobUrl?: string | null;
  title: string;
  department?: string | null;
  location?: string | null;
  employmentType?: string | null;
  workplaceType?: string | null;
  postedAt?: string | null;
  updatedAt?: string | null;
  rawRecordPath: string;
}

export interface ProviderFetchSuccess {
  kind: "success";
  provider: AtsProvider;
  providerToken: string;
  requestUrl: string;
  httpStatus: number;
  fetchedAt: string;
  payload: unknown;
  rawJobs: ProviderRawJob[];
}

export interface ProviderFetchNotFound {
  kind: "not_found";
  provider: AtsProvider;
  providerToken: string;
  requestUrl: string;
  httpStatus: number;
  fetchedAt: string;
}

export interface ProviderFetchError {
  kind: "error";
  provider: AtsProvider;
  providerToken: string;
  requestUrl: string;
  httpStatus: number | null;
  fetchedAt: string;
  errorCode: string;
  errorMessage: string;
}

export type ProviderFetchResult =
  | ProviderFetchSuccess
  | ProviderFetchNotFound
  | ProviderFetchError;

export interface ProviderSnapshotSelection {
  resolvedCompany: ResolvedCompany;
  snapshot: ProviderFetchSuccess;
}
