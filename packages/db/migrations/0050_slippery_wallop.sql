CREATE TABLE "product_slug_history" (
	"slug" varchar(160) PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" varchar(160);--> statement-breakpoint
ALTER TABLE "product_slug_history" ADD CONSTRAINT "product_slug_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_slug_unique" UNIQUE("slug");

-- Slugs are allocated under one transaction-level advisory lock.
-- Historical slugs are reserved permanently for their original product.
CREATE OR REPLACE FUNCTION mossetech_assign_product_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  base_slug text;
  candidate text;
  suffix_number integer := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(558, 1);

  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND OLD.slug IS NOT NULL
  THEN
    NEW.slug := OLD.slug;
    RETURN NEW;
  END IF;

  base_slug := lower(
    regexp_replace(
      regexp_replace(NEW.name, '[^A-Za-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    )
  );

  base_slug := left(base_slug, 100);
  base_slug := regexp_replace(base_slug, '-+$', '');

  IF base_slug = '' THEN
    base_slug := 'product';
  END IF;

  candidate := base_slug;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM product_slug_history
      WHERE slug = candidate
        AND product_id <> NEW.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM products
      WHERE slug = candidate
        AND id <> NEW.id
    );

    suffix_number := suffix_number + 1;
    candidate := left(base_slug, 100) || '-' || suffix_number::text;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER mossetech_product_slug_before_save
BEFORE INSERT OR UPDATE OF name, slug ON products
FOR EACH ROW
EXECUTE FUNCTION mossetech_assign_product_slug();

CREATE OR REPLACE FUNCTION mossetech_reserve_product_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    INSERT INTO product_slug_history (slug, product_id)
    VALUES (NEW.slug, NEW.id)
    ON CONFLICT (slug) DO UPDATE
    SET product_id = EXCLUDED.product_id
    WHERE product_slug_history.product_id = EXCLUDED.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Product slug ownership conflict';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER mossetech_product_slug_after_save
AFTER INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION mossetech_reserve_product_slug();

-- Backfill existing products using the same allocation rules.
UPDATE products
SET name = name
WHERE slug IS NULL;

-- All products must have a canonical name-only slug.
ALTER TABLE products
ALTER COLUMN slug SET NOT NULL;
