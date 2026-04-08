import { createMonitoringAttemptEvent } from "@/lib/watchlists/monitoringEventRepository";
import { captureNotificationCandidateForMonitoringEvent } from "@/lib/watchlists/notificationCandidates";

export async function recordMonitoringAttempt(
  args: Parameters<typeof createMonitoringAttemptEvent>[0]
) {
  const event = await createMonitoringAttemptEvent(args);

  try {
    await captureNotificationCandidateForMonitoringEvent({
      watchlistEntryId: event.watchlistEntryId,
      monitoringEventId: event.id,
    });
  } catch (error) {
    console.error(
      "[Stratum Monitoring] Failed to capture notification candidate for monitoring event:",
      error
    );
  }

  return event;
}
