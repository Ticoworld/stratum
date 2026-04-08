ALTER TABLE "stratum_notification_candidates" ALTER COLUMN "status" SET DEFAULT 'unread';--> statement-breakpoint
ALTER TABLE "stratum_notification_candidates" ADD COLUMN "dismissed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "stratum_notification_candidates"
SET "status" = 'unread'
WHERE "status" = 'pending';
