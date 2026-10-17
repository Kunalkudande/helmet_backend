import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export function inventoryStatus<T extends { stock: number; lowStockThreshold: number; variants?: { stock: number; size: string; color: string }[] }>(product: T) {
  const variants = product.variants || [];
  const inventoryStock = variants.length ? variants.reduce((total, variant) => total + variant.stock, 0) : product.stock;
  const lowStockVariants = variants.filter(variant => variant.stock <= product.lowStockThreshold);
  return { ...product, inventoryStock, lowStockVariants, inventoryStatus: inventoryStock === 0 ? 'out' : (variants.length ? lowStockVariants.length > 0 : product.stock <= product.lowStockThreshold) ? 'low' : 'ok' };
}

export async function lowStockPage(page = 1, limit = 15, search = '') {
  // Compare each variant against its own product's threshold, rather than a fixed stock number.
  const filter = Prisma.sql`p."isActive" = true AND (
    (NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) AND p.stock <= p."lowStockThreshold")
    OR EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND v.stock <= p."lowStockThreshold")
  ) ${search ? Prisma.sql`AND (p.name ILIKE ${'%' + search + '%'} OR p.sku ILIKE ${'%' + search + '%'})` : Prisma.empty}`;
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id FROM "Product" p WHERE ${filter} ORDER BY p.name, p.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
    prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "Product" p WHERE ${filter}`),
  ]);
  const products = await prisma.product.findMany({ where: { id: { in: rows.map(row => row.id) } }, include: { images: { orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] }, variants: { orderBy: { id: 'asc' } } } });
  const positions = new Map(rows.map((row, index) => [row.id, index]));
  products.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
  const total = Number(counts[0]?.total || 0);
  return { items: products.map(inventoryStatus), total, page, limit, totalPages: Math.ceil(total / limit), hasPrev: page > 1, hasNext: page * limit < total };
}
