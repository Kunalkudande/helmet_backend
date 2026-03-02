import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, DashboardStats } from '../types';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { deleteCachePattern } from '../services/cacheService';
import {
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
} from '../services/emailService';

/**
 * GET /api/admin/dashboard
 * Get admin dashboard statistics
 */
export async function getDashboardStats(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [
      totalRevenue,
      totalOrders,
      totalProducts,
      totalCustomers,
      recentOrders,
      lowStockProducts,
    ] = await Promise.all([
      // Total revenue from paid orders
      prisma.order.aggregate({
        _sum: { total: true },
        where: { paymentStatus: 'PAID' },
      }),
      prisma.order.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      // Recent 10 orders
      prisma.order.findMany({
        include: {
          user: { select: { fullName: true, email: true } },
          items: { take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      // Low stock products (stock <= 5)
      prisma.product.findMany({
        where: { isActive: true, stock: { lte: 5 } },
        select: {
          id: true,
          name: true,
          stock: true,
          sku: true,
          images: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { stock: 'asc' },
        take: 10,
      }),
    ]);

    // Monthly sales for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyOrders = await prisma.order.findMany({
      where: {
        paymentStatus: 'PAID',
        createdAt: { gte: sixMonthsAgo },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    const monthlySales: Record<string, { revenue: number; orders: number }> = {};
    monthlyOrders.forEach((order: { total: any; createdAt: Date }) => {
      const monthKey = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlySales[monthKey]) {
        monthlySales[monthKey] = { revenue: 0, orders: 0 };
      }
      monthlySales[monthKey].revenue += Number(order.total);
      monthlySales[monthKey].orders += 1;
    });

    const stats: DashboardStats = {
      totalRevenue: Number(totalRevenue._sum.total) || 0,
      totalOrders,
      totalProducts,
      totalCustomers,
      recentOrders,
      lowStockProducts,
      monthlySales: Object.entries(monthlySales).map(([month, data]) => ({
        month,
        revenue: data.revenue,
        orders: data.orders,
      })),
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/orders
 * Get all orders (admin view)
 */
export async function getAllOrders(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      page = '1',
      limit = '20',
      status,
      paymentStatus,
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (status) where.orderStatus = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search as string, mode: 'insensitive' } },
        { user: { fullName: { contains: search as string, mode: 'insensitive' } } },
        { user: { email: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: where as any,
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } },
          items: true,
          address: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.order.count({ where: where as any }),
    ]);

    res.json({
      success: true,
      data: {
        items: orders,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/orders/:id/status
 * Update order status (admin)
 */
export async function updateOrderStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { orderStatus, trackingNumber } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, fullName: true } },
        items: {
          include: {
            product: { select: { name: true, price: true, discountPrice: true } },
            variant: { select: { size: true, color: true, additionalPrice: true } },
          },
        },
        address: true,
      },
    });

    if (!order) throw new NotFoundError('Order');

    const updateData: Record<string, unknown> = { orderStatus };
    if (trackingNumber) updateData.trackingNumber = trackingNumber;

    // Auto-update payment status for COD on delivery
    if (orderStatus === 'DELIVERED' && order.paymentMethod === 'COD') {
      updateData.paymentStatus = 'PAID';
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData as any,
      include: { items: true, address: true },
    });

    // Send status emails
    if (orderStatus === 'SHIPPED' && trackingNumber) {
      if (order.user) {
      sendOrderShippedEmail(
        order.user.email,
        order.user.fullName,
        order.orderNumber,
        trackingNumber
      );
      } else if (order.guestEmail && order.guestName) {
        sendOrderShippedEmail(order.guestEmail, order.guestName, order.orderNumber, trackingNumber);
      }
    }

    if (orderStatus === 'DELIVERED') {
      // Build invoice data from order details
      const invoiceItems = order.items.map((item: any) => ({
        name: `${item.product?.name || 'Product'}${item.variant ? ` (${item.variant.size}/${item.variant.color})` : ''}`,
        quantity: item.quantity,
        price: Number(item.price) * item.quantity,
      }));

      const addr = order.address;
      const addressStr = addr
        ? `${addr.fullName}, ${addr.addressLine1}${addr.addressLine2 ? ', ' + addr.addressLine2 : ''}, ${addr.city}, ${addr.state} - ${addr.pinCode}`
        : (order as any).guestAddressLine1
          ? `${(order as any).guestName}, ${(order as any).guestAddressLine1}, ${(order as any).guestCity}, ${(order as any).guestState} - ${(order as any).guestPincode}`
          : 'N/A';

      const recipientEmail = order.user?.email || order.guestEmail;
      const recipientName = order.user?.fullName || order.guestName;
      if (recipientEmail && recipientName) {
      sendOrderDeliveredEmail(
        recipientEmail,
        recipientName,
        order.orderNumber,
        {
          items: invoiceItems,
          subtotal: Number(order.subtotal),
          shipping: Number(order.shippingCharge),
          tax: Number(order.tax),
          total: Number(order.total),
          address: addressStr,
          paymentMethod: order.paymentMethod,
          orderDate: new Date(order.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        }
      );
      } // end if recipientEmail && recipientName
    }

    res.json({
      success: true,
      data: updatedOrder,
      message: `Order status updated to ${orderStatus}`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/customers
 * Get all customers
 */
export async function getCustomers(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = '1', limit = '20', search } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { role: 'CUSTOMER' };
    if (search) {
      where.OR = [
        { fullName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where: where as any,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          isVerified: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where: where as any }),
    ]);

    res.json({
      success: true,
      data: {
        items: customers,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/reviews/:id/approve
 * Approve or reject a review
 */
export async function approveReview(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { isApproved } = req.body;

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundError('Review');

    await prisma.review.update({
      where: { id },
      data: { isApproved },
    });

    // Recalculate product rating
    if (isApproved) {
      const reviews = await prisma.review.findMany({
        where: { productId: review.productId, isApproved: true },
        select: { rating: true },
      });

      const avgRating =
        reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length;

      await prisma.product.update({
        where: { id: review.productId },
        data: {
          rating: Math.round(avgRating * 100) / 100,
          totalReviews: reviews.length,
        },
      });
    }

    res.json({
      success: true,
      data: null,
      message: isApproved ? 'Review approved' : 'Review rejected',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/coupons
 * Create a coupon
 */
export async function createCoupon(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupon = await prisma.coupon.create({
      data: {
        ...req.body,
        validFrom: new Date(req.body.validFrom),
        validUntil: new Date(req.body.validUntil),
      },
    });

    res.status(201).json({
      success: true,
      data: coupon,
      message: 'Coupon created successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/coupons
 * List all coupons
 */
export async function getCoupons(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/coupons/:id
 * Delete a coupon
 */
export async function deleteCoupon(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.coupon.delete({
      where: { id },
    });

    res.json({
      success: true,
      data: null,
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/coupons/:id
 * Toggle coupon active status
 */
export async function toggleCoupon(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundError('Coupon');

    const updated = await prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive },
    });

    res.json({
      success: true,
      data: updated,
      message: `Coupon ${updated.isActive ? 'activated' : 'deactivated'}`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/newsletter/subscribe
 * Subscribe to newsletter
 */
export async function subscribeNewsletter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = req.body;

    await prisma.newsletter.upsert({
      where: { email },
      update: { isSubscribed: true },
      create: { email },
    });

    res.json({
      success: true,
      data: null,
      message: 'Successfully subscribed to newsletter!',
    });
  } catch (error) {
    next(error);
  }
}

/* ═══════════════════════════════════════════ CATEGORY CRUD ═══ */

/**
 * GET /api/admin/categories
 * Returns all categories enriched with a productCount field.
 */
export async function getCategories(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [categories, productCounts] = await Promise.all([
      prisma.productCategory.findMany({
        orderBy: [{ groupSortOrder: 'asc' }, { group: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
      prisma.product.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
    ]);

    const countMap: Record<string, number> = {};
    for (const row of productCounts) {
      countMap[row.category] = row._count._all;
    }

    const enriched = categories.map((c) => ({
      ...c,
      productCount: countMap[c.value] ?? 0,
    }));

    res.json({ success: true, data: enriched });
  } catch (error) { next(error); }
}

/**
 * POST /api/admin/categories
 */
export async function createCategory(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { value, label, group, description, sortOrder, groupSortOrder, isActive, parentId } = req.body;

    if (!value || !label || !group) {
      throw new AppError('value, label and group are required', 400);
    }

    // Normalise: uppercase snake_case for value
    const normValue = String(value).toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

    const existing = await prisma.productCategory.findUnique({ where: { value: normValue } });
    if (existing) throw new AppError(`Category with value "${normValue}" already exists`, 400);

    const category = await prisma.productCategory.create({
      data: {
        value: normValue,
        label: String(label).trim(),
        group: String(group).trim(),
        description: description ? String(description).trim() : null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
        groupSortOrder: typeof groupSortOrder === 'number' ? groupSortOrder : 0,
        isActive: isActive !== false,
        ...(parentId && { parentId: String(parentId) }),
      },
    });
    await deleteCachePattern('categories:public');
    res.status(201).json({ success: true, data: category, message: 'Category created' });
  } catch (error) { next(error); }
}

/**
 * PUT /api/admin/categories/:id
 */
export async function updateCategory(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { label, group, description, sortOrder, groupSortOrder, isActive, parentId } = req.body;

    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Category');

    const updated = await prisma.productCategory.update({
      where: { id },
      data: {
        ...(label     !== undefined && { label: String(label).trim() }),
        ...(group     !== undefined && { group: String(group).trim() }),
        ...(description !== undefined && { description: description ? String(description).trim() : null }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
        ...(groupSortOrder !== undefined && { groupSortOrder: Number(groupSortOrder) }),
        ...(isActive  !== undefined && { isActive: Boolean(isActive) }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        updatedAt: new Date(),
      },
    });
    await deleteCachePattern('categories:public');
    res.json({ success: true, data: updated, message: 'Category updated' });
  } catch (error) { next(error); }
}

/**
 * DELETE /api/admin/categories/:id
 */
export async function deleteCategory(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Category');

    // Prevent deletion if products are using this category
    const productCount = await prisma.product.count({ where: { category: existing.value } });
    if (productCount > 0) {
      throw new AppError(
        `Cannot delete: ${productCount} product(s) use this category. Reassign them first.`,
        400
      );
    }

    await prisma.productCategory.delete({ where: { id } });
    await deleteCachePattern('categories:public');
    res.json({ success: true, data: null, message: 'Category deleted' });
  } catch (error) { next(error); }
}

/**
 * PUT /api/admin/categories/reorder
 * Batch-update sortOrder and/or groupSortOrder for multiple categories.
 */
export async function reorderCategories(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('items array is required', 400);
    }

    await prisma.$transaction(
      items.map((item: { id: string; sortOrder?: number; groupSortOrder?: number }) =>
        prisma.productCategory.update({
          where: { id: item.id },
          data: {
            ...(item.sortOrder !== undefined && { sortOrder: item.sortOrder }),
            ...(item.groupSortOrder !== undefined && { groupSortOrder: item.groupSortOrder }),
            updatedAt: new Date(),
          },
        })
      )
    );

    await deleteCachePattern('categories:public');
    res.json({ success: true, message: 'Categories reordered' });
  } catch (error) { next(error); }
}

/* ─── Site Settings ────────────────────────────────────────────────── */

/**
 * GET /api/admin/settings
 * Returns all site settings (admin only)
 */
export async function getSettings(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rows = await prisma.siteSetting.findMany();
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json({ success: true, data: settings });
  } catch (error) { next(error); }
}

/**
 * PUT /api/admin/settings
 * Upsert one or more settings { key: value, ... }
 */
export async function updateSettings(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, string>;
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      throw new AppError('Settings object is required', 400);
    }

    await prisma.$transaction(
      Object.entries(body).map(([key, value]) =>
        prisma.siteSetting.upsert({
          where: { key },
          create: { key, value: String(value) },
          update: { value: String(value) },
        })
      )
    );

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) { next(error); }
}

/**
 * GET /api/settings/public
 * Returns only public-visible settings (no auth required)
 * Currently: cod_enabled
 */
export async function getPublicSettings(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const PUBLIC_KEYS = ['cod_enabled'];
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: PUBLIC_KEYS } },
    });
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    // Default cod_enabled to true if not set
    if (!settings.cod_enabled) settings.cod_enabled = 'true';
    res.json({ success: true, data: settings });
  } catch (error) { next(error); }
}

