CREATE TYPE "public"."manufacturer_operational_status" AS ENUM('active', 'suspended');--> statement-breakpoint
ALTER TABLE "manufacturers" ADD COLUMN "operational_status" "manufacturer_operational_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "manufacturer_review_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manufacturer_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "action" varchar(40) NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "manufacturer_id" uuid,
  "kind" varchar(48) NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "href" text,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturer_review_events" ADD CONSTRAINT "manufacturer_review_events_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturer_review_events" ADD CONSTRAINT "manufacturer_review_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manufacturer_review_history" ON "manufacturer_review_events" USING btree ("manufacturer_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE TRIGGER manufacturer_review_events_append_only BEFORE UPDATE OR DELETE ON manufacturer_review_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
