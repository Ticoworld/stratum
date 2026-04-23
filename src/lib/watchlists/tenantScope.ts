export type TenantScope =
  | {
      tenantId: string;
    }
  | {
      tenantlessCompatibility: true;
      compatibilityReason?: string;
    };

export function isTenantlessCompatibilityScope(
  scope: TenantScope
): scope is Extract<TenantScope, { tenantlessCompatibility: true }> {
  return "tenantlessCompatibility" in scope;
}

export function resolveTenantId(scope: TenantScope): string | null {
  return isTenantlessCompatibilityScope(scope) ? null : scope.tenantId;
}

export function assertTenantlessCompatibilityAllowed(scope: TenantScope): void {
  if (!isTenantlessCompatibilityScope(scope)) return;

  const allowed =
    process.env.STRATUM_ENABLE_TEST_ROUTES === "1" || process.env.STRATUM_E2E_MODE === "1";

  if (!allowed) {
    throw new Error(
      `Tenantless compatibility is only allowed in test or e2e mode${
        scope.compatibilityReason ? ` (${scope.compatibilityReason})` : ""
      }.`
    );
  }
}
