ALTER TABLE "feeds" ADD COLUMN "syndicate" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "feeds" ADD COLUMN "ignore_title_changes" boolean DEFAULT false NOT NULL;