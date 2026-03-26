ALTER TABLE "feeds" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "consecutive_errors" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "last_success_at" timestamp with time zone;