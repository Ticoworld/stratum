CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_version_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"status" text NOT NULL,
	"object_key" text,
	"mime_type" text,
	"byte_size" bigint,
	"sha256" text,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_report_version_id_report_versions_id_fk" FOREIGN KEY ("report_version_id") REFERENCES "public"."report_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_report_version_type_unique" ON "artifacts" USING btree ("report_version_id","artifact_type");--> statement-breakpoint
CREATE INDEX "artifacts_report_version_idx" ON "artifacts" USING btree ("report_version_id");--> statement-breakpoint
CREATE INDEX "artifacts_status_idx" ON "artifacts" USING btree ("status");