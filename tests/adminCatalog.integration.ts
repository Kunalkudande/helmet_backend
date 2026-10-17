import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { prisma } from '../src/config/database';
import productRoutes from '../src/routes/productRoutes';
import { generateAccessToken } from '../src/utils/jwt';

// Mock persistence: these workflow tests must never create products in the connected store.
process.env.JWT_SECRET = 'test-admin-catalog-secret-at-least-32-characters';
const adminId = 'admin-test';
const admin = generateAccessToken({ userId: adminId, email: 'admin@example.test', role: 'ADMIN' });
const customer = generateAccessToken({ userId: 'customer-test', email: 'customer@example.test', role: 'CUSTOMER' });
const token = '11111111-1111-4111-8111-111111111111';
const categories = [{ value: 'PARTS', label: 'Parts' }];
let batch: any;
let writes: any[] = [];
let failCreate = false;
let current: any = null;
const originals: (() => void)[] = [];
function patch(target: any, key: string, value: any) { const old = target[key]; originals.push(() => { target[key] = old; }); target[key] = value; }
const app = express(); app.use(express.json()); app.use('/api/products', productRoutes);
app.use((error: any, _req: any, res: any, _next: any) => { res.status(error.statusCode || 500).json({ success: false, error: error.message }); });
const values = { name: 'Test Coil', brand: 'Test', category: 'PARTS', description: 'A replacement ignition coil for a specific motorcycle.', price: '650', stock: '10' };

async function main() {
  patch(prisma.user, 'findUnique', async () => ({ role: 'ADMIN' }));
  patch(prisma.productCategory, 'findMany', async () => categories);
  patch(prisma.product, 'findMany', async () => current ? [{ ...current, variants: [] }] : []);
  patch(prisma.product, 'findUnique', async () => current);
  patch(prisma.product, 'create', async ({ data }: any) => { if (failCreate && writes.length >= 2) throw new Error('Simulated database failure'); writes.push(data); return { id: 'new-' + writes.length, slug: data.slug }; });
  patch(prisma.product, 'updateMany', async ({ data }: any) => { writes.push(data); return { count: 1 }; });
  patch(prisma.productImportBatch, 'deleteMany', async () => ({ count: 0 }));
  patch(prisma.productImportBatch, 'create', async ({ data }: any) => { batch = { ...data, id: token, result: null }; return batch; });
  patch(prisma.productImportBatch, 'findUnique', async () => batch);
  patch(prisma.productImportBatch, 'update', async ({ data }: any) => { batch = { ...batch, ...data }; return batch; });
  patch(prisma.productSpecification, 'upsert', async () => ({}));
  patch(prisma, '$transaction', async (work: any) => {
    const previousWrites = [...writes], previousBatch = batch && { ...batch };
    const tx = { product: prisma.product, productCategory: prisma.productCategory, productImportBatch: prisma.productImportBatch, productSpecification: prisma.productSpecification, $queryRaw: async () => [{ id: token }] };
    try { return await work(tx); } catch (error) { writes = previousWrites; batch = previousBatch; throw error; }
  });
  for (const [method, path] of [['get', '/admin/low-stock'], ['post', '/admin/import/preview'], ['post', '/admin/import/commit'], ['post', '/admin/source/duplicate']] as const) {
    assert.equal((await request(app)[method]('/api/products' + path)).status, 401);
    assert.equal((await request(app)[method]('/api/products' + path).set('Authorization', 'Bearer ' + customer)).status, 403);
  }
  const preview = await request(app).post('/api/products/admin/import/preview').set('Authorization', 'Bearer ' + admin).send({ rows: [{ row: 2, values }] });
  assert.equal(preview.status, 200); assert.equal(preview.body.data.canImport, true); assert.equal(writes.length, 0);
  const commit = () => request(app).post('/api/products/admin/import/commit').set('Authorization', 'Bearer ' + admin).send({ token });
  assert.equal((await commit()).body.data.created, 1); assert.equal(writes.length, 1);
  assert.equal((await commit()).body.data.created, 1); assert.equal(writes.length, 1, 'Retry must not create another product');
  assert.equal(writes[0].isActive, false);
  batch = { ...batch, result: null, ownerId: 'other-admin' }; assert.equal((await commit()).status, 404);
  batch.ownerId = adminId; batch.expiresAt = new Date(0); assert.equal((await commit()).status, 409);
  await request(app).post('/api/products/admin/import/preview').set('Authorization', 'Bearer ' + admin).send({ rows: [{ row: 2, values }, { row: 3, values: { ...values, name: 'Second Coil' } }] });
  batch.expiresAt = new Date(Date.now() + 60000); failCreate = true; assert.equal((await commit()).status, 500); assert.equal(writes.length, 1); assert.equal(batch.result, null); failCreate = false;

  current = { id: 'existing', sku: 'EXISTING', updatedAt: new Date(), isActive: true, variants: [], name: 'Source Coil', brand: 'Test', category: 'PARTS', description: values.description, price: 650, discountPrice: null, stock: 40, lowStockThreshold: 7, images: [{ imageUrl: 'https://example.test/photo.jpg', displayOrder: 0, isPrimary: true }], specifications: null };
  const updatePreview = await request(app).post('/api/products/admin/import/preview').set('Authorization', 'Bearer ' + admin).send({ rows: [{ row: 2, values: { ...values, sku: 'EXISTING' } }] });
  assert.equal(updatePreview.body.data.updates, 1);
  current.updatedAt = new Date(current.updatedAt.getTime() + 1000);
  assert.equal((await commit()).status, 409, 'Changes since preview must not be overwritten');
  current.variants = [{ size: 'M', color: 'Black', stock: 8, additionalPrice: 20, sku: 'OLD-VARIANT' }];
  const copy = await request(app).post('/api/products/admin/existing/duplicate').set('Authorization', 'Bearer ' + admin);
  assert.equal(copy.status, 201);
  const cloned = writes[writes.length - 1];
  assert.equal(cloned.stock, 0); assert.equal(cloned.isActive, false); assert.notEqual(cloned.sku, current.sku);
  assert.equal(cloned.variants.create[0].stock, 0); assert.notEqual(cloned.variants.create[0].sku, 'OLD-VARIANT');
  assert.equal(cloned.images.create[0].imageUrl, current.images[0].imageUrl);
  assert.equal(cloned.reviews, undefined); assert.equal(cloned.totalReviews, undefined);
  const uploadService = require('../src/services/uploadService');
  let assetDeletes = 0;
  patch(uploadService, 'deleteImage', async () => { assetDeletes++; });
  patch(prisma.productImage, 'findUnique', async () => ({ id: 'shared-image', productId: current.id, isPrimary: false, imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/shared.jpg' }));
  patch(prisma.productImage, 'count', async () => 1);
  patch(prisma.productImage, 'delete', async () => ({}));
  patch(prisma.productImage, 'findMany', async () => []);
  const removedImage = await request(app).delete('/api/products/existing/images/shared-image').set('Authorization', 'Bearer ' + admin);
  assert.equal(removedImage.status, 200); assert.equal(assetDeletes, 0, 'Shared image assets must survive removal from one product');
  console.log('Admin authorization, preview, commit/retry, conflict, rollback, duplication and shared-image checks passed.');
}
main().finally(() => { originals.reverse().forEach(restore => restore()); }).catch(error => { console.error(error); process.exitCode = 1; });
