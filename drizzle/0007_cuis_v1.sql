CREATE TYPE "public"."signing_key_status" AS ENUM('active', 'verify_only', 'revoked');
--> statement-breakpoint
CREATE TYPE "public"."allocation_status" AS ENUM('queued', 'issuing', 'completed', 'failed');
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "cuis_version" smallint;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "cuis_key_version" smallint;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "cuis_random_identity" bytea;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "cuis_auth_tag" bytea;
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "cuis_credential" text;
--> statement-breakpoint
ALTER TABLE "cartons" ADD COLUMN "cuis_version" smallint;
--> statement-breakpoint
ALTER TABLE "cartons" ADD COLUMN "cuis_key_version" smallint;
--> statement-breakpoint
ALTER TABLE "cartons" ADD COLUMN "cuis_auth_tag" bytea;
--> statement-breakpoint
ALTER TABLE "cartons" ADD COLUMN "cuis_credential" text;
--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "cuis_version" smallint;
--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "cuis_key_version" smallint;
--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "cuis_auth_tag" bytea;
--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "cuis_payload" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "batch_cuis_random_identity" ON "batches" USING btree ("cuis_random_identity");
--> statement-breakpoint
CREATE UNIQUE INDEX "batch_cuis_credential" ON "batches" USING btree ("cuis_credential");
--> statement-breakpoint
CREATE UNIQUE INDEX "carton_cuis_credential" ON "cartons" USING btree ("cuis_credential");
--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_cuis_payload_unique" ON "credentials" USING btree ("cuis_payload");
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batch_cuis_lengths" CHECK (("batches"."cuis_version" is null and "batches"."cuis_key_version" is null and "batches"."cuis_random_identity" is null and "batches"."cuis_auth_tag" is null and "batches"."cuis_credential" is null) or ("batches"."cuis_version" = 1 and "batches"."cuis_key_version" > 0 and octet_length("batches"."cuis_random_identity") = 16 and octet_length("batches"."cuis_auth_tag") = 16 and "batches"."cuis_credential" is not null));
--> statement-breakpoint
ALTER TABLE "cartons" ADD CONSTRAINT "carton_cuis_lengths" CHECK (("cartons"."cuis_version" is null and "cartons"."cuis_key_version" is null and "cartons"."cuis_auth_tag" is null and "cartons"."cuis_credential" is null) or ("cartons"."cuis_version" = 1 and "cartons"."cuis_key_version" > 0 and octet_length("cartons"."cuis_auth_tag") = 16 and "cartons"."cuis_credential" is not null));
--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "unit_cuis_lengths" CHECK (("credentials"."cuis_version" is null and "credentials"."cuis_key_version" is null and "credentials"."cuis_auth_tag" is null and "credentials"."cuis_payload" is null) or ("credentials"."cuis_version" = 1 and "credentials"."cuis_key_version" > 0 and octet_length("credentials"."cuis_auth_tag") = 16 and "credentials"."cuis_payload" is not null));
--> statement-breakpoint
CREATE TABLE "signing_key_metadata" (
  "version" smallint PRIMARY KEY NOT NULL,
  "provider" varchar(32) NOT NULL,
  "status" "signing_key_status" NOT NULL,
  "activated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verify_only_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "identity_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manufacturer_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "approval_request_id" uuid NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "requested_quantity" integer NOT NULL,
  "issued_count" integer DEFAULT 0 NOT NULL,
  "status" "allocation_status" DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "identity_allocation_quantity" CHECK ("requested_quantity" > 0 and "issued_count" >= 0 and "issued_count" <= "requested_quantity")
);
--> statement-breakpoint
ALTER TABLE "identity_allocations" ADD CONSTRAINT "identity_allocations_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "identity_allocations" ADD CONSTRAINT "identity_allocations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "identity_allocations" ADD CONSTRAINT "identity_allocations_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_allocation_batch" ON "identity_allocations" USING btree ("batch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_allocation_approval" ON "identity_allocations" USING btree ("approval_request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_allocation_idempotency" ON "identity_allocations" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "identity_allocation_status" ON "identity_allocations" USING btree ("status", "updated_at");
--> statement-breakpoint
ALTER TABLE "identity_allocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "identity_allocations" FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE "signing_key_metadata" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "signing_key_metadata" FROM anon, authenticated;
--> statement-breakpoint
DROP TRIGGER credentials_immutable ON credentials;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_credential_change() RETURNS trigger AS $$
BEGIN
  IF NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.format_version IS DISTINCT FROM OLD.format_version
     OR NEW.key_version IS DISTINCT FROM OLD.key_version
     OR NEW.signature IS DISTINCT FROM OLD.signature
     OR (OLD.cuis_payload IS NOT NULL AND (
       NEW.cuis_version IS DISTINCT FROM OLD.cuis_version
       OR NEW.cuis_key_version IS DISTINCT FROM OLD.cuis_key_version
       OR NEW.cuis_auth_tag IS DISTINCT FROM OLD.cuis_auth_tag
       OR NEW.cuis_payload IS DISTINCT FROM OLD.cuis_payload
     )) THEN
    RAISE EXCEPTION 'credential is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER credentials_immutable BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION reject_credential_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_batch_cuis_change() RETURNS trigger AS $$
BEGIN
  IF OLD.cuis_credential IS NOT NULL AND (
    NEW.cuis_version IS DISTINCT FROM OLD.cuis_version
    OR NEW.cuis_key_version IS DISTINCT FROM OLD.cuis_key_version
    OR NEW.cuis_random_identity IS DISTINCT FROM OLD.cuis_random_identity
    OR NEW.cuis_auth_tag IS DISTINCT FROM OLD.cuis_auth_tag
    OR NEW.cuis_credential IS DISTINCT FROM OLD.cuis_credential
  ) THEN
    RAISE EXCEPTION 'batch CUIS identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER batches_cuis_immutable BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION reject_batch_cuis_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_carton_identity_change() RETURNS trigger AS $$
BEGIN
  IF NEW.random_identity IS DISTINCT FROM OLD.random_identity
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
     OR NEW.credential IS DISTINCT FROM OLD.credential
     OR (OLD.cuis_credential IS NOT NULL AND (
       NEW.cuis_version IS DISTINCT FROM OLD.cuis_version
       OR NEW.cuis_key_version IS DISTINCT FROM OLD.cuis_key_version
       OR NEW.cuis_auth_tag IS DISTINCT FROM OLD.cuis_auth_tag
       OR NEW.cuis_credential IS DISTINCT FROM OLD.cuis_credential
     )) THEN
    RAISE EXCEPTION 'carton identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cartons_identity_immutable BEFORE UPDATE ON cartons
  FOR EACH ROW EXECUTE FUNCTION reject_carton_identity_change();
--> statement-breakpoint
CREATE TRIGGER cartons_no_delete BEFORE DELETE ON cartons
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
