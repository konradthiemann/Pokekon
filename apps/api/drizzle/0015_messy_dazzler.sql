CREATE TABLE "deck_synthesis" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"window_days" integer NOT NULL,
	"language" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"input_hash" text NOT NULL,
	"facts" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"claims" jsonb NOT NULL,
	"dropped_count" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"model" text,
	"generated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "deck_synthesis_source_chk" CHECK ("deck_synthesis"."source" in ('llm', 'demo-seed'))
);
--> statement-breakpoint
ALTER TABLE "deck_synthesis" ADD CONSTRAINT "deck_synthesis_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_synthesis" ADD CONSTRAINT "deck_synthesis_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deck_synthesis_uq" ON "deck_synthesis" USING btree ("deck_id","window_days","language");--> statement-breakpoint
CREATE INDEX "deck_synthesis_userId_idx" ON "deck_synthesis" USING btree ("user_id");