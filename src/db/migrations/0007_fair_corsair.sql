ALTER TABLE "stratum_watchlists" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "stratum_watchlists" ADD CONSTRAINT "stratum_watchlists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "stratum_watchlists_slug_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "stratum_watchlists_tenant_slug_unique" ON "stratum_watchlists" USING btree ("tenant_id","slug");
--> statement-breakpoint
CREATE INDEX "stratum_watchlists_tenant_updated_idx" ON "stratum_watchlists" USING btree ("tenant_id","updated_at");
