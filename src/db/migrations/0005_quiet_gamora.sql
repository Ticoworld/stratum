CREATE TABLE "worker_heartbeats" (
	"worker_name" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"hostname" text,
	"pid" integer,
	"started_at" timestamp with time zone NOT NULL,
	"last_heartbeat_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
