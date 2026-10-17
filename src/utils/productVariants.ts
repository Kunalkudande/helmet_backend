import { Prisma, Size } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError } from '../middleware/errorHandler';

export async function syncProductVariants(tx: Prisma.TransactionClient, productId: string, sku: string, rows: { id?: string; size: Size; color: string; stock: number; additionalPrice?: number }[]) {
  const current = await tx.productVariant.findMany({ where: { productId }, include: { _count: { select: { orderItems: true, cartItems: true } } } });
  const retained = new Set<string>();
  const combinations = new Set<string>();
  const planned = rows.map(row => {
    const key = `${row.size}\0${row.color.trim().toLowerCase()}`;
    if (combinations.has(key)) throw new AppError('Each size and colour combination must be unique.', 400);
    combinations.add(key);
    // Match old clients by option values; current clients supply the stable variant ID.
    const previous = row.id ? current.find(variant => variant.id === row.id) : current.find(variant => variant.size === row.size && variant.color === row.color);
    if (row.id && !previous) throw new AppError('An option changed or belongs to another product. Reload the product.', 409);
    if (previous) retained.add(previous.id);
    return { row, previous };
  });
  const removed = current.filter(variant => !retained.has(variant.id));
  if (removed.some(variant => variant._count.orderItems > 0 || variant._count.cartItems > 0)) throw new AppError('An option is used by an order or cart. Set its stock to zero instead of removing it.', 400);
  if (removed.length) await tx.productVariant.deleteMany({ where: { id: { in: removed.map(variant => variant.id) } } });
  for (const { row, previous } of planned) {
    const { id: _id, ...fields } = row;
    if (previous) await tx.productVariant.update({ where: { id: previous.id }, data: fields });
    else await tx.productVariant.create({ data: { ...fields, additionalPrice: fields.additionalPrice || 0, productId, sku: `${sku}-${randomUUID().slice(0, 8)}`.toUpperCase() } });
  }
}
