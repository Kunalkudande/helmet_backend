import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, DashboardStats } from '../types';
import { AppError, NotFoundError } from '../middleware/errorHandler';
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
      sendOrderShippedEmail(
        order.user.email,
        order.user.fullName,
        order.orderNumber,
        trackingNumber
      );
    }

    if (orderStatus === 'DELIVERED') {
      sendOrderDeliveredEmail(
        order.user.email,
        order.user.fullName,
        order.orderNumber
      );
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
