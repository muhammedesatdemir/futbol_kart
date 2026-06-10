ALTER TABLE "matchmaking_queue" ADD COLUMN "invite_code" text;--> statement-breakpoint
CREATE INDEX "matchmaking_queue_invite_idx" ON "matchmaking_queue" USING btree ("invite_code");