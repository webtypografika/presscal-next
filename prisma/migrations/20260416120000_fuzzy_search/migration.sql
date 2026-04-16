-- Forgiving search: unaccent + pg_trgm + per-row searchKey column maintained by triggers.
-- searchKey = lower(unaccent(...concatenated searchable fields...))
-- Indexed with GIN gin_trgm_ops for ILIKE + % (trigram similarity) + <-> (distance).

-- ───────────────────── Extensions ─────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ───────────────────── COMPANY ─────────────────────
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "searchKey" text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION company_searchkey_fn() RETURNS TRIGGER AS $$
BEGIN
  NEW."searchKey" := lower(unaccent(
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.email, '') || ' ' ||
    coalesce(NEW.phone, '') || ' ' ||
    coalesce(NEW.afm, '') || ' ' ||
    coalesce(NEW."legalName", '')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS company_searchkey_trg ON "Company";
CREATE TRIGGER company_searchkey_trg
BEFORE INSERT OR UPDATE ON "Company"
FOR EACH ROW EXECUTE FUNCTION company_searchkey_fn();

-- Backfill existing rows
UPDATE "Company" SET "searchKey" = lower(unaccent(
  coalesce(name, '') || ' ' ||
  coalesce(email, '') || ' ' ||
  coalesce(phone, '') || ' ' ||
  coalesce(afm, '') || ' ' ||
  coalesce("legalName", '')
));

CREATE INDEX IF NOT EXISTS "Company_searchKey_trgm_idx"
  ON "Company" USING gin ("searchKey" gin_trgm_ops);

-- ───────────────────── CONTACT ─────────────────────
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "searchKey" text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION contact_searchkey_fn() RETURNS TRIGGER AS $$
BEGIN
  NEW."searchKey" := lower(unaccent(
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.email, '') || ' ' ||
    coalesce(NEW.phone, '') || ' ' ||
    coalesce(NEW.mobile, '')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_searchkey_trg ON "Contact";
CREATE TRIGGER contact_searchkey_trg
BEFORE INSERT OR UPDATE ON "Contact"
FOR EACH ROW EXECUTE FUNCTION contact_searchkey_fn();

UPDATE "Contact" SET "searchKey" = lower(unaccent(
  coalesce(name, '') || ' ' ||
  coalesce(email, '') || ' ' ||
  coalesce(phone, '') || ' ' ||
  coalesce(mobile, '')
));

CREATE INDEX IF NOT EXISTS "Contact_searchKey_trgm_idx"
  ON "Contact" USING gin ("searchKey" gin_trgm_ops);

-- ───────────────────── QUOTE ─────────────────────
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "searchKey" text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION quote_searchkey_fn() RETURNS TRIGGER AS $$
BEGIN
  NEW."searchKey" := lower(unaccent(
    coalesce(NEW.number, '') || ' ' ||
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.description, '')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quote_searchkey_trg ON "Quote";
CREATE TRIGGER quote_searchkey_trg
BEFORE INSERT OR UPDATE ON "Quote"
FOR EACH ROW EXECUTE FUNCTION quote_searchkey_fn();

UPDATE "Quote" SET "searchKey" = lower(unaccent(
  coalesce(number, '') || ' ' ||
  coalesce(title, '') || ' ' ||
  coalesce(description, '')
));

CREATE INDEX IF NOT EXISTS "Quote_searchKey_trgm_idx"
  ON "Quote" USING gin ("searchKey" gin_trgm_ops);
