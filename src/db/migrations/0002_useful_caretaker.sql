CREATE TABLE "stratum_watchlist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"requested_query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"latest_brief_id" uuid,
	"latest_matched_company_name" text,
	"latest_result_state" text,
	"latest_watchlist_read_label" text,
	"latest_watchlist_read_confidence" text,
	"latest_ats_source_used" text,
	"latest_brief_created_at" timestamp with time zone,
	"latest_brief_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stratum_watchlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stratum_briefs" ADD COLUMN "watchlist_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "stratum_watchlist_entries" ADD CONSTRAINT "stratum_watchlist_entries_watchlist_id_stratum_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."stratum_watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stratum_watchlist_entries_watchlist_query_unique" ON "stratum_watchlist_entries" USING btree ("watchlist_id","normalized_query");--> statement-breakpoint
CREATE INDEX "stratum_watchlist_entries_watchlist_updated_idx" ON "stratum_watchlist_entries" USING btree ("watchlist_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stratum_watchlists_slug_unique" ON "stratum_watchlists" USING btree ("slug");