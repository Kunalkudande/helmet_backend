import { Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { createRazorpayOrder, verifyRazorpaySignature, fetchPaymentDetails } from '../services/paymentService';
import { sendOrderConfirmationEmail } from '../services/emailService';
import { logger } from '../utils/logger';

/**
 * Generate a unique order number like HLM-20260208-XXXX
 */
function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `HLM-${y}${m}${d}-${rand}`;
}

/**
 * POST /api/orders
 * Create a new order from the user's cart
 */
export async function createOrder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { addressId, paymentMethod, couponCode, notes } = req.body;

    // Verify address belongs to user
    const address = await prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== req.user.userId) {
      throw new NotFoundError('Address');
    }

    // Get cart with items
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.userId },
      include: {
        items: {
          include: {
            product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
            variant: true,
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new AppError('Your cart is empty', 400);
    }

    // For RAZORPAY: check if there's already a pending order to avoid duplicates
    if (paymentMethod === 'RAZORPAY') {
      // Only reuse orders created in the last 10 minutes (Razorpay orders expire ~15 min)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      const existingPendingOrder = await prisma.order.findFirst({
        where: {
          userId: req.user.userId,
          paymentMethod: 'RAZORPAY',
          paymentStatus: 'PENDING',
          orderStatus: 'PENDING',
          razorpayOrderId: { not: null },
          createdAt: { gte: tenMinutesAgo },
        },
        include: { items: true, address: true },
        orderBy: { createdAt: 'desc' },
      });

      if (existingPendingOrder) {
        // Return the existing pending order so the user can retry payment
        res.status(200).json({
          success: true,
          data: {
            order: existingPendingOrder,
            razorpayOrder: {
              id: existingPendingOrder.razorpayOrderId,
              amount: Math.round(Number(existingPendingOrder.total) * 100),
              currency: 'INR',
              keyId: process.env.RAZORPAY_KEY_ID,
            },
          },
          message: 'Existing pending order found. Please complete payment.',
        });
        return;
      }

      // Cancel any old expired pending Razorpay orders
      await prisma.order.updateMany({
        where: {
          userId: req.user.userId,
          paymentMethod: 'RAZORPAY',
          paymentStatus: 'PENDING',
          orderStatus: 'PENDING',
          createdAt: { lt: tenMinutesAgo },
        },
        data: {
          orderStatus: 'CANCELLED',
          paymentStatus: 'FAILED',
        },
      });
    }

    // Calculate order totals
    let subtotal = 0;
    const orderItems = cart.items.map((item: any) => {
      const unitPrice = item.variant
        ? Number(item.product.discountPrice || item.product.price) + Number(item.variant.additionalPrice)
        : Number(item.product.discountPrice || item.product.price);
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      return {
        productId: item.productId,
        variantId: item.variantId,
        productName: item.product.name,
        productImage: item.product.images[0]?.imageUrl || '',
        size: item.variant?.size || 'Standard',
        color: item.variant?.color || 'Default',
        price: unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
      };
    });

    // Apply coupon if provided
    let discount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (
        coupon &&
        coupon.isActive &&
        coupon.usedCount < coupon.usageLimit &&
        new Date() >= coupon.validFrom &&
        new Date() <= coupon.validUntil &&
        subtotal >= Number(coupon.minPurchase)
      ) {
        if (coupon.discountType === 'PERCENTAGE') {
          discount = subtotal * (Number(coupon.discountValue) / 100);
          if (coupon.maxDiscount) {
            discount = Math.min(discount, Number(coupon.maxDiscount));
          }
        } else {
          discount = Number(coupon.discountValue);
        }

        // Increment coupon usage
        await prisma.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }
    }

    // Shipping: free above ₹999, else ₹99 (matches frontend constants)
    const shippingCharge = subtotal >= 999 ? 0 : 99;
    const tax = Math.round(subtotal * 0.18); // 18% GST rounded to integer
    const total = subtotal - discount + shippingCharge + tax;

    const orderNumber = generateOrderNumber();

    // Create order in a transaction
    // For RAZORPAY: only create order (cart + stock handled after payment verification)
    // For COD: create order AND clear cart + deduct stock immediately
    const order = await prisma.$transaction(async (tx: any) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId: req.user!.userId,
          addressId,
          subtotal,
          discount,
          shippingCharge,
          tax,
          total,
          paymentMethod,
          paymentStatus: 'PENDING',
          orderStatus: 'PENDING',
          notes: notes || null,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: true,
          address: true,
        },
      });

      // For COD orders: deduct stock and clear cart immediately
      if (paymentMethod === 'COD') {
        for (const item of cart.items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { decrement: item.quantity } },
            });
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }
      // For RAZORPAY: cart stays intact until payment is verified

      return newOrder;
    });

    // Handle Razorpay payment
    let razorpayOrder = null;
    if (paymentMethod === 'RAZORPAY') {
      razorpayOrder = await createRazorpayOrder(total, orderNumber, {
        orderId: order.id,
        userId: req.user.userId,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { razorpayOrderId: razorpayOrder.id },
      });
    }

    // Send confirmation email (non-blocking)
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (user) {
      sendOrderConfirmationEmail(
        user.email,
        user.fullName,
        orderNumber,
        total,
        orderItems.map((i: any) => ({
          name: i.productName,
          quantity: i.quantity,
          price: i.subtotal,
        }))
      );
    }

    res.status(201).json({
      success: true,
      data: {
        order,
        razorpayOrder: razorpayOrder
          ? {
              id: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency,
              keyId: process.env.RAZORPAY_KEY_ID,
            }
          : null,
      },
      message: paymentMethod === 'COD'
        ? 'Order placed successfully!'
        : 'Order created. Please complete payment.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/verify-payment
 * Verify Razorpay payment signature after successful payment
 */
export async function verifyPayment(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new AppError('Missing payment verification details', 400);
    }

    // Verify signature
    const isValid = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      // Mark payment as failed
      await prisma.order.updateMany({
        where: { razorpayOrderId: razorpay_order_id },
        data: { paymentStatus: 'FAILED' },
      });

      throw new AppError('Payment verification failed', 400);
    }

    // Find the order by razorpay order ID
    const existingOrder = await prisma.order.findFirst({
      where: { razorpayOrderId: razorpay_order_id },
      include: { items: true },
    });

    if (!existingOrder) {
      throw new NotFoundError('Order');
    }

    // SECURITY: Verify the order belongs to the authenticated user
    if (existingOrder.userId !== req.user.userId) {
      throw new AppError('You are not authorized to verify this payment', 403);
    }

    // SECURITY: Verify payment amount matches order total
    try {
      const paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
      const paidAmountInRupees = Number(paymentDetails.amount) / 100;
      const orderTotal = Number(existingOrder.total);

      if (Math.abs(paidAmountInRupees - orderTotal) > 0.01) {
        logger.error(
          `Payment amount mismatch! Order ${existingOrder.id}: expected ₹${orderTotal}, paid ₹${paidAmountInRupees}`
        );
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: { paymentStatus: 'FAILED' },
        });
        throw new AppError('Payment amount does not match order total', 400);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to verify payment amount:', error);
      throw new AppError('Could not verify payment amount', 500);
    }

    // Update order, deduct stock, and clear cart in a single transaction
    const order = await prisma.$transaction(async (tx: any) => {
      // Update order with payment details
      const updatedOrder = await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
        },
        include: { items: true },
      });

      // Deduct stock for each item (was deferred from order creation for RAZORPAY)
      for (const item of updatedOrder.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { decrement: item.quantity } },
          });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // Clear the user's cart now that payment is confirmed
      const cart = await tx.cart.findUnique({
        where: { userId: existingOrder.userId },
      });
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return updatedOrder;
    });

    res.json({
      success: true,
      data: order,
      message: 'Payment verified successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/orders
 * Get the authenticated user's orders
 */
export async function getUserOrders(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { page = '1', limit = '10' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(50, parseInt(limit as string, 10));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.user.userId },
        include: {
          items: true,
          address: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.order.count({ where: { userId: req.user.userId } }),
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
 * GET /api/orders/:id
 * Get order details
 */
export async function getOrderById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        address: true,
        user: { select: { id: true, fullName: true, email: true, phone: true } },
      },
    });

    if (!order) throw new NotFoundError('Order');

    // Ensure user can only see their own orders (unless admin)
    if (order.userId !== req.user.userId && req.user.role !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/orders/:id/cancel
 * Cancel an order (only if PENDING or CONFIRMED)
 */
export async function cancelOrder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) throw new NotFoundError('Order');
    if (order.userId !== req.user.userId) {
      throw new AppError('Access denied', 403);
    }

    if (!['PENDING', 'CONFIRMED'].includes(order.orderStatus)) {
      throw new AppError('Order cannot be cancelled at this stage', 400);
    }

    // Restore stock
    await prisma.$transaction(async (tx: any) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      await tx.order.update({
        where: { id },
        data: {
          orderStatus: 'CANCELLED',
          paymentStatus:
            order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus,
        },
      });
    });

    res.json({
      success: true,
      data: null,
      message: 'Order cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/validate-coupon
 * Validate a coupon code and return the discount details
 */
export async function validateCoupon(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { couponCode, subtotal } = req.body;

    if (!couponCode || typeof couponCode !== 'string') {
      throw new AppError('Coupon code is required', 400);
    }

    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });

    if (!coupon) {
      throw new AppError('Invalid coupon code', 404);
    }

    if (!coupon.isActive) {
      throw new AppError('This coupon is no longer active', 400);
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      throw new AppError('This coupon has reached its usage limit', 400);
    }

    const now = new Date();
    if (now < coupon.validFrom) {
      throw new AppError('This coupon is not yet valid', 400);
    }
    if (now > coupon.validUntil) {
      throw new AppError('This coupon has expired', 400);
    }

    const orderSubtotal = subtotal ? Number(subtotal) : 0;
    if (orderSubtotal > 0 && orderSubtotal < Number(coupon.minPurchase)) {
      throw new AppError(`Minimum purchase of ₹${Number(coupon.minPurchase)} required for this coupon`, 400);
    }

    // Calculate discount
    let discount = 0;
    if (orderSubtotal > 0) {
      if (coupon.discountType === 'PERCENTAGE') {
        discount = orderSubtotal * (Number(coupon.discountValue) / 100);
        if (coupon.maxDiscount) {
          discount = Math.min(discount, Number(coupon.maxDiscount));
        }
      } else {
        discount = Number(coupon.discountValue);
      }
    }

    res.json({
      success: true,
      data: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        discount: Math.round(discount),
        minPurchase: Number(coupon.minPurchase),
        maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
      },
      message: 'Coupon is valid',
    });
  } catch (error) {
    next(error);
  }
}
