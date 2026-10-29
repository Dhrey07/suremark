CREATE OR REPLACE FUNCTION protect_signing_key_registry() RETURNS trigger AS $$
BEGIN
  IF NEW.key_identifier IS DISTINCT FROM OLD.key_identifier
     OR NEW.algorithm IS DISTINCT FROM OLD.algorithm
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.key_version IS DISTINCT FROM OLD.key_version
     OR NEW.public_key IS DISTINCT FROM OLD.public_key
     OR NEW.protected_key_reference IS DISTINCT FROM OLD.protected_key_reference
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'signing-key identity metadata is immutable';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('active','revoked')) OR
    (OLD.status = 'active' AND NEW.status IN ('retired','revoked')) OR
    (OLD.status = 'retired' AND NEW.status = 'revoked')
  ) THEN RAISE EXCEPTION 'invalid signing-key lifecycle transition: % -> %', OLD.status, NEW.status; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER signing_keys_lifecycle_guard BEFORE UPDATE ON signing_keys FOR EACH ROW EXECUTE FUNCTION protect_signing_key_registry();
--> statement-breakpoint
CREATE TRIGGER signing_keys_no_delete BEFORE DELETE ON signing_keys FOR EACH ROW EXECUTE FUNCTION reject_mutation();
