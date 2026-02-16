import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, PaginatedResponse } from '../types';
import { getCache, setCache, deleteCachePattern } from '../services/cacheService';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { uploadMultipleImages, deleteImage } from '../services/uploadService';

/**
 * Utility: generate slug from product name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * GET /api/products
 * List products with pagination, filters, search, and sort
 */
export async function getProducts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      page = '1',
      limit = '12',
      category,
      brand,
      minPrice,
      maxPrice,
      size,
      certification,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      inStock,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build cache key from query params
    const cacheKey = `products:${JSON.stringify(req.query)}`;
    const cached = await getCache<PaginatedResponse<unknown>>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    // Build filter conditions
    const where: Record<string, unknown> = { isActive: true };

    if (category) where.category = category;
    if (brand) where.brand = { contains: brand as string, mode: 'insensitive' };
    if (inStock === 'true') where.stock = { gt: 0 };

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) (where.price as Record<string, unknown>).gte = parseFloat(minPrice as string);
      if (maxPrice) (where.price as Record<string, unknown>).lte = parseFloat(maxPrice as string);
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { brand: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (size) {
      where.variants = {
        some: { size: size as string, stock: { gt: 0 } },
      };
    }

    if (certification) {
      where.specifications = {
        certifications: { has: certification as string },
      };
    }

    // Build sort
    const allowedSortFields = ['price', 'createdAt', 'rating', 'name', 'totalReviews'];
    const sortField = allowedSortFields.includes(sortBy as string) ? (sortBy as string) : 'createdAt';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    // Query products
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: where as any,
        skip,
        take: limitNum,
        orderBy: { [sortField]: order },
        include: {
          images: { orderBy: { displayOrder: 'asc' }, take: 2 },
          variants: { select: { id: true, size: true, color: true, stock: true, additionalPrice: true } },
        },
      }),
      prisma.product.count({ where: where as any }),
    ]);

    const totalPages = Math.ceil(total / limitNum);
    const result: PaginatedResponse<typeof products[0]> = {
      items: products,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, result, 300);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/:slug
 * Get single product by slug
 */
export async function getProductBySlug(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = req.params;

    const cacheKey = `product:${slug}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        images: { orderBy: { displayOrder: 'asc' } },
        variants: true,
        specifications: true,
        reviews: {
          where: { isApproved: true },
          include: {
            user: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    await setCache(cacheKey, product, 600);

    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/category-counts
 * Get product counts per category
 */
export async function getCategoryCounts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cacheKey = 'products:category-counts';
    const cached = await getCache(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const counts = await prisma.product.groupBy({
      by: ['category'],
      _count: { id: true },
      where: { isActive: true },
    });

    const result: Record<string, number> = {};
    counts.forEach((c: any) => {
      result[c.category] = c._count.id;
    });

    await setCache(cacheKey, result, 600);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/:slug/related
 * Get related products (same category, different product)
 */
export async function getRelatedProducts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = req.params;

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, category: true, brand: true },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    const related = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { not: product.id },
        OR: [
          { category: product.category },
          { brand: product.brand },
        ],
      },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
      },
      take: 8,
      orderBy: { rating: 'desc' },
    });

    res.json({ success: true, data: related });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/search/autocomplete
 * Autocomplete search suggestions
 */
export async function searchAutocomplete(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { q } = req.query;

    if (!q || (q as string).length < 2) {
      res.json({ success: true, data: [] });
      return;
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q as string, mode: 'insensitive' } },
          { brand: { contains: q as string, mode: 'insensitive' } },
        ],
      },
      select: {
        name: true,
        slug: true,
        brand: true,
        category: true,
        price: true,
        images: { where: { isPrimary: true }, take: 1 },
      },
      take: 6,
    });

    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/featured
 * Get featured products for homepage
 */
export async function getFeaturedProducts(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cacheKey = 'products:featured';
    const cached = await getCache(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const products = await prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0 } },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        variants: { select: { id: true, size: true, color: true, stock: true } },
      },
      orderBy: { rating: 'desc' },
      take: 8,
    });

    await setCache(cacheKey, products, 600);

    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/products (Admin)
 * Create a new product
 */
export async function createProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      name,
      brand,
      category,
      description,
      price,
      discountPrice,
      stock,
      sku,
      specifications,
      variants,
    } = req.body;

    let slug = generateSlug(name);

    // Ensure unique slug
    const existingSlug = await prisma.product.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        brand,
        category,
        description,
        price,
        discountPrice: discountPrice || null,
        stock,
        sku,
        specifications: specifications
          ? { create: specifications }
          : undefined,
        variants: variants
          ? {
              create: variants.map((v: { size: string; color: string; stock: number; additionalPrice?: number }, idx: number) => ({
                ...v,
                sku: `${sku}-${v.size}-${v.color.replace(/\s/g, '')}-${idx}`.toUpperCase(),
                additionalPrice: v.additionalPrice || 0,
              })),
            }
          : undefined,
      },
      include: {
        images: true,
        variants: true,
        specifications: true,
      },
    });

    // Invalidate product caches
    await deleteCachePattern('products:*');

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/products/:id (Admin)
 * Update a product
 */
export async function updateProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Product');
    }

    // If name changed, update slug
    if (updateData.name && updateData.name !== existing.name) {
      updateData.slug = generateSlug(updateData.name);
      const slugExists = await prisma.product.findFirst({
        where: { slug: updateData.slug, id: { not: id } },
      });
      if (slugExists) {
        updateData.slug = `${updateData.slug}-${Date.now().toString(36)}`;
      }
    }

    // Handle specifications update
    if (updateData.specifications) {
      await prisma.productSpecification.upsert({
        where: { productId: id },
        update: updateData.specifications,
        create: { ...updateData.specifications, productId: id },
      });
      delete updateData.specifications;
    }

    // Handle variants update
    if (updateData.variants) {
      // Delete existing variants and recreate
      await prisma.productVariant.deleteMany({ where: { productId: id } });
      await prisma.productVariant.createMany({
        data: updateData.variants.map(
          (v: { size: string; color: string; stock: number; additionalPrice?: number }, idx: number) => ({
            productId: id,
            ...v,
            sku: `${existing.sku}-${v.size}-${v.color.replace(/\s/g, '')}-${idx}`.toUpperCase(),
            additionalPrice: v.additionalPrice || 0,
          })
        ),
      });
      delete updateData.variants;
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        images: true,
        variants: true,
        specifications: true,
      },
    });

    await deleteCachePattern('products:*');
    await deleteCachePattern(`product:${existing.slug}`);

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/products/:id (Admin)
 * Delete a product
 */
export async function deleteProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!product) {
      throw new NotFoundError('Product');
    }

    // Delete all product images from Cloudinary
    for (const image of product.images) {
      if (image.imageUrl && image.imageUrl.includes('cloudinary')) {
        try {
          const parts = image.imageUrl.split('/upload/');
          if (parts[1]) {
            const publicId = parts[1].replace(/\.[^.]+$/, '').replace(/^v\d+\//, '');
            await deleteImage(publicId);
          }
        } catch (e) {
          // Non-fatal — continue deleting other images
        }
      }
    }

    // Soft-delete: deactivate instead of hard-delete to preserve order history
    await prisma.product.update({
      where: { id },
      data: { isActive: false, name: `[DELETED] ${product.name}` },
    });

    // Also remove any cart items referencing this product
    await prisma.cartItem.deleteMany({ where: { productId: id } });

    await deleteCachePattern('products:*');
    await deleteCachePattern(`product:${product.slug}`);

    res.json({
      success: true,
      data: null,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/products/:id/images (Admin)
 * Add images to a product — accepts JSON body or multipart file upload
 */
export async function addProductImages(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundError('Product');
    }

    // Get current image count for display ordering
    const existingImageCount = await prisma.productImage.count({
      where: { productId: id },
    });

    let imagesToCreate: { imageUrl: string; isPrimary: boolean; displayOrder: number }[] = [];

    // Check if request has files (multipart upload)
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      const uploadedImages = await uploadMultipleImages(files, 'helmet-store/products');
      imagesToCreate = uploadedImages.map((img, idx) => ({
        imageUrl: img.secure_url,
        isPrimary: existingImageCount === 0 && idx === 0,
        displayOrder: existingImageCount + idx,
      }));
    } else if (req.body.images && Array.isArray(req.body.images)) {
      // Fallback: JSON body with image URLs
      imagesToCreate = req.body.images.map(
        (img: { imageUrl: string; isPrimary?: boolean; displayOrder?: number }, idx: number) => ({
          imageUrl: img.imageUrl,
          isPrimary: img.isPrimary || (existingImageCount === 0 && idx === 0),
          displayOrder: img.displayOrder ?? existingImageCount + idx,
        })
      );
    } else {
      throw new AppError('No images provided', 400);
    }

    const created = await prisma.productImage.createMany({
      data: imagesToCreate.map((img) => ({
        productId: id,
        ...img,
      })),
    });

    // Fetch and return all images for this product
    const allImages = await prisma.productImage.findMany({
      where: { productId: id },
      orderBy: { displayOrder: 'asc' },
    });

    await deleteCachePattern(`product:${product.slug}`);
    await deleteCachePattern('products:*');

    res.status(201).json({
      success: true,
      data: { count: created.count, images: allImages },
      message: 'Images uploaded successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/products/:id/images/:imageId (Admin)
 * Delete a single product image
 */
export async function deleteProductImage(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, imageId } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError('Product');

    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== id) throw new NotFoundError('Image');

    // Try to delete from Cloudinary (extract public_id from URL)
    if (image.imageUrl.includes('cloudinary')) {
      try {
        const parts = image.imageUrl.split('/upload/');
        if (parts[1]) {
          const publicId = parts[1].replace(/\.[^.]+$/, '').replace(/^v\d+\//, '');
          await deleteImage(publicId);
        }
      } catch (e) {
        // Non-fatal — image may already be deleted from Cloudinary
      }
    }

    await prisma.productImage.delete({ where: { id: imageId } });

    // If deleted image was primary, make the first remaining image primary
    if (image.isPrimary) {
      const firstImage = await prisma.productImage.findFirst({
        where: { productId: id },
        orderBy: { displayOrder: 'asc' },
      });
      if (firstImage) {
        await prisma.productImage.update({
          where: { id: firstImage.id },
          data: { isPrimary: true },
        });
      }
    }

    await deleteCachePattern(`product:${product.slug}`);
    await deleteCachePattern('products:*');

    // Return remaining images
    const remainingImages = await prisma.productImage.findMany({
      where: { productId: id },
      orderBy: { displayOrder: 'asc' },
    });

    res.json({
      success: true,
      data: { images: remainingImages },
      message: 'Image deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/products/:id/images/:imageId/primary (Admin)
 * Set an image as the primary image
 */
export async function setPrimaryImage(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, imageId } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError('Product');

    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== id) throw new NotFoundError('Image');

    // Unset all as primary, then set the chosen one
    await prisma.productImage.updateMany({
      where: { productId: id },
      data: { isPrimary: false },
    });
    await prisma.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });

    const allImages = await prisma.productImage.findMany({
      where: { productId: id },
      orderBy: { displayOrder: 'asc' },
    });

    await deleteCachePattern(`product:${product.slug}`);
    await deleteCachePattern('products:*');

    res.json({ success: true, data: { images: allImages } });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/brands
 * Get all unique brands
 */
export async function getBrands(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cacheKey = 'products:brands';
    const cached = await getCache(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const brands = await prisma.product.findMany({
      where: { isActive: true },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });

    const brandList = brands.map((b: { brand: string }) => b.brand);
    await setCache(cacheKey, brandList, 3600);

    res.json({ success: true, data: brandList });
  } catch (error) {
    next(error);
  }
}
