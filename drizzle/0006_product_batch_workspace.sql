CREATE TYPE "public"."export_job_status" AS ENUM('queued', 'completed', 'failed', 'expired');
--> statement-breakpoint
CREATE TYPE "public"."export_job_type" AS ENUM('csv', 'unit_labels_pdf', 'carton_labels_pdf', 'batch_summary_pdf');
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "loose_units" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "created_by_name" text DEFAULT 'Unknown user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "created_by_role" text DEFAULT 'Manufacturer user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "last_modified_by" uuid;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "batches" b SET "created_by_name" = u.name, "created_by_role" = COALESCE(u.title, 'Manufacturer user'), "last_modified_by" = b.created_by FROM "users" u WHERE u.id = b.created_by;
--> statement-breakpoint
ALTER TABLE "batches" DROP CONSTRAINT "batch_packaging_snapshot";
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batch_loose_units" CHECK ("batches"."loose_units" >= 0);
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batch_packaging_snapshot" CHECK (("batches"."units_per_carton" is null and "batches"."carton_count" is null and "batches"."loose_units" = 0) or ("batches"."units_per_carton" > 0 and "batches"."carton_count" >= 0 and "batches"."planned_quantity" = ("batches"."units_per_carton" * "batches"."carton_count") + "batches"."loose_units"));
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "batch_reference_tenant" ON "batches" USING btree ("manufacturer_id", "lot");
--> statement-breakpoint
CREATE INDEX "batch_product_created" ON "batches" USING btree ("product_id", "created_at");
--> statement-breakpoint
ALTER TABLE "cartons" ADD COLUMN "printed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cartons" ADD COLUMN "reconciled_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "export_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manufacturer_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "type" "export_job_type" NOT NULL,
  "status" "export_job_status" DEFAULT 'queued' NOT NULL,
  "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "record_count" integer,
  "content_hash" varchar(64),
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "export_jobs_batch_time" ON "export_jobs" USING btree ("batch_id", "created_at");
--> statement-breakpoint
CREATE INDEX "export_jobs_requester_time" ON "export_jobs" USING btree ("requested_by", "created_at");
--> statement-breakpoint
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "export_jobs" FROM anon, authenticated;
