ALTER TABLE "feeds" ADD COLUMN "hub_url" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "hub_secret" text;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "hub_lease_expiry" timestamp with time zone;