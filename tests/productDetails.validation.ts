import assert from 'node:assert/strict';
import { createProductSchema, updateProductSchema } from '../src/utils/validators';
const base = { name: 'Test product', brand: 'Test', category: 'OIL', description: 'A sufficiently long product description.', price: 100, stock: 0, sku: 'TEST-001' };
const details = [{ label: 'Volume', value: '1L' }, { label: 'Warranty', value: '1 year' }];
assert.deepEqual(createProductSchema.parse({ ...base, specifications: { details } }).specifications?.details, details);
assert.deepEqual(updateProductSchema.parse({ specifications: { details: [] } }).specifications?.details, []);
for (const invalid of [ [{ label: 'Volume', value: '' }], [{ label: '', value: '1L' }], [{ label: 'Volume', value: '1L' }, { label: ' volume ', value: '2L' }], Array.from({ length: 51 }, (_, i) => ({ label: String(i), value: 'test' })) ]) {
  assert.equal(updateProductSchema.safeParse({ specifications: { details: invalid } }).success, false);
}
assert.equal(createProductSchema.safeParse({ ...base, specifications: { weight: '1L', material: 'Synthetic', visorType: '10W-40', ventilation: true, certifications: [], features: [] } }).success, true);
console.log('Extra details validation checks passed.');
