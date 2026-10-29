CREATE TYPE "public"."credential_type" AS ENUM('batch', 'carton', 'unit');
--> statement-breakpoint
CREATE TYPE "public"."authentication_algorithm" AS ENUM('hmac_sha256', 'ed25519');
--> statement-breakpoint
CREATE TYPE "public"."credential_issuance_status" AS ENUM('issued', 'revoked');
--> statement-breakpoint
CREATE TYPE "public"."signing_key_purpose" AS ENUM('batch', 'carton', 'unit');
--> statement-breakpoint
CREATE TYPE "public"."registry_key_status" AS ENUM('pending', 'active', 'retired', 'revoked');
--> statement-breakpoint
CREATE TYPE "public"."cryptographic_result" AS ENUM('valid', 'invalid', 'malformed', 'unsupported_version', 'unknown_key', 'key_revoked', 'unavailable');
--> statement-breakpoint
CREATE TYPE "public"."registration_result" AS ENUM('registered', 'not_registered', 'mismatch', 'not_checked', 'unavailable');
--> statement-breakpoint
CREATE TYPE "public"."lifecycle_result" AS ENUM('released', 'not_released', 'rejected', 'quarantined', 'recalled', 'expired', 'not_checked', 'unavailable');
--> statement-breakpoint
CREATE TYPE "public"."verification_verdict" AS ENUM('verified_released', 'crypto_invalid', 'malformed_credential', 'unsupported_version', 'unknown_key', 'key_revoked', 'identity_not_registered', 'identity_mismatch', 'unit_not_released', 'unit_rejected', 'unit_quarantined', 'unit_recalled', 'unit_expired', 'suspicious_activity', 'verification_unavailable');
--> statement-breakpoint
CREATE TABLE "signing_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key_identifier" varchar(96) NOT NULL UNIQUE,
  "algorithm" "authentication_algorithm" NOT NULL,
  "purpose" "signing_key_purpose" NOT NULL,
  "key_version" smallint NOT NULL,
  "public_key" bytea,
  "protected_key_reference" text NOT NULL,
  "status" "registry_key_status" DEFAULT 'pending' NOT NULL,
  "activated_at" timestamp with time zone,
  "retired_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "signing_key_version_positive" CHECK ("key_version" > 0),
  CONSTRAINT "signing_key_material_policy" CHECK (("algorithm" = 'hmac_sha256' and "public_key" is null) or ("algorithm" = 'ed25519' and octet_length("public_key") = 32))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signing_key_purpose_version" ON "signing_keys" ("algorithm", "purpose", "key_version");
--> statement-breakpoint
CREATE TABLE "cryptographic_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "credential_version" smallint NOT NULL,
  "credential_type" "credential_type" NOT NULL,
  "manufacturer_id" uuid NOT NULL,
  "product_variant_id" uuid NOT NULL,
  "batch_id" uuid,
  "random_identity" bytea NOT NULL,
  "canonical_payload" bytea NOT NULL,
  "authentication_algorithm" "authentication_algorithm" NOT NULL,
  "authentication_proof" bytea NOT NULL,
  "signing_key_id" uuid NOT NULL,
  "credential_fingerprint" bytea NOT NULL UNIQUE,
  "issuance_status" "credential_issuance_status" DEFAULT 'issued' NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revocation_reason" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crypto_credential_version" CHECK ("credential_version" > 0),
  CONSTRAINT "crypto_random_length" CHECK (octet_length("random_identity") = 16),
  CONSTRAINT "crypto_fingerprint_length" CHECK (octet_length("credential_fingerprint") = 32),
  CONSTRAINT "crypto_proof_length" CHECK (("authentication_algorithm" = 'hmac_sha256' and octet_length("authentication_proof") = 16) or ("authentication_algorithm" = 'ed25519' and octet_length("authentication_proof") = 64)),
  CONSTRAINT "crypto_batch_binding" CHECK (("credential_type" = 'batch' and "batch_id" is null) or ("credential_type" in ('carton','unit') and "batch_id" is not null)),
  CONSTRAINT "crypto_revocation_state" CHECK (("issuance_status" = 'issued' and "revoked_at" is null) or ("issuance_status" = 'revoked' and "revoked_at" is not null and "revocation_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "cryptographic_credentials" ADD CONSTRAINT "cryptographic_credentials_manufacturer_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id");
--> statement-breakpoint
ALTER TABLE "cryptographic_credentials" ADD CONSTRAINT "cryptographic_credentials_product_tenant_fk" FOREIGN KEY ("product_variant_id", "manufacturer_id") REFERENCES "products"("id", "manufacturer_id");
--> statement-breakpoint
ALTER TABLE "cryptographic_credentials" ADD CONSTRAINT "cryptographic_credentials_batch_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("id");
--> statement-breakpoint
ALTER TABLE "cryptographic_credentials" ADD CONSTRAINT "cryptographic_credentials_signing_key_fk" FOREIGN KEY ("signing_key_id") REFERENCES "signing_keys"("id");
--> statement-breakpoint
ALTER TABLE "cryptographic_credentials" ADD CONSTRAINT "cryptographic_credentials_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_credential_random_namespace" ON "cryptographic_credentials" ("manufacturer_id", "credential_type", "random_identity");
--> statement-breakpoint
CREATE INDEX "crypto_credential_subject_scope" ON "cryptographic_credentials" ("manufacturer_id", "product_variant_id", "batch_id");
--> statement-breakpoint
CREATE INDEX "crypto_credential_signing_key" ON "cryptographic_credentials" ("signing_key_id");
--> statement-breakpoint
CREATE TABLE "batch_credential_subjects" (
  "credential_id" uuid PRIMARY KEY NOT NULL REFERENCES "cryptographic_credentials"("id"),
  "batch_id" uuid NOT NULL UNIQUE REFERENCES "batches"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carton_credential_subjects" (
  "credential_id" uuid PRIMARY KEY NOT NULL REFERENCES "cryptographic_credentials"("id"),
  "carton_id" uuid NOT NULL UNIQUE REFERENCES "cartons"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_credential_subjects" (
  "credential_id" uuid PRIMARY KEY NOT NULL REFERENCES "cryptographic_credentials"("id"),
  "unit_id" uuid NOT NULL UNIQUE REFERENCES "units"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "request_id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "batch_id" uuid REFERENCES "batches"("id");
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "credential_type" "credential_type";
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "credential_fingerprint" bytea;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "protocol_version" smallint;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "cryptographic_result" "cryptographic_result" DEFAULT 'unavailable' NOT NULL;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "registration_result" "registration_result" DEFAULT 'not_checked' NOT NULL;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "lifecycle_result" "lifecycle_result" DEFAULT 'not_checked' NOT NULL;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "final_verdict" "verification_verdict" DEFAULT 'verification_unavailable' NOT NULL;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "failure_reason_code" varchar(64);
--> statement-breakpoint
ALTER TABLE "verification_events" ADD COLUMN "risk_score" smallint;
--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_risk_score" CHECK ("risk_score" is null or "risk_score" between 0 and 100);
--> statement-breakpoint
CREATE UNIQUE INDEX "verification_request_id" ON "verification_events" ("request_id");
--> statement-breakpoint
CREATE INDEX "verification_fingerprint_time" ON "verification_events" ("credential_fingerprint", "created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_credential_subject_integrity() RETURNS trigger AS $$
DECLARE
  c cryptographic_credentials%ROWTYPE;
  subject_type credential_type;
  subject_manufacturer uuid;
  subject_product uuid;
  subject_batch uuid;
BEGIN
  SELECT * INTO c FROM cryptographic_credentials WHERE id = NEW.credential_id;
  IF TG_TABLE_NAME = 'batch_credential_subjects' THEN
    subject_type := 'batch';
    SELECT manufacturer_id, product_id, id INTO subject_manufacturer, subject_product, subject_batch FROM batches WHERE id = NEW.batch_id;
    IF c.batch_id IS NOT NULL THEN RAISE EXCEPTION 'batch credential cannot contain a parent batch'; END IF;
  ELSIF TG_TABLE_NAME = 'carton_credential_subjects' THEN
    subject_type := 'carton';
    SELECT manufacturer_id, product_id, batch_id INTO subject_manufacturer, subject_product, subject_batch FROM cartons WHERE id = NEW.carton_id;
    IF c.batch_id IS DISTINCT FROM subject_batch THEN RAISE EXCEPTION 'carton credential batch mismatch'; END IF;
  ELSE
    subject_type := 'unit';
    SELECT manufacturer_id, product_id, batch_id INTO subject_manufacturer, subject_product, subject_batch FROM units WHERE id = NEW.unit_id;
    IF c.batch_id IS DISTINCT FROM subject_batch THEN RAISE EXCEPTION 'unit credential batch mismatch'; END IF;
  END IF;
  IF c.credential_type IS DISTINCT FROM subject_type THEN RAISE EXCEPTION 'credential type does not match subject table'; END IF;
  IF c.manufacturer_id IS DISTINCT FROM subject_manufacturer OR c.product_variant_id IS DISTINCT FROM subject_product THEN
    RAISE EXCEPTION 'credential subject scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER batch_credential_subject_integrity BEFORE INSERT OR UPDATE ON "batch_credential_subjects" FOR EACH ROW EXECUTE FUNCTION enforce_credential_subject_integrity();
--> statement-breakpoint
CREATE TRIGGER carton_credential_subject_integrity BEFORE INSERT OR UPDATE ON "carton_credential_subjects" FOR EACH ROW EXECUTE FUNCTION enforce_credential_subject_integrity();
--> statement-breakpoint
CREATE TRIGGER unit_credential_subject_integrity BEFORE INSERT OR UPDATE ON "unit_credential_subjects" FOR EACH ROW EXECUTE FUNCTION enforce_credential_subject_integrity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_crypto_credential() RETURNS trigger AS $$
BEGIN
  IF NEW.credential_version IS DISTINCT FROM OLD.credential_version
     OR NEW.credential_type IS DISTINCT FROM OLD.credential_type
     OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
     OR NEW.product_variant_id IS DISTINCT FROM OLD.product_variant_id
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.random_identity IS DISTINCT FROM OLD.random_identity
     OR NEW.canonical_payload IS DISTINCT FROM OLD.canonical_payload
     OR NEW.authentication_algorithm IS DISTINCT FROM OLD.authentication_algorithm
     OR NEW.authentication_proof IS DISTINCT FROM OLD.authentication_proof
     OR NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id
     OR NEW.credential_fingerprint IS DISTINCT FROM OLD.credential_fingerprint
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'issued cryptographic credential is immutable';
  END IF;
  IF OLD.issuance_status = 'revoked' AND NEW.issuance_status <> 'revoked' THEN
    RAISE EXCEPTION 'revoked credential cannot be restored';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cryptographic_credentials_immutable BEFORE UPDATE ON "cryptographic_credentials" FOR EACH ROW EXECUTE FUNCTION protect_crypto_credential();
--> statement-breakpoint
CREATE TRIGGER cryptographic_credentials_no_delete BEFORE DELETE ON "cryptographic_credentials" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER batch_credential_subjects_immutable BEFORE UPDATE OR DELETE ON "batch_credential_subjects" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER carton_credential_subjects_immutable BEFORE UPDATE OR DELETE ON "carton_credential_subjects" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER unit_credential_subjects_immutable BEFORE UPDATE OR DELETE ON "unit_credential_subjects" FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
ALTER TABLE "signing_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cryptographic_credentials" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "batch_credential_subjects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "carton_credential_subjects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "unit_credential_subjects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "signing_keys", "cryptographic_credentials", "batch_credential_subjects", "carton_credential_subjects", "unit_credential_subjects" FROM anon, authenticated;
