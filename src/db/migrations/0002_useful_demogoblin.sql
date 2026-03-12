CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_run_id" uuid NOT NULL,
	"analysis_sequence" integer NOT NULL,
	"status" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model_provider" text NOT NULL,
	"model_name" text NOT NULL,
	"model_version" text NOT NULL,
	"input_object_key" text NOT NULL,
	"input_sha256" text NOT NULL,
	"output_object_key" text,
	"output_sha256" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"normalized_job_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_job_id" text,
	"job_url" text,
	"job_title" text NOT NULL,
	"department" text,
	"location" text,
	"source_posted_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"snapshot_fetched_at" timestamp with time zone NOT NULL,
	"raw_record_path" text NOT NULL,
	"raw_field_paths" jsonb NOT NULL,
	"evidence_sha256" text NOT NULL,
	"citation_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"section" text NOT NULL,
	"claim_type" text NOT NULL,
	"statement" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"confidence" text NOT NULL,
	"support_status" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_report_run_id_report_runs_id_fk" FOREIGN KEY ("report_run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_source_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_normalized_job_id_normalized_jobs_id_fk" FOREIGN KEY ("normalized_job_id") REFERENCES "public"."normalized_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_report_sequence_unique" ON "analysis_runs" USING btree ("report_run_id","analysis_sequence");--> statement-breakpoint
CREATE INDEX "analysis_runs_report_run_idx" ON "analysis_runs" USING btree ("report_run_id");--> statement-breakpoint
CREATE INDEX "analysis_runs_status_idx" ON "analysis_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "citations_claim_order_unique" ON "citations" USING btree ("claim_id","citation_order");--> statement-breakpoint
CREATE INDEX "citations_claim_idx" ON "citations" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "citations_normalized_job_idx" ON "citations" USING btree ("normalized_job_id");--> statement-breakpoint
CREATE INDEX "citations_source_snapshot_idx" ON "citations" USING btree ("source_snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_analysis_display_order_unique" ON "claims" USING btree ("analysis_run_id","display_order");--> statement-breakpoint
CREATE INDEX "claims_analysis_section_display_idx" ON "claims" USING btree ("analysis_run_id","section","display_order");