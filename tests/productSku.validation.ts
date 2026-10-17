import assert from 'node:assert/strict';
import { createProductSchema, updateProductSchema } from '../src/utils/validators';
import { resolveProductSku } from '../src/utils/productSku';
const base = { name: 'Test Helmet', brand: 'Test', category: 'FULL_FACE', description: 'A sufficiently long product description.', price: 100, stock: 0 };
for (const sku of [undefined, '', '   ']) {
  const parsed = createProductSchema.parse({ ...base, sku });
  assert.equal(parsed.sku, undefined);
  assert.match(resolveProductSku(parsed.sku, parsed.name, parsed.brand), /^BB-TEST-TEST-HELMET-[A-F0-9]{12}$/);
}
assert.equal(resolveProductSku(' MY-001 ', base.name, base.brand), 'MY-001');
assert.notEqual(resolveProductSku(undefined, base.name, base.brand), resolveProductSku(undefined, base.name, base.brand));
assert.equal(createProductSchema.safeParse({ ...base, sku: 'x' }).success, false);
assert.equal(updateProductSchema.safeParse({ sku: ' ' }).success, false);
assert.equal(updateProductSchema.safeParse({ name: 'Updated name' }).success, true);
console.log('Automatic SKU validation checks passed.');
