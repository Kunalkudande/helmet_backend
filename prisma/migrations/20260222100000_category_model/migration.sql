-- CreateTable: ProductCategory (replaces the Category enum)
CREATE TABLE "ProductCategory" (
    "id"          TEXT NOT NULL,
    "value"       TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "group"       TEXT NOT NULL DEFAULT 'Other',
    "description" TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductCategory_value_key" UNIQUE ("value")
);

-- Seed all existing categories
INSERT INTO "ProductCategory" ("id","value","label","group","description","sortOrder") VALUES
  (gen_random_uuid(), 'FULL_FACE',    'Full Face',    'Helmets',           'Complete head & chin protection',  1),
  (gen_random_uuid(), 'HALF_FACE',    'Half Face',    'Helmets',           'Open face with chin bar',          2),
  (gen_random_uuid(), 'OPEN_FACE',    'Open Face',    'Helmets',           'Three-quarter coverage',           3),
  (gen_random_uuid(), 'MODULAR',      'Modular',      'Helmets',           'Flip-up chin bar',                 4),
  (gen_random_uuid(), 'OFF_ROAD',     'Off Road',     'Helmets',           'Dirt & adventure riding',          5),
  (gen_random_uuid(), 'KIDS',         'Kids',          'Helmets',           'Junior helmets',                   6),
  (gen_random_uuid(), 'LADIES',       'Ladies',       'Helmets',           'Designed for women riders',        7),
  (gen_random_uuid(), 'JACKETS',      'Jackets',      'Riding Gear',       'Riding & textile jackets',         10),
  (gen_random_uuid(), 'GLOVES',       'Gloves',       'Riding Gear',       'Riding gloves',                    11),
  (gen_random_uuid(), 'BOOTS',        'Boots',        'Riding Gear',       'Riding boots & shoes',             12),
  (gen_random_uuid(), 'RIDING_PANTS', 'Riding Pants', 'Riding Gear',       'Textile & leather pants',          13),
  (gen_random_uuid(), 'ACCESSORIES',  'Accessories',  'Accessories & More','Gear add-ons & misc',              20),
  (gen_random_uuid(), 'PARTS',        'Parts',        'Accessories & More','Bike parts & components',          21),
  (gen_random_uuid(), 'LUGGAGE',      'Luggage',      'Accessories & More','Bags, panniers & backpacks',       22),
  (gen_random_uuid(), 'ELECTRONICS',  'Electronics',  'Accessories & More','Intercoms, cameras & more',        23);

-- Convert Product.category from Category enum -> TEXT (preserves existing values as their string names)
ALTER TABLE "Product" ALTER COLUMN "category" TYPE TEXT USING "category"::TEXT;

-- Now safe to drop the old enum
DROP TYPE IF EXISTS "Category";
