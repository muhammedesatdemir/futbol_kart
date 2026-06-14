CREATE TABLE "match_player" (
	"match_id" text NOT NULL,
	"user_id" text NOT NULL,
	"player_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_player" ADD CONSTRAINT "match_player_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player" ADD CONSTRAINT "match_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_player_match_user_idx" ON "match_player" USING btree ("match_id","user_id");--> statement-breakpoint
CREATE INDEX "match_player_user_idx" ON "match_player" USING btree ("user_id");