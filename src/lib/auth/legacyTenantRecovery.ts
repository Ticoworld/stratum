import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants } from "@/db/schema/tenants";
import { stratumBriefs } from "@/db/schema/stratumBriefs";
import { stratumMonitoringEvents } from "@/db/schema/stratumMonitoringEvents";
import { stratumNotificationCandidates } from "@/db/schema/stratumNotificationCandidates";
import {
  stratumWatchlistEntries,
  stratumWatchlists,
} from "@/db/schema/stratumWatchlists";

export interface LegacyTenantRecoveryResult {
  adoptedWatchlists: number;
  linkedBriefs: number;
  remainingTenantlessWatchlists: number;
  remainingOrphanBriefs: number;
}

function addBriefCandidateLink(
  links: Map<string, Set<string>>,
  briefId: string | null | undefined,
  watchlistEntryId: string | null | undefined
) {
  if (!briefId || !watchlistEntryId) return;
  if (!links.has(briefId)) {
    links.set(briefId, new Set<string>());
  }

  links.get(briefId)!.add(watchlistEntryId);
}

export async function recoverLegacyTenantDataForTenant(
  tenantId: string
): Promise<LegacyTenantRecoveryResult> {
  return db.transaction(async (tx) => {
    const tenantRows = await tx.select({ id: tenants.id }).from(tenants);
    const isSoleTenant = tenantRows.length === 1 && tenantRows[0]?.id === tenantId;

    let adoptedWatchlists = 0;
    if (isSoleTenant) {
      const tenantlessWatchlists = await tx
        .select({ id: stratumWatchlists.id })
        .from(stratumWatchlists)
        .where(isNull(stratumWatchlists.tenantId));

      adoptedWatchlists = tenantlessWatchlists.length;
      if (adoptedWatchlists > 0) {
        await tx
          .update(stratumWatchlists)
          .set({ tenantId })
          .where(isNull(stratumWatchlists.tenantId));
      }
    }

    const orphanBriefRows = await tx
      .select({ id: stratumBriefs.id })
      .from(stratumBriefs)
      .where(isNull(stratumBriefs.watchlistEntryId));
    const orphanBriefIds = new Set(orphanBriefRows.map((row) => row.id));
    let linkedBriefs = 0;

    if (orphanBriefIds.size > 0) {
      const candidateLinks = new Map<string, Set<string>>();

      const latestEntryLinks = await tx
        .select({
          briefId: stratumWatchlistEntries.latestBriefId,
          watchlistEntryId: stratumWatchlistEntries.id,
        })
        .from(stratumWatchlistEntries)
        .where(isNotNull(stratumWatchlistEntries.latestBriefId));

      for (const row of latestEntryLinks) {
        if (!row.briefId || !orphanBriefIds.has(row.briefId)) continue;
        addBriefCandidateLink(candidateLinks, row.briefId, row.watchlistEntryId);
      }

      const monitoringLinks = await tx
        .select({
          briefId: stratumMonitoringEvents.relatedBriefId,
          watchlistEntryId: stratumMonitoringEvents.watchlistEntryId,
        })
        .from(stratumMonitoringEvents)
        .where(isNotNull(stratumMonitoringEvents.relatedBriefId));

      for (const row of monitoringLinks) {
        if (!row.briefId || !orphanBriefIds.has(row.briefId)) continue;
        addBriefCandidateLink(candidateLinks, row.briefId, row.watchlistEntryId);
      }

      const notificationLinks = await tx
        .select({
          briefId: stratumNotificationCandidates.relatedBriefId,
          watchlistEntryId: stratumNotificationCandidates.watchlistEntryId,
        })
        .from(stratumNotificationCandidates)
        .where(isNotNull(stratumNotificationCandidates.relatedBriefId));

      for (const row of notificationLinks) {
        if (!row.briefId || !orphanBriefIds.has(row.briefId)) continue;
        addBriefCandidateLink(candidateLinks, row.briefId, row.watchlistEntryId);
      }

      for (const orphanBriefId of orphanBriefIds) {
        const watchlistEntryIds = candidateLinks.get(orphanBriefId);
        if (!watchlistEntryIds || watchlistEntryIds.size !== 1) continue;

        const [watchlistEntryId] = [...watchlistEntryIds];
        await tx
          .update(stratumBriefs)
          .set({ watchlistEntryId })
          .where(
            and(
              eq(stratumBriefs.id, orphanBriefId),
              isNull(stratumBriefs.watchlistEntryId)
            )
          );
        linkedBriefs += 1;
      }
    }

    const remainingTenantlessWatchlists = await tx
      .select({ id: stratumWatchlists.id })
      .from(stratumWatchlists)
      .where(isNull(stratumWatchlists.tenantId));
    const remainingOrphanBriefs = await tx
      .select({ id: stratumBriefs.id })
      .from(stratumBriefs)
      .where(isNull(stratumBriefs.watchlistEntryId));

    return {
      adoptedWatchlists,
      linkedBriefs,
      remainingTenantlessWatchlists: remainingTenantlessWatchlists.length,
      remainingOrphanBriefs: remainingOrphanBriefs.length,
    };
  });
}
