CREATE TABLE "archetype_card_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"archetype_id" text NOT NULL,
	"card_key" text NOT NULL,
	"card_name" text NOT NULL,
	"card_type" text NOT NULL,
	"window_days" integer NOT NULL,
	"lists_analyzed" integer NOT NULL,
	"lists_with" integer NOT NULL,
	"inclusion_pct" real NOT NULL,
	"avg_count" real NOT NULL,
	"superiority_pct" real,
	"delta_pp" real,
	"low_pct" real,
	"high_pct" real,
	"effective_n" real,
	"mean_percentile_with_pct" real,
	"mean_percentile_without_pct" real,
	"significant" boolean DEFAULT false NOT NULL,
	"tier" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "archetype_card_stats_type_chk" CHECK ("archetype_card_stats"."card_type" in ('pokemon','trainer','energy')),
	CONSTRAINT "archetype_card_stats_tier_chk" CHECK ("archetype_card_stats"."tier" in ('insufficient','confirmed','hiddenGem','popularityParadox','discouraged','neutral'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "archetype_card_stats_uq" ON "archetype_card_stats" USING btree ("archetype_id","card_key","window_days");--> statement-breakpoint
CREATE INDEX "archetype_card_stats_lookup_idx" ON "archetype_card_stats" USING btree ("archetype_id","window_days");