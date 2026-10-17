import { z } from 'zod';
import { createProductSchema } from './validators';
import { resolveProductSku } from './productSku';

export const IMPORT_LIMIT = 200;
export const importRequestSchema = z.object({ rows: z.array(z.object({ row: z.number().int().min(2), values: z.record(z.string().max(30000)) })).min(1).max(IMPORT_LIMIT) });
const columns = ['name', 'brand', 'category', 'description', 'price', 'stock', 'sku', 'discountPrice', 'lowStockThreshold', 'isActive', 'imageUrls', 'details'];
type ExistingProduct = { id: string; sku: string; updatedAt: Date; isActive: boolean; discountPrice?: unknown; lowStockThreshold?: number; variants: unknown[] };
export interface ImportPlan {
  row: number; action: 'create' | 'update'; targetId?: string; expectedUpdatedAt?: string;
  product: z.infer<typeof createProductSchema> & { sku: string; slug?: string };
  imageUrls: string[];
}

export function planProductImport(rows: z.infer<typeof importRequestSchema>['rows'], categories: { value: string; label: string }[], existing: ExistingProduct[]) {
  const seen = new Set<string>();
  const plans: ImportPlan[] = [];
  const results: { row: number; name: string; sku: string; action: string; errors: string[]; category?: string; stock?: number; price?: number; discountPrice?: number | null; lowStockThreshold?: number; isActive?: boolean }[] = [];
  for (const { row, values } of rows) {
    const errors: string[] = [];
    for (const key of Object.keys(values)) if (!columns.includes(key)) errors.push(`Unknown column: ${key}`);
    const value = (key: string) => (values[key] || '').trim();
    const number = (key: string) => value(key) !== '' && /^\d+(?:\.\d+)?$/.test(value(key)) ? Number(value(key)) : NaN;
    if (number('stock') > 2147483647) errors.push('Stock exceeds the maximum supported whole number.');
    if (number('price') > 99999999.99) errors.push('Price exceeds the maximum supported amount.');
    for (const field of ['price', 'discountPrice']) if (value(field) && value(field).toUpperCase() !== 'CLEAR' && !/^\d+(?:\.\d{1,2})?$/.test(value(field))) errors.push(`${field}: use a plain number with at most two decimal places.`);
    const sku = value('sku');
    if (sku && seen.has(sku)) errors.push('SKU appears more than once in this file.');
    if (sku) seen.add(sku);
    const match = existing.find(product => product.sku === sku);
    if (match?.variants.length) errors.push('This product has variants. Update its stock and options in the product editor.');
    const exactCategory = categories.find(category => category.value.toUpperCase() === value('category').toUpperCase());
    const matchingCategories = exactCategory ? [exactCategory] : categories.filter(category => category.label.toLowerCase() === value('category').toLowerCase());
    if (matchingCategories.length !== 1) errors.push('Use a valid active category value or an unambiguous category label.');
    const discount = value('discountPrice');
    let details;
    if (value('details')) { try { details = JSON.parse(value('details')); } catch { errors.push('details must be a JSON array of label/value objects.'); } }
    const imageUrls = value('imageUrls') ? value('imageUrls').split('|').map(url => url.trim()) : [];
    if (imageUrls.length > 10 || imageUrls.some(url => { try { return new URL(url).protocol !== 'https:'; } catch { return true; } })) errors.push('Provide up to 10 HTTPS image URLs separated by |.');
    if (match && imageUrls.length) errors.push('Image URLs are for new products only. Use the editor to change existing images.');
    const active = value('isActive').toLowerCase();
    if (active && !['true', 'false'].includes(active)) errors.push('isActive must be true or false.');
    const candidate = createProductSchema.safeParse({
      name: value('name'), brand: value('brand'), category: matchingCategories[0]?.value || value('category'), description: value('description'),
      price: number('price'), stock: number('stock'), sku: sku || undefined,
      ...(discount ? { discountPrice: discount.toUpperCase() === 'CLEAR' ? null : number('discountPrice') } : {}),
      ...(value('lowStockThreshold') ? { lowStockThreshold: number('lowStockThreshold') } : {}),
      isActive: active ? active === 'true' : match ? undefined : false,
      ...(details !== undefined ? { specifications: { details } } : {}),
    });
    if (!candidate.success) errors.push(...candidate.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`));
    if (candidate.success && candidate.data.discountPrice != null && candidate.data.discountPrice >= candidate.data.price) errors.push('Discount price must be less than price.');
    const effectiveDiscount = discount ? (discount.toUpperCase() === 'CLEAR' ? null : number('discountPrice')) : match?.discountPrice;
    if (candidate.success && effectiveDiscount != null && Number(effectiveDiscount) >= candidate.data.price && !errors.includes('Discount price must be less than price.')) errors.push('The existing discount price must be lower than the new price. Set discountPrice or use CLEAR.');
    if (candidate.success && candidate.data.specifications?.details) candidate.data.specifications.certifications = candidate.data.specifications.details.filter(detail => /certifications|standards/i.test(detail.label)).flatMap(detail => detail.value.split(/[,;\n]/).map(value => value.trim()).filter(Boolean));
    const finalSku = sku || resolveProductSku(undefined, value('name'), value('brand'));
    results.push({ row, name: value('name'), sku: finalSku, action: match ? 'update' : 'create', errors, category: matchingCategories[0]?.label, price: candidate.success ? candidate.data.price : undefined, discountPrice: effectiveDiscount == null ? null : Number(effectiveDiscount), lowStockThreshold: candidate.success ? candidate.data.lowStockThreshold ?? match?.lowStockThreshold ?? 5 : undefined, stock: candidate.success ? candidate.data.stock : undefined, isActive: active ? active === 'true' : match?.isActive || false });
    if (candidate.success && errors.length === 0) plans.push({ row, action: match ? 'update' : 'create', targetId: match?.id, expectedUpdatedAt: match?.updatedAt.toISOString(), product: { ...candidate.data, sku: finalSku }, imageUrls });
  }
  return { rows: results, plans, valid: results.every(row => row.errors.length === 0) };
}
