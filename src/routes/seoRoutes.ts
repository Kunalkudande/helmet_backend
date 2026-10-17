import { Router, type Response, type NextFunction } from 'express';
import { prisma } from '../config/database';
import { escapeXml, siteOrigin, sitemapXml, merchantItem } from '../utils/seoXml';

const router = Router();
const CHUNK_SIZE = 1000;
const pages = ['/', '/products', '/blog', '/about', '/contact', '/return-policy', '/shipping-policy', '/privacy-policy', '/terms'];
const xml = (res: Response, body: string) => {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.type('application/xml').send(body);
};

router.get('/sitemap.xml', async (_req, res, next: NextFunction) => {
  try {
    const [products, posts] = await Promise.all([prisma.product.count({ where: { isActive: true } }), prisma.blogPost.count({ where: { isPublished: true } })]);
    const paths = ['/sitemap-pages.xml'];
    for (let page = 1; page <= Math.ceil(products / CHUNK_SIZE); page++) paths.push(`/sitemap-products-${page}.xml`);
    for (let page = 1; page <= Math.ceil(posts / CHUNK_SIZE); page++) paths.push(`/sitemap-articles-${page}.xml`);
    xml(res, '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map(path => `<sitemap><loc>${escapeXml(siteOrigin() + path)}</loc></sitemap>`).join('') + '</sitemapindex>');
  } catch (error) { next(error); }
});

router.get('/sitemap-pages.xml', async (_req, res, next: NextFunction) => {
  try {
    const [categories, populated] = await Promise.all([
      prisma.productCategory.findMany({ where: { isActive: true }, select: { value: true } }),
      prisma.product.groupBy({ by: ['category'], where: { isActive: true } }),
    ]);
    const values = new Set(populated.map(row => row.category));
    xml(res, sitemapXml([...pages.map(path => ({ path })), ...categories.filter(row => values.has(row.value)).map(row => ({ path: `/products?category=${encodeURIComponent(row.value)}` }))]));
  } catch (error) { next(error); }
});

router.get('/sitemap-:kind-:page.xml', async (req, res, next: NextFunction) => {
  try {
    const { kind, page } = req.params;
    const number = Number(page);
    if (!['products', 'articles'].includes(kind) || !Number.isSafeInteger(number) || number < 1 || number > 50000) { res.status(404).end(); return; }
    const paging = { skip: (number - 1) * CHUNK_SIZE, take: CHUNK_SIZE, orderBy: { id: 'asc' as const } };
    if (kind === 'products') {
      const products = await prisma.product.findMany({ ...paging, where: { isActive: true }, select: { slug: true, updatedAt: true, images: { select: { imageUrl: true }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] } } });
      if (!products.length) { res.status(404).end(); return; }
      xml(res, sitemapXml(products.map(row => ({ path: `/products/${encodeURIComponent(row.slug)}`, updatedAt: row.updatedAt, images: row.images.map(image => image.imageUrl) }))));
    } else {
      const posts = await prisma.blogPost.findMany({ ...paging, where: { isPublished: true }, select: { slug: true, updatedAt: true } });
      if (!posts.length) { res.status(404).end(); return; }
      xml(res, sitemapXml(posts.map(row => ({ path: `/blog/${encodeURIComponent(row.slug)}`, updatedAt: row.updatedAt }))));
    }
  } catch (error) { next(error); }
});

router.get('/merchant-feed.xml', async (_req, res, next: NextFunction) => {
  try {
    // Iterate in bounded batches. No customer data, admin data or draft products are exposed.
    const items: string[] = [];
    let cursor: string | undefined;
    do {
      const rows = await prisma.product.findMany({
        where: { isActive: true }, take: CHUNK_SIZE, orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, name: true, slug: true, description: true, brand: true, sku: true, price: true, discountPrice: true, stock: true, images: { select: { imageUrl: true }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] }, variants: { select: { stock: true, additionalPrice: true }, orderBy: { id: 'asc' } } },
      });
      items.push(...rows.map(row => merchantItem(row)));
      cursor = rows.length === CHUNK_SIZE ? rows[rows.length - 1].id : undefined;
    } while (cursor);
    xml(res, '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>BikersBrain products</title><link>' + escapeXml(siteOrigin()) + '</link><description>Two-wheeler parts, oils, helmets and accessories</description>' + items.join('') + '</channel></rss>');
  } catch (error) { next(error); }
});

export default router;
