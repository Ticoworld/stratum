import { AuthorizationError, requireTenantRole } from "@/lib/auth/requireTenantRole";
import { type MemberRole } from "@/lib/auth/roles";
import {
  type LoadedPublishedReportVersion,
  loadPublishedReportVersion,
} from "@/lib/reports/loadPublishedReportVersion";

export interface AuthorizedReportAccess {
  session: Awaited<ReturnType<typeof requireTenantRole>>;
  reportVersion: LoadedPublishedReportVersion;
}

export async function requireReportAccess(
  reportVersionId: string,
  minimumRole: MemberRole = "viewer"
): Promise<AuthorizedReportAccess> {
  const session = await requireTenantRole(minimumRole);
  const reportVersion = await loadPublishedReportVersion({
    reportVersionId,
    tenantId: session.tenantId,
  });

  if (!reportVersion) {
    throw new AuthorizationError("Report not found.");
  }

  return {
    session,
    reportVersion,
  };
}
