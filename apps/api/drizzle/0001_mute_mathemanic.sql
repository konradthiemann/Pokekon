CREATE TABLE "deck_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"count" integer NOT NULL,
	"type" text NOT NULL,
	"role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"cards" jsonb NOT NULL,
	"total_cards" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"archetype" text NOT NULL,
	"archetype_name" text NOT NULL,
	"variant" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opponent_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_id" integer,
	"user_id" text NOT NULL,
	"archetype" text NOT NULL,
	"event_type" text NOT NULL,
	"event_date" date NOT NULL,
	"result" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"round" integer,
	"deck_snapshot_id" integer,
	"battle_log" text,
	"analysis" text
);
--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_snapshots" ADD CONSTRAINT "deck_snapshots_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_snapshots" ADD CONSTRAINT "deck_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponent_logs" ADD CONSTRAINT "opponent_logs_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponent_logs" ADD CONSTRAINT "opponent_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponent_logs" ADD CONSTRAINT "opponent_logs_deck_snapshot_id_deck_snapshots_id_fk" FOREIGN KEY ("deck_snapshot_id") REFERENCES "public"."deck_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_cards_deckId_idx" ON "deck_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "deck_cards_userId_idx" ON "deck_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deck_snapshots_deckId_idx" ON "deck_snapshots" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "deck_snapshots_userId_idx" ON "deck_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "decks_userId_idx" ON "decks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "opponent_logs_userId_idx" ON "opponent_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "opponent_logs_deckId_idx" ON "opponent_logs" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "opponent_logs_archetype_eventDate_idx" ON "opponent_logs" USING btree ("archetype","event_date");