export function escapeXml(value: unknown): string {
  return String(value ?? '').replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]!));
}

export function siteOrigin(): string {
  const url = new URL(process.env.SITE_URL || 'https://bikersbrain.in');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('SITE_URL must be an HTTP(S) URL');
  return url.origin;
}

export function sitemapXml(entries: { path: string; updatedAt?: Date; images?: string[] }[], origin = siteOrigin()): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' +
    entries.map(entry => `<url><loc>${escapeXml(origin + entry.path)}</loc>${entry.updatedAt ? `<lastmod>${entry.updatedAt.toISOString()}</lastmod>` : ''}${(entry.images || []).filter(url => /^https?:\/\//.test(url)).map(url => `<image:image><image:loc>${escapeXml(url)}</image:loc></image:image>`).join('')}</url>`).join('') + '</urlset>';
}

export function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface FeedProduct {
  name: string; slug: string; description: string; brand: string; sku: string;
  price: unknown; discountPrice: unknown; stock: number;
  images: { imageUrl: string }[];
  variants: { stock: number; additionalPrice: unknown }[];
}

export function merchantItem(product: FeedProduct, origin = siteOrigin()): string {
  const images = product.images.filter(image => /^https?:\/\//.test(image.imageUrl));
  if (!images.length) return '';
  const variant = product.variants.find(row => row.stock > 0) || product.variants[0];
  const price = Number(product.price) + Number(variant?.additionalPrice || 0);
  const salePrice = product.discountPrice ? Number(product.discountPrice) + Number(variant?.additionalPrice || 0) : null;
  const field = (name: string, value: unknown) => `<g:${name}>${escapeXml(value)}</g:${name}>`;
  return '<item>' + field('id', product.sku) + field('title', product.name) +
    field('description', plainText(product.description).slice(0, 5000)) +
    field('link', `${origin}/products/${encodeURIComponent(product.slug)}`) +
    field('image_link', images[0].imageUrl) + images.slice(1, 11).map(image => field('additional_image_link', image.imageUrl)).join('') +
    field('brand', product.brand) + field('condition', 'new') +
    field('availability', (variant ? variant.stock : product.stock) > 0 ? 'in_stock' : 'out_of_stock') +
    field('price', `${price.toFixed(2)} INR`) +
    (salePrice !== null && salePrice < price ? field('sale_price', `${salePrice.toFixed(2)} INR`) : '') + '</item>';
}
