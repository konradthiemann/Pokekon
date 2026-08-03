CREATE TABLE "matchup_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck1" text NOT NULL,
	"deck2" text NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"ties" integer NOT NULL,
	"total" integer NOT NULL,
	"win_rate" real NOT NULL,
	"imported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"archetype_id" text NOT NULL,
	"archetype_name" text NOT NULL,
	"player_name" text,
	"placing" integer,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"decklist" jsonb
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"players" integer NOT NULL,
	"format" text DEFAULT 'standard' NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_snapshots" ADD COLUMN "archetype_id" text;--> statement-breakpoint
ALTER TABLE "tournament_standings" ADD CONSTRAINT "tournament_standings_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matchup_matrix_decks_idx" ON "matchup_matrix" USING btree ("deck1","deck2");--> statement-breakpoint
CREATE INDEX "matchup_matrix_importedAt_idx" ON "matchup_matrix" USING btree ("imported_at");--> statement-breakpoint
CREATE INDEX "tournament_standings_tournamentId_idx" ON "tournament_standings" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_standings_archetypeId_idx" ON "tournament_standings" USING btree ("archetype_id");--> statement-breakpoint
CREATE INDEX "tournaments_date_idx" ON "tournaments" USING btree ("date");