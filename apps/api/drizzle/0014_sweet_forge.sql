CREATE TABLE "meta_equilibrium_archetypes" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"archetype_id" text NOT NULL,
	"archetype_name" text NOT NULL,
	"share_pct" real NOT NULL,
	"weight_pct" real NOT NULL,
	"equilibrium_payoff_pct" real NOT NULL,
	"paradox_gap_pp" real NOT NULL,
	"in_support" boolean NOT NULL,
	"excluded_certain" boolean NOT NULL,
	"row_coverage_pct" real NOT NULL,
	"exclusion_rate_pct" real NOT NULL,
	"certain_exclusion_rate_pct" real NOT NULL,
	"mean_weight_pct" real NOT NULL,
	"weight_p05_pct" real NOT NULL,
	"weight_p95_pct" real NOT NULL,
	"fitness_pct" real NOT NULL,
	"replicator_growth_pct" real NOT NULL,
	"projected_share_pct" real NOT NULL,
	"week_fitness_pct" real,
	"previous_week_fitness_pct" real,
	"fitness_delta_pp" real,
	"observed_share_delta_pp" real,
	"direction" text NOT NULL,
	CONSTRAINT "meta_equilibrium_direction_chk" CHECK ("meta_equilibrium_archetypes"."direction" in ('rising','falling','stable','unknown'))
);
--> statement-breakpoint
CREATE TABLE "meta_equilibrium_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"window_days" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"archetype_count" integer NOT NULL,
	"value_pct" real NOT NULL,
	"support_size" integer NOT NULL,
	"equalizer_count" integer NOT NULL,
	"imputed_cell_share_pct" real NOT NULL,
	"resamples" integer NOT NULL,
	"seed" integer NOT NULL,
	"failed_resamples" integer NOT NULL,
	"exact_support_rate_pct" real NOT NULL,
	"current_period" text,
	"previous_period" text,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_equilibrium_archetypes" ADD CONSTRAINT "meta_equilibrium_archetypes_run_id_meta_equilibrium_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."meta_equilibrium_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_equilibrium_archetypes_uq" ON "meta_equilibrium_archetypes" USING btree ("run_id","archetype_id");--> statement-breakpoint
CREATE INDEX "meta_equilibrium_archetypes_run_idx" ON "meta_equilibrium_archetypes" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_equilibrium_runs_window_uq" ON "meta_equilibrium_runs" USING btree ("window_days");