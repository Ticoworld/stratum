/**
 * Phase 2 capture smoke test.
 *
 * Run:
 *   npx tsx scripts/test-new-boards.ts <company-name> <tenant-id> [requested-by-user-id]
 */

import { captureCompanySnapshot } from "../src/lib/capture/captureCompanySnapshot";

async function main() {
  const [, , companyName, tenantId, requestedByUserId] = process.argv;

  if (!companyName || !tenantId) {
    throw new Error(
      "Usage: npx tsx scripts/test-new-boards.ts <company-name> <tenant-id> [requested-by-user-id]"
    );
  }

  const result = await captureCompanySnapshot({
    companyName,
    tenantId,
    requestedByUserId,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
