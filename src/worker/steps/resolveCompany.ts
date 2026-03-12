import type { ClaimedReportRun } from "@/lib/reports/claimNextReportRun";
import { resolveCompany } from "@/lib/providers/ats/resolveCompany";

export function resolveReportRunCompany(reportRun: ClaimedReportRun) {
  return resolveCompany(reportRun.requestedCompanyName);
}
