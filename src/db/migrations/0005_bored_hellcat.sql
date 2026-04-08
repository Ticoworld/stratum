CREATE TABLE "stratum_notification_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"watchlist_entry_id" uuid NOT NULL,
	"monitoring_event_id" uuid NOT NULL,
	"related_brief_id" uuid,
	"attempt_origin" text NOT NULL,
	"candidate_kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"change_types" jsonb NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stratum_watchlist_entries" ADD COLUMN "schedule_consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stratum_watchlist_entries" ADD COLUMN "schedule_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "stratum_watchlist_entries" ADD COLUMN "schedule_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stratum_notification_candidates" ADD CONSTRAINT "stratum_notification_candidates_watchlist_entry_id_stratum_watchlist_entries_id_fk" FOREIGN KEY ("watchlist_entry_id") REFERENCES "public"."stratum_watchlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stratum_notification_candidates" ADD CONSTRAINT "stratum_notification_candidates_monitoring_event_id_stratum_monitoring_events_id_fk" FOREIGN KEY ("monitoring_event_id") REFERENCES "public"."stratum_monitoring_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stratum_notification_candidates" ADD CONSTRAINT "stratum_notification_candidates_related_brief_id_stratum_briefs_id_fk" FOREIGN KEY ("related_brief_id") REFERENCES "public"."stratum_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stratum_notification_candidates_event_unique" ON "stratum_notification_candidates" USING btree ("monitoring_event_id");--> statement-breakpoint
CREATE INDEX "stratum_notification_candidates_entry_created_idx" ON "stratum_notification_candidates" USING btree ("watchlist_entry_id","created_at");--> statement-breakpoint
CREATE INDEX "stratum_watchlist_entries_schedule_lease_idx" ON "stratum_watchlist_entries" USING btree ("schedule_lease_expires_at");