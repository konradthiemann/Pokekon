CREATE TABLE "match_log_parsed" (
	"id" serial PRIMARY KEY NOT NULL,
	"opponent_log_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"total_turns" integer NOT NULL,
	"went_first" boolean,
	"turns" jsonb NOT NULL,
	"prize_progression" jsonb NOT NULL,
	"parser_version" integer NOT NULL,
	"setup_clean_by_turn2" boolean NOT NULL,
	"dead_turns" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_log_parsed_opponent_log_id_unique" UNIQUE("opponent_log_id")
);
--> statement-breakpoint
CREATE TABLE "meta_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"archetype" text NOT NULL,
	"frequency_pct" real NOT NULL,
	"win_rate_pct" integer,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"player_count" integer NOT NULL,
	"period" text NOT NULL,
	"source_note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_log_parsed" ADD CONSTRAINT "match_log_parsed_opponent_log_id_opponent_logs_id_fk" FOREIGN KEY ("opponent_log_id") REFERENCES "public"."opponent_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_log_parsed" ADD CONSTRAINT "match_log_parsed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_log_parsed_userId_idx" ON "match_log_parsed" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_period_archetype_uq" ON "meta_snapshots" USING btree ("period","archetype");--> statement-breakpoint
CREATE INDEX "meta_archetype_idx" ON "meta_snapshots" USING btree ("archetype");--> statement-breakpoint
CREATE INDEX "opponent_logs_eventDate_idx" ON "opponent_logs" USING btree ("event_date");