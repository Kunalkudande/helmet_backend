import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import { AppError, NotFoundError } from '../middleware/errorHandler';

/**
 * GET /api/cart
 * Get the authenticated user's cart
 */
export async function getCart(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    let cart = await prisma.cart.findUnique({
      where: { userId: req.user.userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            variant: true,
          },
          orderBy: { addedAt: 'desc' },
        },
      },
    });

    // Create cart if it doesn't exist
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: req.user.userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: { where: { isPrimary: true }, take: 1 },
                },
              },
              variant: true,
            },
          },
        },
      });
    }

    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/cart/items
 * Add an item to the cart
 */
export async function addToCart(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { productId, variantId, quantity } = req.body;

    // Verify product exists and is active
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });

    if (!product || !product.isActive) {
      throw new NotFoundError('Product');
    }

    // Check variant if provided
    if (variantId) {
      const variant = product.variants.find((v: { id: string; stock: number }) => v.id === variantId);
      if (!variant) throw new NotFoundError('Product variant');
      if (variant.stock < quantity) {
        throw new AppError('Insufficient stock for selected variant', 400);
      }
    } else if (product.stock < quantity) {
      throw new AppError('Insufficient stock', 400);
    }

    // Get or create cart
    let cart = await prisma.cart.findUnique({
      where: { userId: req.user.userId },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: req.user.userId },
      });
    }

    // Check if item already in cart
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
        variantId: variantId || null,
      },
    });

    if (existingItem) {
      // Update quantity
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + quantity },
      });
    } else {
      // Add new item
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          variantId: variantId || null,
          quantity,
        },
      });
    }

    // Return updated cart
    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            variant: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: updatedCart,
      message: 'Item added to cart',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/cart/items/:itemId
 * Update cart item quantity
 */
export async function updateCartItem(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { itemId } = req.params;
    const { quantity } = req.body;

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, product: true, variant: true },
    });

    if (!cartItem || cartItem.cart.userId !== req.user.userId) {
      throw new NotFoundError('Cart item');
    }

    // Check stock
    const available = cartItem.variant
      ? cartItem.variant.stock
      : cartItem.product.stock;

    if (quantity > available) {
      throw new AppError(`Only ${available} items available`, 400);
    }

    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    // Return updated cart
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            variant: true,
          },
        },
      },
    });

    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/cart/items/:itemId
 * Remove an item from the cart
 */
export async function removeFromCart(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { itemId } = req.params;

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });

    if (!cartItem || cartItem.cart.userId !== req.user.userId) {
      throw new NotFoundError('Cart item');
    }

    await prisma.cartItem.delete({ where: { id: itemId } });

    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            variant: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: cart,
      message: 'Item removed from cart',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/cart
 * Clear the entire cart
 */
export async function clearCart(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.userId },
    });

    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    res.json({
      success: true,
      data: null,
      message: 'Cart cleared',
    });
  } catch (error) {
    next(error);
  }
}
