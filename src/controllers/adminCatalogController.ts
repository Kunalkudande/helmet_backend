import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { importRequestSchema, planProductImport, type ImportPlan } from '../utils/productImport';
import { resolveProductSku } from '../utils/productSku';
import { lowStockPage } from '../utils/inventory';
import { deleteCachePattern } from '../services/cacheService';

const newSlug = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'product'}-${randomUUID().slice(0, 8)}`;

export async function previewProductImport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { rows } = importRequestSchema.parse(req.body);
    const skus = rows.map(row => row.values.sku?.trim()).filter(Boolean);
    const [categories, existing] = await Promise.all([
      prisma.productCategory.findMany({ where: { isActive: true }, select: { value: true, label: true } }),
      prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, updatedAt: true, isActive: true, discountPrice: true, lowStockThreshold: true, variants: { select: { id: true } } } }),
    ]);
    const preview = planProductImport(rows, categories, existing);
    let token: string | undefined;
    if (preview.valid) {
      await prisma.productImportBatch.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400000) } } });
      const batch = await prisma.productImportBatch.create({ data: { ownerId: req.user!.userId, payload: JSON.parse(JSON.stringify(preview.plans)) as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 3600000) } });
      token = batch.id;
    }
    res.json({ success: true, data: { rows: preview.rows, canImport: preview.valid, token, creates: preview.plans.filter(row => row.action === 'create').length, updates: preview.plans.filter(row => row.action === 'update').length } });
  } catch (error) { next(error); }
}

export async function commitProductImport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.body.token;
    if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) throw new AppError('Select a file and review it first.', 400);
    const result = await prisma.$transaction(async tx => {
      // Serialize retries of the same reviewed batch. A completed batch returns its existing result.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "ProductImportBatch" WHERE id = ${token} FOR UPDATE`);
      const batch = await tx.productImportBatch.findUnique({ where: { id: token } });
      if (!batch || batch.ownerId !== req.user!.userId) throw new NotFoundError('Import preview');
      if (batch.result) return batch.result;
      if (batch.expiresAt < new Date()) throw new AppError('This preview has expired. Review the file again.', 409);
      const plans = batch.payload as unknown as ImportPlan[];
      const categories = await tx.productCategory.findMany({ where: { isActive: true }, select: { value: true } });
      const results: { id: string; slug: string; action: string }[] = [];
      for (const plan of plans) {
        if (!categories.some(category => category.value === plan.product.category)) throw new AppError('A category changed after preview. Review the file again.', 409);
        const { specifications, variants: _variants, ...fields } = plan.product;
        if (plan.action === 'update') {
          const current = await tx.product.findUnique({ where: { id: plan.targetId! }, include: { variants: { select: { id: true } } } });
          if (!current || current.variants.length > 0 || current.updatedAt.toISOString() !== plan.expectedUpdatedAt) throw new AppError(`Row ${plan.row}: product changed after preview. Review the file again.`, 409);
          const changed = await tx.product.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: fields });
          if (changed.count !== 1) throw new AppError('A product changed during import. Review the file again.', 409);
          if (specifications) await tx.productSpecification.upsert({ where: { productId: current.id }, update: { details: specifications.details as Prisma.InputJsonValue, certifications: specifications.certifications }, create: { ...specifications, productId: current.id } as Prisma.ProductSpecificationUncheckedCreateInput });
          results.push({ id: current.id, slug: current.slug, action: 'update' });
        } else {
          const product = await tx.product.create({ data: { ...fields, slug: newSlug(fields.name), ...(specifications ? { specifications: { create: specifications as Prisma.ProductSpecificationCreateWithoutProductInput } } : {}), ...(plan.imageUrls.length ? { images: { create: plan.imageUrls.map((imageUrl, index) => ({ imageUrl, displayOrder: index, isPrimary: index === 0 })) } } : {}) } });
          results.push({ id: product.id, slug: product.slug, action: 'create' });
        }
      }
      const summary = { created: results.filter(row => row.action === 'create').length, updated: results.filter(row => row.action === 'update').length, products: results };
      await tx.productImportBatch.update({ where: { id: token }, data: { result: summary, expiresAt: new Date(Date.now() + 86400000) } });
      return summary;
    }, { timeout: 60000, maxWait: 10000 });
    await deleteCachePattern('products:*');
    await deleteCachePattern('product:*');
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function duplicateProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const source = await prisma.product.findUnique({ where: { id: req.params.id }, include: { images: true, specifications: true, variants: true } });
    if (!source) throw new NotFoundError('Product');
    const sku = resolveProductSku(undefined, source.name, source.brand);
    const specs = source.specifications;
    const product = await prisma.product.create({ data: {
      name: `${source.name.slice(0, 193)} (Copy)`, slug: newSlug(source.name), brand: source.brand, category: source.category, description: source.description,
      price: source.price, discountPrice: source.discountPrice, sku, stock: 0, lowStockThreshold: source.lowStockThreshold, isActive: false,
      images: { create: source.images.map(({ imageUrl, displayOrder, isPrimary }) => ({ imageUrl, displayOrder, isPrimary })) },
      variants: { create: source.variants.map((variant, index) => ({ size: variant.size, color: variant.color, additionalPrice: variant.additionalPrice, stock: 0, sku: `${sku}-${index}` })) },
      ...(specs ? { specifications: { create: { weight: specs.weight, material: specs.material, certifications: specs.certifications, visorType: specs.visorType, ventilation: specs.ventilation, features: specs.features, ...(specs.details !== null ? { details: specs.details as Prisma.InputJsonValue } : {}) } } } : {}),
    } });
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
}

export async function getLowStockProducts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
    if (!Number.isInteger(page) || !Number.isInteger(limit)) throw new AppError('Invalid pagination', 400);
    res.json({ success: true, data: await lowStockPage(page, limit, String(req.query.search || '').slice(0, 200)) });
  } catch (error) { next(error); }
}
