import { z } from 'zod';

/* ────────────────────────────────────────── AUTH ──── */

export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number')
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

/* ────────────────────────────────────── PRODUCT ──── */

export const createProductSchema = z.object({
  name: z.string().min(3, 'Product name must be at least 3 characters').max(200),
  brand: z.string().min(1, 'Brand is required'),
  category: z.enum(['FULL_FACE', 'HALF_FACE', 'OPEN_FACE', 'MODULAR']),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  price: z.number().positive('Price must be greater than 0'),
  discountPrice: z.number().positive('Discount price must be greater than 0').optional().nullable(),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  sku: z.string().min(3, 'SKU must be at least 3 characters'),
  specifications: z
    .object({
      weight: z.string().min(1, 'Weight is required'),
      material: z.string().min(1, 'Material is required'),
      certifications: z.array(z.string()),
      visorType: z.string().min(1, 'Visor type is required'),
      ventilation: z.boolean(),
      features: z.array(z.string()),
    })
    .optional(),
  variants: z
    .array(
      z.object({
        size: z.enum(['S', 'M', 'L', 'XL', 'XXL']),
        color: z.string().min(1, 'Color is required'),
        stock: z.number().int().min(0, 'Stock cannot be negative'),
        additionalPrice: z.number().min(0).optional(),
      })
    )
    .optional(),
});

export const updateProductSchema = createProductSchema.partial();

/* ────────────────────────────────────── ADDRESS ──── */

export const addressSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit phone number'),
  addressLine1: z.string().min(5, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pinCode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
  addressType: z.enum(['HOME', 'OFFICE']),
  isDefault: z.boolean().optional(),
});

/* ──────────────────────────────────────── ORDER ──── */

export const createOrderSchema = z.object({
  addressId: z.string().uuid('Invalid address ID'),
  paymentMethod: z.enum(['RAZORPAY', 'COD']),
  couponCode: z.string().optional(),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, 'Order ID is required'),
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
});

export const updateOrderStatusSchema = z.object({
  orderStatus: z.enum([
    'PENDING',
    'CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED',
  ]),
  trackingNumber: z.string().optional(),
});

/* ────────────────────────────────────── REVIEW ──── */

export const createReviewSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  rating: z.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  comment: z.string().min(10, 'Comment must be at least 10 characters').max(1000),
});

/* ─────────────────────────────────────── CART ──── */

export const addToCartSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid('Invalid variant ID').optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Maximum 10 items per product'),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Maximum 10 items per product'),
});

/* ────────────────────────────────────── COUPON ──── */

export const couponSchema = z.object({
  code: z.string().min(3, 'Coupon code must be at least 3 characters').max(20),
  description: z.string().min(5, 'Description is required'),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.number().positive('Discount must be greater than 0'),
  minPurchase: z.number().min(0, 'Minimum purchase cannot be negative'),
  maxDiscount: z.number().positive('Max discount must be positive').optional().nullable(),
  usageLimit: z.number().int().positive('Usage limit must be positive'),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
});

/* ──────────────────────────────────────── USER ──── */

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit phone number')
    .optional(),
});

/* ────────────────────────────────── NEWSLETTER ──── */

export const newsletterSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

/* ──────────────────────────────── REVIEW APPROVAL ──── */

export const approveReviewSchema = z.object({
  isApproved: z.boolean(),
});

/* ────────────────────────────────── CONTACT ──── */

export const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  subject: z.string().min(5, 'Subject is required'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000),
});
