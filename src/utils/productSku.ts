import { randomUUID } from 'node:crypto';

/** Create an inventory identifier when no SKU was supplied by the admin. */
export function resolveProductSku(sku: string | undefined, name: string, brand: string): string {
  if (sku?.trim()) return sku.trim();
  const part = (value: string, max: number) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-$/g, '');
  return `BB-${part(brand, 10) || 'PRD'}-${part(name, 16) || 'ITEM'}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}
