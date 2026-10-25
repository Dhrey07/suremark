-- Append-only guards: audit, production and verification records can never be rewritten.
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER production_events_append_only BEFORE UPDATE OR DELETE ON production_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER verification_events_append_only BEFORE UPDATE OR DELETE ON verification_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- Issued identities are permanent: units, credentials and numeric codes can never be deleted.
CREATE TRIGGER units_no_delete BEFORE DELETE ON units
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER credentials_no_delete BEFORE DELETE ON credentials
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER manual_codes_no_delete BEFORE DELETE ON manual_codes
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- Identity bytes and code digests are immutable once issued.
CREATE OR REPLACE FUNCTION reject_identity_change() RETURNS trigger AS $$
BEGIN
  IF NEW.random_identity IS DISTINCT FROM OLD.random_identity
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id THEN
    RAISE EXCEPTION 'unit identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER units_identity_immutable BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION reject_identity_change();
--> statement-breakpoint
CREATE TRIGGER manual_codes_immutable BEFORE UPDATE ON manual_codes
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER credentials_immutable BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
