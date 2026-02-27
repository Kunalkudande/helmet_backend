import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { createRazorpayOrder, createRazorpay1CCOrder, verifyRazorpaySignature, fetchPaymentDetails, fetchRazorpayOrder } from '../services/paymentService';
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
    const tax = 0; // GST already included in product prices
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

    // SECURITY: Verify the order belongs to the authenticated user (skip for guest orders)
    if (existingOrder.userId && existingOrder.userId !== req.user.userId) {
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

      // Clear the user's cart now that payment is confirmed (only for registered users)
      if (existingOrder.userId) {
        const cart = await tx.cart.findUnique({
          where: { userId: existingOrder.userId },
        });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }
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

/**
 * POST /api/orders/guest
 * Create an order for a guest (no authentication required).
 * Cart items are sent in the request body; product details are re-fetched from DB
 * to prevent price manipulation.
 */
export async function createGuestOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      contact,   // { name, email, phone }
      address,   // { addressLine1, addressLine2?, city, state, pincode }
      items,     // [{ productId, variantId?, quantity }]
      paymentMethod,
      couponCode,
      notes,
    } = req.body;

    if (!contact?.name || !contact?.email || !contact?.phone) {
      throw new AppError('Contact name, email and phone are required', 400);
    }
    if (!address?.addressLine1 || !address?.city || !address?.state || !address?.pincode) {
      throw new AppError('Complete delivery address is required', 400);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }
    if (!['RAZORPAY', 'COD'].includes(paymentMethod)) {
      throw new AppError('Invalid payment method', 400);
    }

    // Re-fetch product details from DB (never trust client-sent prices)
    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        throw new AppError('Invalid item in order', 400);
      }

      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { images: { where: { isPrimary: true }, take: 1 } },
      });
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 400);

      let variant = null;
      if (item.variantId) {
        variant = await prisma.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant) throw new AppError(`Variant not found: ${item.variantId}`, 400);
      }

      const unitPrice = variant
        ? Number(product.discountPrice || product.price) + Number(variant.additionalPrice)
        : Number(product.discountPrice || product.price);
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        productName: product.name,
        productImage: product.images[0]?.imageUrl || '',
        size: variant?.size || 'Standard',
        color: variant?.color || 'Default',
        price: unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
      });
    }

    // Apply coupon if provided
    let discount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (
        coupon && coupon.isActive &&
        coupon.usedCount < coupon.usageLimit &&
        new Date() >= coupon.validFrom &&
        new Date() <= coupon.validUntil &&
        subtotal >= Number(coupon.minPurchase)
      ) {
        if (coupon.discountType === 'PERCENTAGE') {
          discount = subtotal * (Number(coupon.discountValue) / 100);
          if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
        } else {
          discount = Number(coupon.discountValue);
        }
        await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
    }

    const shippingCharge = subtotal >= 999 ? 0 : 99;
    const tax = 0; // GST already included in product prices
    const total = subtotal - discount + shippingCharge + tax;
    const orderNumber = generateOrderNumber();

    // Create order with guest fields (userId = null, addressId = null)
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: null,
        addressId: null,
        guestName: contact.name,
        guestEmail: contact.email,
        guestPhone: contact.phone,
        guestAddressLine1: address.addressLine1,
        guestAddressLine2: address.addressLine2 || null,
        guestCity: address.city,
        guestState: address.state,
        guestPincode: address.pincode,
        subtotal,
        discount,
        shippingCharge,
        tax,
        total,
        paymentMethod,
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING',
        notes: notes || null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    // For COD: deduct stock immediately
    if (paymentMethod === 'COD') {
      for (const item of items) {
        if (item.variantId) {
          await prisma.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { decrement: item.quantity } },
          });
        }
        await prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
    }

    // Create Razorpay order if needed
    let razorpayOrder = null;
    if (paymentMethod === 'RAZORPAY') {
      razorpayOrder = await createRazorpayOrder(total, orderNumber, { orderId: order.id });
      await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: razorpayOrder.id } });
    }

    // Non-blocking confirmation email
    sendOrderConfirmationEmail(
      contact.email,
      contact.name,
      orderNumber,
      total,
      orderItems.map((i) => ({ name: i.productName, quantity: i.quantity, price: i.subtotal }))
    );

    res.status(201).json({
      success: true,
      data: {
        order,
        razorpayOrder: razorpayOrder
          ? { id: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency }
          : null,
      },
      message: paymentMethod === 'COD' ? 'Order placed successfully!' : 'Order created. Please complete payment.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/guest/verify-payment
 * Verify Razorpay payment for a guest order (no auth required).
 */
export async function verifyGuestPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new AppError('Missing payment verification details', 400);
    }

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      await prisma.order.updateMany({
        where: { razorpayOrderId: razorpay_order_id },
        data: { paymentStatus: 'FAILED' },
      });
      throw new AppError('Payment verification failed', 400);
    }

    const existingOrder = await prisma.order.findFirst({
      where: { razorpayOrderId: razorpay_order_id, userId: null }, // only guest orders
      include: { items: true },
    });

    if (!existingOrder) throw new NotFoundError('Order');

    // Verify payment amount
    try {
      const paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
      const paidAmountInRupees = Number(paymentDetails.amount) / 100;
      const orderTotal = Number(existingOrder.total);
      if (Math.abs(paidAmountInRupees - orderTotal) > 0.01) {
        await prisma.order.update({ where: { id: existingOrder.id }, data: { paymentStatus: 'FAILED' } });
        throw new AppError('Payment amount does not match order total', 400);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Could not verify payment amount', 500);
    }

    const order = await prisma.$transaction(async (tx: any) => {
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

      for (const item of updatedOrder.items) {
        if (item.variantId) {
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { decrement: item.quantity } } });
        }
        await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
      }

      return updatedOrder;
    });

    res.json({ success: true, data: order, message: 'Payment verified successfully' });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Magic Checkout (1CC) — Contact + Address + Payment inside Razorpay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/orders/razorpay-checkout
 * Authenticated user: create pending order + Razorpay 1CC order (no address needed upfront)
 */
export async function createRazorpayCheckout(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { couponCode, notes } = req.body;

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

    if (!cart || cart.items.length === 0) throw new AppError('Your cart is empty', 400);

    // Calculate order totals
    let subtotal = 0;
    const orderItems: any[] = [];
    const lineItems: { name: string; quantity: number; amount: number }[] = [];

    for (const item of cart.items) {
      const unitPrice = item.variant
        ? Number(item.product.discountPrice || item.product.price) + Number(item.variant.additionalPrice)
        : Number(item.product.discountPrice || item.product.price);
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.product.name,
        productImage: item.product.images[0]?.imageUrl || '',
        size: item.variant?.size || 'Standard',
        color: item.variant?.color || 'Default',
        price: unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
      });

      lineItems.push({
        name: `${item.product.name}${item.variant ? ` (${item.variant.size}/${item.variant.color})` : ''}`,
        quantity: item.quantity,
        amount: Math.round(unitPrice * item.quantity * 100), // paise
      });
    }

    // Apply coupon if provided
    let discount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (
        coupon && coupon.isActive &&
        coupon.usedCount < coupon.usageLimit &&
        new Date() >= coupon.validFrom &&
        new Date() <= coupon.validUntil &&
        subtotal >= Number(coupon.minPurchase)
      ) {
        if (coupon.discountType === 'PERCENTAGE') {
          discount = subtotal * (Number(coupon.discountValue) / 100);
          if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
        } else {
          discount = Number(coupon.discountValue);
        }
        await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
    }

    const shippingCharge = subtotal >= 999 ? 0 : 99;
    const tax = 0; // GST already included in product prices
    const total = subtotal - discount + shippingCharge + tax;
    const orderNumber = generateOrderNumber();

    // Create pending order (no address yet — Razorpay 1CC will collect it)
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.user.userId,
        addressId: null,
        subtotal,
        discount,
        shippingCharge,
        tax,
        total,
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING',
        notes: notes || null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    // Fetch user for prefill
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

    // Create Razorpay 1CC order
    const razorpayOrder = await createRazorpay1CCOrder(
      total,
      orderNumber,
      lineItems,
      shippingCharge,
      {
        name: user?.fullName || '',
        email: user?.email || '',
        contact: user?.phone || '',
      },
      { orderId: order.id, userId: req.user.userId }
    );

    await prisma.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: razorpayOrder.id },
    });

    res.status(201).json({
      success: true,
      data: {
        order,
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
        },
      },
      message: 'Order created. Complete payment via Razorpay.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/guest/razorpay-checkout
 * Guest: create pending order + Razorpay 1CC order (no address needed upfront)
 */
export async function createGuestRazorpayCheckout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { items, couponCode, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    // Re-fetch product details from DB
    let subtotal = 0;
    const orderItems: any[] = [];
    const lineItems: { name: string; quantity: number; amount: number }[] = [];

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        throw new AppError('Invalid item in order', 400);
      }
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { images: { where: { isPrimary: true }, take: 1 } },
      });
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 400);

      let variant = null;
      if (item.variantId) {
        variant = await prisma.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant) throw new AppError(`Variant not found: ${item.variantId}`, 400);
      }

      const unitPrice = variant
        ? Number(product.discountPrice || product.price) + Number(variant.additionalPrice)
        : Number(product.discountPrice || product.price);
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        productName: product.name,
        productImage: product.images[0]?.imageUrl || '',
        size: variant?.size || 'Standard',
        color: variant?.color || 'Default',
        price: unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
      });

      lineItems.push({
        name: `${product.name}${variant ? ` (${variant.size}/${variant.color})` : ''}`,
        quantity: item.quantity,
        amount: Math.round(unitPrice * item.quantity * 100),
      });
    }

    // Apply coupon
    let discount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (
        coupon && coupon.isActive &&
        coupon.usedCount < coupon.usageLimit &&
        new Date() >= coupon.validFrom &&
        new Date() <= coupon.validUntil &&
        subtotal >= Number(coupon.minPurchase)
      ) {
        if (coupon.discountType === 'PERCENTAGE') {
          discount = subtotal * (Number(coupon.discountValue) / 100);
          if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
        } else {
          discount = Number(coupon.discountValue);
        }
        await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
    }

    const shippingCharge = subtotal >= 999 ? 0 : 99;
    const tax = 0; // GST already included in product prices
    const total = subtotal - discount + shippingCharge + tax;
    const orderNumber = generateOrderNumber();

    // Create pending guest order (no contact/address yet — Razorpay 1CC collects it)
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: null,
        addressId: null,
        subtotal,
        discount,
        shippingCharge,
        tax,
        total,
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING',
        notes: notes || null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    // Create Razorpay 1CC order
    const razorpayOrder = await createRazorpay1CCOrder(
      total,
      orderNumber,
      lineItems,
      shippingCharge,
      undefined,
      { orderId: order.id }
    );

    await prisma.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: razorpayOrder.id },
    });

    res.status(201).json({
      success: true,
      data: {
        order,
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
        },
      },
      message: 'Order created. Complete payment via Razorpay.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/verify-1cc-payment
 * Verify payment for 1CC checkout (auth user) — also fetches shipping address from Razorpay
 */
export async function verify1CCPayment(
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

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      await prisma.order.updateMany({ where: { razorpayOrderId: razorpay_order_id }, data: { paymentStatus: 'FAILED' } });
      throw new AppError('Payment verification failed', 400);
    }

    const existingOrder = await prisma.order.findFirst({
      where: { razorpayOrderId: razorpay_order_id },
      include: { items: true },
    });
    if (!existingOrder) throw new NotFoundError('Order');
    if (existingOrder.userId && existingOrder.userId !== req.user.userId) {
      throw new AppError('Unauthorized', 403);
    }

    // Verify amount
    const paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
    const paidAmountInRupees = Number(paymentDetails.amount) / 100;
    if (Math.abs(paidAmountInRupees - Number(existingOrder.total)) > 0.01) {
      await prisma.order.update({ where: { id: existingOrder.id }, data: { paymentStatus: 'FAILED' } });
      throw new AppError('Payment amount mismatch', 400);
    }

    // Fetch shipping address from Razorpay 1CC order
    let shippingAddress: any = null;
    let customerInfo: any = null;
    try {
      const rzpOrder: any = await fetchRazorpayOrder(razorpay_order_id);
      if (rzpOrder?.customer_details) {
        customerInfo = rzpOrder.customer_details;
        shippingAddress = rzpOrder.customer_details?.shipping_address;
      }
    } catch (e) {
      logger.warn('Could not fetch 1CC shipping address from Razorpay:', e);
    }

    // Build address update: save to user's addresses if possible, or store as guest fields
    let addressId: string | null = null;
    const guestFields: any = {};

    if (shippingAddress && existingOrder.userId) {
      // Create a new address on the user's account from Razorpay data
      try {
        const newAddr = await prisma.address.create({
          data: {
            userId: existingOrder.userId,
            fullName: customerInfo?.name || shippingAddress.name || '',
            phone: customerInfo?.contact || '',
            addressLine1: shippingAddress.line1 || shippingAddress.addressLine1 || '',
            addressLine2: shippingAddress.line2 || shippingAddress.addressLine2 || '',
            city: shippingAddress.city || '',
            state: shippingAddress.state || '',
            pinCode: shippingAddress.zipcode || shippingAddress.pincode || '',
            isDefault: false,
          },
        });
        addressId = newAddr.id;
      } catch (e) {
        logger.warn('Failed to create address from 1CC data:', e);
      }
    } else if (shippingAddress) {
      // Guest: store in guest fields
      guestFields.guestName = customerInfo?.name || shippingAddress.name || '';
      guestFields.guestEmail = customerInfo?.email || '';
      guestFields.guestPhone = customerInfo?.contact || '';
      guestFields.guestAddressLine1 = shippingAddress.line1 || shippingAddress.addressLine1 || '';
      guestFields.guestAddressLine2 = shippingAddress.line2 || shippingAddress.addressLine2 || '';
      guestFields.guestCity = shippingAddress.city || '';
      guestFields.guestState = shippingAddress.state || '';
      guestFields.guestPincode = shippingAddress.zipcode || shippingAddress.pincode || '';
    }

    const order = await prisma.$transaction(async (tx: any) => {
      const updatedOrder = await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          ...(addressId ? { addressId } : {}),
          ...guestFields,
        },
        include: { items: true },
      });

      for (const item of updatedOrder.items) {
        if (item.variantId) {
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { decrement: item.quantity } } });
        }
        await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
      }

      if (existingOrder.userId) {
        const cart = await tx.cart.findUnique({ where: { userId: existingOrder.userId } });
        if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return updatedOrder;
    });

    // Send confirmation email
    const email = customerInfo?.email || (existingOrder.userId
      ? (await prisma.user.findUnique({ where: { id: existingOrder.userId } }))?.email
      : null);
    if (email) {
      const name = customerInfo?.name || 'Customer';
      sendOrderConfirmationEmail(
        email, name, existingOrder.orderNumber, Number(existingOrder.total),
        orderItems_for_email(order.items)
      );
    }

    res.json({ success: true, data: order, message: 'Payment verified successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/guest/verify-1cc-payment
 * Verify payment for guest 1CC checkout — fetches shipping address from Razorpay
 */
export async function verifyGuest1CCPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new AppError('Missing payment verification details', 400);
    }

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      await prisma.order.updateMany({ where: { razorpayOrderId: razorpay_order_id }, data: { paymentStatus: 'FAILED' } });
      throw new AppError('Payment verification failed', 400);
    }

    const existingOrder = await prisma.order.findFirst({
      where: { razorpayOrderId: razorpay_order_id, userId: null },
      include: { items: true },
    });
    if (!existingOrder) throw new NotFoundError('Order');

    // Verify amount
    const paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
    const paidAmountInRupees = Number(paymentDetails.amount) / 100;
    if (Math.abs(paidAmountInRupees - Number(existingOrder.total)) > 0.01) {
      await prisma.order.update({ where: { id: existingOrder.id }, data: { paymentStatus: 'FAILED' } });
      throw new AppError('Payment amount mismatch', 400);
    }

    // Fetch customer + shipping from Razorpay 1CC
    let customerInfo: any = null;
    let shippingAddress: any = null;
    try {
      const rzpOrder: any = await fetchRazorpayOrder(razorpay_order_id);
      if (rzpOrder?.customer_details) {
        customerInfo = rzpOrder.customer_details;
        shippingAddress = rzpOrder.customer_details?.shipping_address;
      }
    } catch (e) {
      logger.warn('Could not fetch 1CC shipping address from Razorpay:', e);
    }

    const guestFields: any = {};
    if (customerInfo || shippingAddress) {
      guestFields.guestName = customerInfo?.name || shippingAddress?.name || '';
      guestFields.guestEmail = customerInfo?.email || '';
      guestFields.guestPhone = customerInfo?.contact || '';
      guestFields.guestAddressLine1 = shippingAddress?.line1 || shippingAddress?.addressLine1 || '';
      guestFields.guestAddressLine2 = shippingAddress?.line2 || shippingAddress?.addressLine2 || '';
      guestFields.guestCity = shippingAddress?.city || '';
      guestFields.guestState = shippingAddress?.state || '';
      guestFields.guestPincode = shippingAddress?.zipcode || shippingAddress?.pincode || '';
    }

    const order = await prisma.$transaction(async (tx: any) => {
      const updatedOrder = await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          ...guestFields,
        },
        include: { items: true },
      });

      for (const item of updatedOrder.items) {
        if (item.variantId) {
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { decrement: item.quantity } } });
        }
        await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
      }

      return updatedOrder;
    });

    // Send confirmation email
    const email = guestFields.guestEmail || customerInfo?.email;
    if (email) {
      sendOrderConfirmationEmail(
        email, guestFields.guestName || 'Customer', existingOrder.orderNumber,
        Number(existingOrder.total), orderItems_for_email(order.items)
      );
    }

    res.json({ success: true, data: order, message: 'Payment verified successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/orders/track/:orderNumber
 * Public order tracking — no authentication required.
 * Strips sensitive payment fields before responding.
 */
export async function trackOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { orderNumber } = req.params;
    const { email } = req.query;

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ success: false, message: 'Email address is required to track your order.' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber: orderNumber.toUpperCase() },
      include: {
        user: { select: { email: true } },
        items: {
          select: {
            id: true,
            productName: true,
            productImage: true,
            size: true,
            color: true,
            price: true,
            quantity: true,
            subtotal: true,
          },
        },
        address: {
          select: {
            fullName: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            pinCode: true,
            phone: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundError('Order');

    // Verify email — compare against user email (registered) or guest email
    const orderEmail = (order.user?.email || order.guestEmail || '').toLowerCase().trim();
    if (!orderEmail || orderEmail !== email.toLowerCase().trim()) {
      throw new NotFoundError('Order'); // Don't reveal order exists with a different email
    }

    // Return only what's needed for public tracking
    const publicOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      discount: order.discount,
      shippingCharge: order.shippingCharge,
      total: order.total,
      trackingNumber: order.trackingNumber,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items,
      address: order.address,
      // Guest info — mask email for privacy
      guestName: order.guestName,
      guestEmail: order.guestEmail
        ? order.guestEmail.replace(/(.{2}).+(@.+)/, '$1***$2')
        : null,
      guestPhone: order.guestPhone
        ? order.guestPhone.replace(/(\d{2})\d+(\d{2})/, '$1*****$2')
        : null,
      guestAddressLine1: order.guestAddressLine1,
      guestAddressLine2: order.guestAddressLine2,
      guestCity: order.guestCity,
      guestState: order.guestState,
      guestPincode: order.guestPincode,
    };

    res.json({ success: true, data: publicOrder });
  } catch (error) {
    next(error);
  }
}

/** Helper: map order items to email format */
function orderItems_for_email(items: any[]) {
  return items.map((i: any) => ({ name: i.productName, quantity: i.quantity, price: Number(i.subtotal) }));
}
