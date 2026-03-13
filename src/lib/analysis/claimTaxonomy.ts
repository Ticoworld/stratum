export const ALLOWED_CLAIM_FAMILIES = [
  "hiring_focus",
  "geography_distribution",
  "department_mix",
  "seniority_mix",
  "posting_age",
  "explicit_role_theme",
  "provider_coverage",
  "dataset_limit",
] as const;

export type ClaimFamily = (typeof ALLOWED_CLAIM_FAMILIES)[number];

export const ALLOWED_CLAIM_LABELS = [
  "Observed hiring signal",
  "Cautious interpretation",
] as const;

export type ClaimLabel = (typeof ALLOWED_CLAIM_LABELS)[number];

const CLAIM_SECTIONS: Record<ClaimFamily, string> = {
  hiring_focus: "Hiring Focus",
  geography_distribution: "Geographic Distribution",
  department_mix: "Department Mix",
  seniority_mix: "Seniority Mix",
  posting_age: "Posting Age",
  explicit_role_theme: "Explicit Role Themes",
  provider_coverage: "Provider Coverage",
  dataset_limit: "Dataset Limits",
};

const STATEMENT_PREFIXES: Record<ClaimFamily, readonly string[]> = {
  hiring_focus: [
    "Hiring is concentrated in ",
    "Hiring activity is concentrated in ",
    "The largest share of hiring activity is in ",
  ],
  geography_distribution: [
    "Open roles are concentrated in ",
    "Open roles are distributed across ",
    "Open roles in ",
  ],
  department_mix: [
    "Department mix is led by ",
    "Department mix is concentrated in ",
    "Captured department mix is led by ",
  ],
  seniority_mix: [
    "Seniority mix is weighted toward ",
    "The captured seniority mix is weighted toward ",
    "Seniority signals are concentrated in ",
  ],
  posting_age: [
    "A share of roles were posted more than ",
    "Approximately ",
    "A meaningful share of roles were last updated more than ",
  ],
  explicit_role_theme: [
    "Repeated role themes include ",
    "Repeated role titles include ",
    "Role titles repeatedly mention ",
    "Explicit role themes include ",
  ],
  provider_coverage: [
    "Provider coverage includes ",
    "Captured provider coverage includes ",
    "Only ",
  ],
  dataset_limit: [
    "This snapshot is limited by ",
    "This report is limited by ",
    "The captured role set is limited by ",
  ],
};

function getObservedWhyTemplate(claimFamily: ClaimFamily) {
  switch (claimFamily) {
    case "hiring_focus":
      return "This shows where the current hiring snapshot is most concentrated.";
    case "geography_distribution":
      return "This shows which locations are most represented in the current hiring snapshot.";
    case "department_mix":
      return "This shows how the captured roles are distributed across departments.";
    case "seniority_mix":
      return "This shows which seniority levels are most visible in the captured roles.";
    case "posting_age":
      return "This shows how much of the captured role set may be older than the snapshot date.";
    case "explicit_role_theme":
      return "This shows repeated themes that are explicitly named in the captured role titles.";
    case "provider_coverage":
      return "This shows which provider snapshots contributed evidence to this report.";
    case "dataset_limit":
      return "This sets the boundary for how broadly the hiring snapshot should be read.";
  }
}

function getCautiousWhyTemplate(claimFamily: ClaimFamily) {
  switch (claimFamily) {
    case "hiring_focus":
      return "This may indicate where current hiring attention is most visible within the captured roles.";
    case "geography_distribution":
      return "This may indicate where current hiring activity is visible within the captured locations.";
    case "department_mix":
      return "This may indicate which departments are most visible in the current hiring snapshot.";
    case "seniority_mix":
      return "This may indicate which seniority levels are receiving more visible hiring attention in the snapshot.";
    case "posting_age":
      return "This may indicate that part of the captured role set is older than the snapshot date and should be read cautiously.";
    case "explicit_role_theme":
      return "This may indicate repeated functional themes in the captured role titles.";
    case "provider_coverage":
      return "This may indicate where the current report has stronger or weaker provider coverage.";
    case "dataset_limit":
      return "This should narrow how broadly the current hiring snapshot is interpreted.";
  }
}

export function getClaimSection(claimFamily: ClaimFamily) {
  return CLAIM_SECTIONS[claimFamily];
}

export function getAllowedStatementPrefixes(claimFamily: ClaimFamily) {
  return STATEMENT_PREFIXES[claimFamily];
}

export function buildCanonicalWhyItMatters(claimFamily: ClaimFamily, label: ClaimLabel) {
  return label === "Observed hiring signal"
    ? getObservedWhyTemplate(claimFamily)
    : getCautiousWhyTemplate(claimFamily);
}

export function supportsClaimLabel(claimFamily: ClaimFamily, label: ClaimLabel) {
  if (claimFamily === "dataset_limit" || claimFamily === "posting_age") {
    return true;
  }

  return label === "Observed hiring signal" || label === "Cautious interpretation";
}

export function matchesClaimFamilyTemplate(claimFamily: ClaimFamily, statement: string) {
  const trimmed = statement.trim();
  return getAllowedStatementPrefixes(claimFamily).some((prefix) => trimmed.startsWith(prefix));
}

export function buildExecutiveSummaryLine(statement: string) {
  return statement.trim();
}
