CREATE TABLE "report_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_run_id" uuid NOT NULL,
	"analysis_run_id" uuid,
	"version_number" integer NOT NULL,
	"status" text NOT NULL,
	"template_version" text NOT NULL,
	"report_object_key" text NOT NULL,
	"report_sha256" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_run_id_report_runs_id_fk" FOREIGN KEY ("report_run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_versions_run_version_unique" ON "report_versions" USING btree ("report_run_id","version_number");--> statement-breakpoint
CREATE INDEX "report_versions_report_run_idx" ON "report_versions" USING btree ("report_run_id");--> statement-breakpoint
CREATE INDEX "report_versions_status_idx" ON "report_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_versions_published_at_idx" ON "report_versions" USING btree ("published_at");