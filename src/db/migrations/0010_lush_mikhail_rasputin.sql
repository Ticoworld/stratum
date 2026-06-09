CREATE INDEX "stratum_briefs_entry_created_idx" ON "stratum_briefs" USING btree ("watchlist_entry_id","created_at" DESC NULLS LAST,"updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);
