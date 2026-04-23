import { createMonitoringAttemptEvent } from "@/lib/watchlists/monitoringEventRepository";
import { captureNotificationCandidateForMonitoringEvent } from "@/lib/watchlists/notificationCandidates";
import type { TenantScope } from "@/lib/watchlists/tenantScope";

export async function recordMonitoringAttempt(
  args: Omit<Parameters<typeof createMonitoringAttemptEvent>[0], "scope"> & { scope: TenantScope }
) {
  const event = await createMonitoringAttemptEvent(args);

  try {
    await captureNotificationCandidateForMonitoringEvent({
      watchlistEntryId: event.watchlistEntryId,
      monitoringEventId: event.id,
      scope: args.scope,
    });
  } catch (error) {
    console.error(
      "[Stratum Monitoring] Failed to capture notification candidate for monitoring event:",
      error
    );
  }

  return event;
}
