ALTER TABLE "tournaments" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "swiss_mode" text;--> statement-breakpoint
CREATE INDEX "tournaments_online_bo1_idx" ON "tournaments" USING btree ("is_online","swiss_mode");