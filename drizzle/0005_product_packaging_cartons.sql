CREATE TYPE "public"."regulatory_validation_status" AS ENUM('not_submitted', 'pending_verification', 'authoritative_verified', 'simulated_match', 'mismatch', 'verification_unavailable', 'rejected', 'expired_inactive');
--> statement-breakpoint
CREATE TYPE "public"."carton_status" AS ENUM('reserved', 'printed', 'released', 'voided', 'recalled');
--> statement-breakpoint
ALTER TABLE "manufacturers" ADD COLUMN "prefix_assigned_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE TABLE "product_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"code" varchar(4) NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_family_tenant" UNIQUE("id","manufacturer_id"),
	CONSTRAINT "product_family_code_format" CHECK ("product_families"."code" ~ '^[A-Z]{2,4}$')
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "family_id" uuid;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text DEFAULT 'Unbranded' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variant" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text DEFAULT 'General' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "packaging_type" text DEFAULT 'Unit' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "net_quantity" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "measurement_unit" varchar(24) DEFAULT 'unit' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "manufacturing_requirements" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shelf_life_days" integer DEFAULT 730 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "regulatory_status" "regulatory_validation_status" DEFAULT 'not_submitted' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "regulatory_source" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "regulatory_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "regulatory_note" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "regulatory_simulated" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "packaging_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"unit_type" text NOT NULL,
	"units_per_carton" integer NOT NULL,
	"cartons_per_pallet" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packaging_tenant" UNIQUE("id","manufacturer_id"),
	CONSTRAINT "packaging_units_per_carton" CHECK ("packaging_versions"."units_per_carton" between 1 and 10000),
	CONSTRAINT "packaging_cartons_per_pallet" CHECK ("packaging_versions"."cartons_per_pallet" is null or "packaging_versions"."cartons_per_pallet" between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "packaging_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "units_per_carton" integer;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "carton_count" integer;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "production_notes" text;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "batch_group_id" uuid;
--> statement-breakpoint
CREATE TABLE "cartons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"carton_index" integer NOT NULL,
	"code" varchar(48) NOT NULL,
	"random_identity" bytea NOT NULL,
	"credential" text NOT NULL,
	"expected_units" integer NOT NULL,
	"status" "carton_status" DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cartons_code_unique" UNIQUE("code"),
	CONSTRAINT "cartons_random_identity_unique" UNIQUE("random_identity"),
	CONSTRAINT "cartons_credential_unique" UNIQUE("credential"),
	CONSTRAINT "carton_expected_units" CHECK ("cartons"."expected_units" > 0),
	CONSTRAINT "carton_random_length" CHECK (octet_length("cartons"."random_identity") = 16)
);
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "carton_id" uuid;
--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "packaging_versions" ADD CONSTRAINT "packaging_versions_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "packaging_versions" ADD CONSTRAINT "packaging_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "packaging_versions" ADD CONSTRAINT "packaging_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_packaging_version_id_packaging_versions_id_fk" FOREIGN KEY ("packaging_version_id") REFERENCES "public"."packaging_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cartons" ADD CONSTRAINT "cartons_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cartons" ADD CONSTRAINT "cartons_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cartons" ADD CONSTRAINT "cartons_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_carton_id_cartons_id_fk" FOREIGN KEY ("carton_id") REFERENCES "public"."cartons"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "product_family_name" ON "product_families" USING btree ("manufacturer_id",lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX "product_family_code" ON "product_families" USING btree ("manufacturer_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "packaging_product_version" ON "packaging_versions" USING btree ("product_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_nafdac_unique" ON "products" USING btree (upper(regexp_replace("nafdac_reg_no", '[^A-Za-z0-9]', '', 'g'))) WHERE "nafdac_reg_no" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "carton_batch_position" ON "cartons" USING btree ("batch_id","carton_index");
--> statement-breakpoint
CREATE INDEX "carton_batch_status" ON "cartons" USING btree ("batch_id","status");
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_net_quantity" CHECK ("products"."net_quantity" > 0);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_shelf_life" CHECK ("products"."shelf_life_days" between 1 and 7300);
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batch_packaging_snapshot" CHECK (("batches"."units_per_carton" is null and "batches"."carton_count" is null) or ("batches"."units_per_carton" > 0 and "batches"."carton_count" > 0 and "batches"."planned_quantity" = "batches"."units_per_carton" * "batches"."carton_count"));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_manufacturer_prefix_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.alias IS DISTINCT FROM OLD.alias THEN RAISE EXCEPTION 'manufacturer prefix is immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER manufacturer_prefix_immutable BEFORE UPDATE ON manufacturers FOR EACH ROW EXECUTE FUNCTION prevent_manufacturer_prefix_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_product_code_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.alias IS DISTINCT FROM OLD.alias THEN RAISE EXCEPTION 'product code is immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_code_immutable BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION prevent_product_code_change();
--> statement-breakpoint
ALTER TABLE "product_families" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "packaging_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cartons" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "product_families", "packaging_versions", "cartons" FROM anon, authenticated;
