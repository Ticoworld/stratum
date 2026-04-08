ALTER TABLE "stratum_watchlist_entries" ADD COLUMN "schedule_cadence" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "stratum_watchlist_entries" ADD COLUMN "schedule_next_run_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "stratum_watchlist_entries_schedule_next_run_idx" ON "stratum_watchlist_entries" USING btree ("schedule_cadence","schedule_next_run_at");