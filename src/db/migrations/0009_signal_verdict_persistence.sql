ALTER TABLE "stratum_briefs" ADD COLUMN "signal_verdict" text;
--> statement-breakpoint
ALTER TABLE "stratum_briefs" ADD COLUMN "signal_verdict_alert_priority" text;
--> statement-breakpoint
ALTER TABLE "stratum_briefs" ADD COLUMN "signal_verdict_headline" text;
--> statement-breakpoint
ALTER TABLE "stratum_briefs" ADD COLUMN "signal_verdict_reason" text;
--> statement-breakpoint
ALTER TABLE "stratum_notification_candidates" ADD COLUMN "alert_priority" text NOT NULL DEFAULT 'digest';
