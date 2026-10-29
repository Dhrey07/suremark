CREATE OR REPLACE FUNCTION enforce_carton_scope() RETURNS trigger AS $$
DECLARE b batches%ROWTYPE;
BEGIN
  SELECT * INTO b FROM batches WHERE id = NEW.batch_id;
  IF NOT FOUND OR b.manufacturer_id IS DISTINCT FROM NEW.manufacturer_id OR b.product_id IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'carton manufacturer/product/batch scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cartons_scope_integrity BEFORE INSERT OR UPDATE OF manufacturer_id, product_id, batch_id ON cartons FOR EACH ROW EXECUTE FUNCTION enforce_carton_scope();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_unit_scope() RETURNS trigger AS $$
DECLARE b batches%ROWTYPE; c cartons%ROWTYPE;
BEGIN
  SELECT * INTO b FROM batches WHERE id = NEW.batch_id;
  IF NOT FOUND OR b.manufacturer_id IS DISTINCT FROM NEW.manufacturer_id OR b.product_id IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'unit manufacturer/product/batch scope mismatch';
  END IF;
  IF NEW.carton_id IS NOT NULL THEN
    SELECT * INTO c FROM cartons WHERE id = NEW.carton_id;
    IF NOT FOUND OR c.batch_id IS DISTINCT FROM NEW.batch_id OR c.manufacturer_id IS DISTINCT FROM NEW.manufacturer_id OR c.product_id IS DISTINCT FROM NEW.product_id THEN
      RAISE EXCEPTION 'unit carton belongs to a different identity scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER units_scope_integrity BEFORE INSERT OR UPDATE OF manufacturer_id, product_id, batch_id, carton_id ON units FOR EACH ROW EXECUTE FUNCTION enforce_unit_scope();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_batch_identity_immutability() RETURNS trigger AS $$
BEGIN
  IF OLD.cuis_credential IS NOT NULL AND (NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id OR NEW.product_id IS DISTINCT FROM OLD.product_id) THEN
    RAISE EXCEPTION 'issued batch manufacturer and product are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER batches_identity_scope_immutable BEFORE UPDATE OF manufacturer_id, product_id ON batches FOR EACH ROW EXECUTE FUNCTION enforce_batch_identity_immutability();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_unit_state_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.state = 'RESERVED' AND NEW.state IN ('PRINTED_PENDING','REJECTED','VOIDED')) OR
    (OLD.state = 'PRINTED_PENDING' AND NEW.state IN ('QA_PENDING','REJECTED')) OR
    (OLD.state = 'QA_PENDING' AND NEW.state IN ('ACTIVE','REJECTED')) OR
    (OLD.state = 'ACTIVE' AND NEW.state = 'RECALLED')
  ) THEN RAISE EXCEPTION 'invalid unit lifecycle transition: % -> %', OLD.state, NEW.state; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER units_lifecycle_guard BEFORE UPDATE OF state ON units FOR EACH ROW EXECUTE FUNCTION enforce_unit_state_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_batch_state_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status = 'allocation_pending') OR
    (OLD.status = 'allocation_pending' AND NEW.status IN ('draft','allocated')) OR
    (OLD.status = 'allocated' AND NEW.status = 'reconciled') OR
    (OLD.status = 'reconciled' AND NEW.status = 'released') OR
    (OLD.status = 'released' AND NEW.status = 'recalled')
  ) THEN RAISE EXCEPTION 'invalid batch lifecycle transition: % -> %', OLD.status, NEW.status; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER batches_lifecycle_guard BEFORE UPDATE OF status ON batches FOR EACH ROW EXECUTE FUNCTION enforce_batch_state_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_carton_state_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'reserved' AND NEW.status IN ('printed','voided','recalled')) OR
    (OLD.status = 'printed' AND NEW.status IN ('released','voided','recalled')) OR
    (OLD.status = 'released' AND NEW.status = 'recalled')
  ) THEN RAISE EXCEPTION 'invalid carton lifecycle transition: % -> %', OLD.status, NEW.status; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cartons_lifecycle_guard BEFORE UPDATE OF status ON cartons FOR EACH ROW EXECUTE FUNCTION enforce_carton_state_transition();
