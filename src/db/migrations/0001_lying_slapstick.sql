CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"canonical_name" text NOT NULL,
	"website_domain" text,
	"resolution_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_provider_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_token" text NOT NULL,
	"status" text NOT NULL,
	"resolution_source" text NOT NULL,
	"confidence" numeric(5, 2) NOT NULL,
	"verified_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_run_id" uuid NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_job_id" text,
	"provider_requisition_id" text,
	"job_url" text,
	"title" text NOT NULL,
	"department" text,
	"location" text,
	"employment_type" text,
	"workplace_type" text,
	"posted_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"raw_record_path" text NOT NULL,
	"normalized_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"trigger_type" text NOT NULL,
	"requested_company_name" text NOT NULL,
	"as_of_time" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"lock_token" uuid,
	"locked_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_run_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_token" text NOT NULL,
	"request_url" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"fetched_at" timestamp with time zone,
	"payload_object_key" text,
	"payload_sha256" text,
	"record_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_provider_accounts" ADD CONSTRAINT "company_provider_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_jobs" ADD CONSTRAINT "normalized_jobs_report_run_id_report_runs_id_fk" FOREIGN KEY ("report_run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_jobs" ADD CONSTRAINT "normalized_jobs_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_report_run_id_report_runs_id_fk" FOREIGN KEY ("report_run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_tenant_canonical_name_unique" ON "companies" USING btree ("tenant_id","canonical_name");--> statement-breakpoint
CREATE INDEX "companies_tenant_display_name_idx" ON "companies" USING btree ("tenant_id","display_name");--> statement-breakpoint
CREATE INDEX "companies_tenant_updated_at_idx" ON "companies" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_provider_accounts_company_provider_token_unique" ON "company_provider_accounts" USING btree ("company_id","provider","provider_token");--> statement-breakpoint
CREATE INDEX "company_provider_accounts_company_provider_idx" ON "company_provider_accounts" USING btree ("company_id","provider");--> statement-breakpoint
CREATE INDEX "company_provider_accounts_provider_token_idx" ON "company_provider_accounts" USING btree ("provider","provider_token");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_jobs_snapshot_sha_unique" ON "normalized_jobs" USING btree ("source_snapshot_id","normalized_sha256");--> statement-breakpoint
CREATE INDEX "normalized_jobs_report_run_idx" ON "normalized_jobs" USING btree ("report_run_id");--> statement-breakpoint
CREATE INDEX "normalized_jobs_source_snapshot_idx" ON "normalized_jobs" USING btree ("source_snapshot_id");--> statement-breakpoint
CREATE INDEX "normalized_jobs_provider_job_id_idx" ON "normalized_jobs" USING btree ("provider","provider_job_id");--> statement-breakpoint
CREATE INDEX "report_runs_status_created_at_idx" ON "report_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "report_runs_company_created_at_idx" ON "report_runs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "report_runs_tenant_created_at_idx" ON "report_runs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_snapshots_report_provider_token_unique" ON "source_snapshots" USING btree ("report_run_id","provider","provider_token");--> statement-breakpoint
CREATE INDEX "source_snapshots_report_run_idx" ON "source_snapshots" USING btree ("report_run_id");--> statement-breakpoint
CREATE INDEX "source_snapshots_company_fetched_at_idx" ON "source_snapshots" USING btree ("company_id","fetched_at");--> statement-breakpoint
CREATE INDEX "source_snapshots_status_idx" ON "source_snapshots" USING btree ("status");