import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check if ProductCategory table exists already
  const result = await prisma.$queryRaw<any[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'ProductCategory'
    ) as exists
  `;
  const tableExists = result[0]?.exists;

  if (!tableExists) {
    console.log('Creating ProductCategory table...');
    await prisma.$executeRaw`
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
      )
    `;
    console.log('✅ ProductCategory table created');
  } else {
    console.log('ProductCategory table already exists, skipping create.');
  }

  // Seed categories if empty
  const count = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as cnt FROM "ProductCategory"`;
  const categoryCount = parseInt(count[0]?.cnt ?? '0', 10);

  if (categoryCount === 0) {
    console.log('Seeding categories...');
    const categories = [
      { value: 'FULL_FACE',    label: 'Full Face',    group: 'Helmets',           description: 'Complete head & chin protection', sortOrder: 1 },
      { value: 'HALF_FACE',    label: 'Half Face',    group: 'Helmets',           description: 'Open face with chin bar', sortOrder: 2 },
      { value: 'OPEN_FACE',    label: 'Open Face',    group: 'Helmets',           description: 'Three-quarter coverage', sortOrder: 3 },
      { value: 'MODULAR',      label: 'Modular',      group: 'Helmets',           description: 'Flip-up chin bar', sortOrder: 4 },
      { value: 'OFF_ROAD',     label: 'Off Road',     group: 'Helmets',           description: 'Dirt & adventure riding', sortOrder: 5 },
      { value: 'KIDS',         label: 'Kids',          group: 'Helmets',           description: 'Junior helmets', sortOrder: 6 },
      { value: 'LADIES',       label: 'Ladies',       group: 'Helmets',           description: 'Designed for women riders', sortOrder: 7 },
      { value: 'JACKETS',      label: 'Jackets',      group: 'Riding Gear',       description: 'Riding & textile jackets', sortOrder: 10 },
      { value: 'GLOVES',       label: 'Gloves',       group: 'Riding Gear',       description: 'Riding gloves', sortOrder: 11 },
      { value: 'BOOTS',        label: 'Boots',        group: 'Riding Gear',       description: 'Riding boots & shoes', sortOrder: 12 },
      { value: 'RIDING_PANTS', label: 'Riding Pants', group: 'Riding Gear',       description: 'Textile & leather pants', sortOrder: 13 },
      { value: 'ACCESSORIES',  label: 'Accessories',  group: 'Accessories & More',description: 'Gear add-ons & misc', sortOrder: 20 },
      { value: 'PARTS',        label: 'Parts',        group: 'Accessories & More',description: 'Bike parts & components', sortOrder: 21 },
      { value: 'LUGGAGE',      label: 'Luggage',      group: 'Accessories & More',description: 'Bags, panniers & backpacks', sortOrder: 22 },
      { value: 'ELECTRONICS',  label: 'Electronics',  group: 'Accessories & More',description: 'Intercoms, cameras & more', sortOrder: 23 },
    ];
    for (const cat of categories) {
      await prisma.productCategory.upsert({
        where: { value: cat.value },
        update: {},
        create: cat,
      });
    }
    console.log(`✅ Seeded ${categories.length} categories`);
  } else {
    console.log(`Categories already seeded (${categoryCount} found), skipping.`);
  }

  // Convert Product.category from enum to TEXT if it's still an enum type
  const colType = await prisma.$queryRaw<any[]>`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'Product' AND column_name = 'category'
  `;
  const dataType = colType[0]?.data_type;
  console.log(`Product.category column type: ${dataType}`);

  if (dataType === 'USER-DEFINED') {
    console.log('Converting Product.category from enum to TEXT...');
    await prisma.$executeRaw`ALTER TABLE "Product" ALTER COLUMN "category" TYPE TEXT USING "category"::TEXT`;
    console.log('✅ Converted column to TEXT');
    await prisma.$executeRaw`DROP TYPE IF EXISTS "Category"`;
    console.log('✅ Dropped old Category enum');
  } else {
    console.log('Column already TEXT, no conversion needed.');
  }

  console.log('✅ Migration complete!');
}

main()
  .catch((e) => { console.error('Migration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
