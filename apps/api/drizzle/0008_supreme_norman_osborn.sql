CREATE TABLE "tournament_matchups" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"deck_a" text NOT NULL,
	"deck_b" text NOT NULL,
	"a_wins" integer DEFAULT 0 NOT NULL,
	"b_wins" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_snapshots" ADD COLUMN "icons" jsonb;--> statement-breakpoint
ALTER TABLE "tournament_standings" ADD COLUMN "icons" jsonb;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "pairings_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_matchups" ADD CONSTRAINT "tournament_matchups_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_matchups_tournamentId_idx" ON "tournament_matchups" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_matchups_decks_idx" ON "tournament_matchups" USING btree ("deck_a","deck_b");