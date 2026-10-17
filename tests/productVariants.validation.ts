import assert from 'node:assert/strict';
import { syncProductVariants } from '../src/utils/productVariants';

async function main() {
  const writes: any[] = [];
  const current = { id: 'existing-variant', productId: 'product', size: 'M', color: 'Black', stock: 2, _count: { orderItems: 3, cartItems: 1 } };
  const tx: any = { productVariant: {
    findMany: async () => [current],
    update: async (data: any) => { writes.push(['update', data]); },
    create: async (data: any) => { writes.push(['create', data]); },
    deleteMany: async (data: any) => { writes.push(['delete', data]); },
  } };
  await syncProductVariants(tx, 'product', 'PARENT-SKU', [{ id: current.id, size: 'M', color: 'Black', stock: 30 }]);
  assert.equal(writes.length, 1); assert.equal(writes[0][0], 'update'); assert.equal(writes[0][1].where.id, current.id); assert.equal(writes[0][1].data.stock, 30);
  await assert.rejects(syncProductVariants(tx, 'product', 'PARENT-SKU', []), /used by an order or cart/);
  await assert.rejects(syncProductVariants(tx, 'product', 'PARENT-SKU', [{ id: 'another-products-variant', size: 'M', color: 'Black', stock: 30 }]), /belongs to another product/);
  writes.length = 0;
  await syncProductVariants(tx, 'product', 'PARENT-SKU', [{ size: 'M', color: 'Black', stock: 4 }]);
  assert.equal(writes[0][0], 'update', 'Older clients must also preserve matching variant IDs');
  console.log('Variant stock edits preserve order/cart references; unsafe removals are blocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
