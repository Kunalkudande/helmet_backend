import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import { hashPassword, comparePassword } from '../utils/bcrypt';
import { AppError, NotFoundError } from '../middleware/errorHandler';

/**
 * GET /api/users/profile
 * Get user profile
 */
export async function getProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
        addresses: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) throw new NotFoundError('User');

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/users/profile
 * Update user profile
 */
export async function updateProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { fullName, phone } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { fullName, phone },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isVerified: true,
      },
    });

    res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/users/change-password
 * Change user password
 */
export async function changePassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user) throw new NotFoundError('User');

    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      throw new AppError('Current password is incorrect', 400);
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { password: hashedPassword },
    });

    res.json({
      success: true,
      data: null,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
}

/* ─────────────────── ADDRESS MANAGEMENT ─────────────────── */

/**
 * GET /api/users/addresses
 */
export async function getAddresses(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const addresses = await prisma.address.findMany({
      where: { userId: req.user.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ success: true, data: addresses });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/users/addresses
 */
export async function addAddress(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const addressData = req.body;

    // If this is set as default, unset all others
    if (addressData.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.userId },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        ...addressData,
        userId: req.user.userId,
      },
    });

    res.status(201).json({
      success: true,
      data: address,
      message: 'Address added successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/users/addresses/:id
 */
export async function updateAddress(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.userId) {
      throw new NotFoundError('Address');
    }

    if (req.body.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.userId },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: req.body,
    });

    res.json({
      success: true,
      data: address,
      message: 'Address updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/users/addresses/:id
 */
export async function deleteAddress(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user.userId) {
      throw new NotFoundError('Address');
    }

    await prisma.address.delete({ where: { id } });

    res.json({
      success: true,
      data: null,
      message: 'Address deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/* ─────────────────── WISHLIST ─────────────────── */

/**
 * GET /api/users/wishlist
 */
export async function getWishlist(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const wishlist = await prisma.wishlist.findMany({
      where: { userId: req.user.userId },
      include: {
        product: {
          include: {
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    res.json({ success: true, data: wishlist });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/users/wishlist/:productId
 */
export async function addToWishlist(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { productId } = req.params;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product');

    // Check if already in wishlist
    const existing = await prisma.wishlist.findUnique({
      where: {
        userId_productId: {
          userId: req.user.userId,
          productId,
        },
      },
    });

    if (existing) {
      res.json({
        success: true,
        data: existing,
        message: 'Product already in wishlist',
      });
      return;
    }

    const wishlistItem = await prisma.wishlist.create({
      data: {
        userId: req.user.userId,
        productId,
      },
    });

    res.status(201).json({
      success: true,
      data: wishlistItem,
      message: 'Added to wishlist',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/users/wishlist/:productId
 */
export async function removeFromWishlist(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { productId } = req.params;

    await prisma.wishlist.deleteMany({
      where: {
        userId: req.user.userId,
        productId,
      },
    });

    res.json({
      success: true,
      data: null,
      message: 'Removed from wishlist',
    });
  } catch (error) {
    next(error);
  }
}

/* ─────────────────── REVIEWS ─────────────────── */

/**
 * POST /api/products/:productId/reviews
 */
export async function createReview(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { productId } = req.params;
    const { orderId, rating, title, comment } = req.body;

    // Verify the user purchased this product in this order
    const orderItem = await prisma.orderItem.findFirst({
      where: {
        orderId,
        productId,
        order: {
          userId: req.user.userId,
          orderStatus: 'DELIVERED',
        },
      },
    });

    if (!orderItem) {
      throw new AppError('You can only review products from delivered orders', 400);
    }

    // Check if already reviewed
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_productId_orderId: {
          userId: req.user.userId,
          productId,
          orderId,
        },
      },
    });

    if (existingReview) {
      throw new AppError('You have already reviewed this product for this order', 400);
    }

    const review = await prisma.review.create({
      data: {
        productId,
        userId: req.user.userId,
        orderId,
        rating,
        title,
        comment,
        isVerifiedPurchase: true,
      },
      include: {
        user: { select: { fullName: true } },
      },
    });

    // Update product rating
    const allReviews = await prisma.review.findMany({
      where: { productId, isApproved: true },
      select: { rating: true },
    });

    if (allReviews.length > 0) {
      const avgRating =
        allReviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / allReviews.length;
      await prisma.product.update({
        where: { id: productId },
        data: {
          rating: Math.round(avgRating * 100) / 100,
          totalReviews: allReviews.length,
        },
      });
    }

    res.status(201).json({
      success: true,
      data: review,
      message: 'Review submitted for approval',
    });
  } catch (error) {
    next(error);
  }
}
