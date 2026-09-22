CREATE TABLE "archetype_synthesis" (
	"id" serial PRIMARY KEY NOT NULL,
	"archetype_id" text NOT NULL,
	"user_id" text,
	"scope" text NOT NULL,
	"scope_key" text NOT NULL,
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
	CONSTRAINT "archetype_synthesis_source_chk" CHECK ("archetype_synthesis"."source" in ('llm', 'demo-seed')),
	CONSTRAINT "archetype_synthesis_scope_chk" CHECK ("archetype_synthesis"."scope" in ('global', 'local'))
);
--> statement-breakpoint
ALTER TABLE "archetype_synthesis" ADD CONSTRAINT "archetype_synthesis_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "archetype_synthesis_uq" ON "archetype_synthesis" USING btree ("archetype_id","scope_key","window_days","language");--> statement-breakpoint
CREATE INDEX "archetype_synthesis_userId_idx" ON "archetype_synthesis" USING btree ("user_id");