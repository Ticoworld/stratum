CREATE TABLE "stratum_monitoring_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"watchlist_entry_id" uuid NOT NULL,
	"requested_query" text NOT NULL,
	"attempt_kind" text NOT NULL,
	"attempt_origin" text NOT NULL,
	"outcome_status" text NOT NULL,
	"related_brief_id" uuid,
	"result_state" text,
	"matched_company_name" text,
	"ats_source_used" text,
	"watchlist_read_label" text,
	"watchlist_read_confidence" text,
	"company_match_confidence" text,
	"source_coverage_completeness" text,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stratum_monitoring_events" ADD CONSTRAINT "stratum_monitoring_events_watchlist_entry_id_stratum_watchlist_entries_id_fk" FOREIGN KEY ("watchlist_entry_id") REFERENCES "public"."stratum_watchlist_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stratum_monitoring_events_entry_created_idx" ON "stratum_monitoring_events" USING btree ("watchlist_entry_id","created_at");