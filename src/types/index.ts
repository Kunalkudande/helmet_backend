import { Request } from 'express';

/* ──────────────────── Extend Express Request ──────────────────── */

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

/* ──────────────────── API Response Types ──────────────────── */

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/* ──────────────────── Pagination ──────────────────── */

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/* ──────────────────── Product Filters ──────────────────── */

export interface ProductFilters {
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  certification?: string;
  search?: string;
  inStock?: boolean;
}

/* ──────────────────── Order Types ──────────────────── */

export interface OrderCalculation {
  subtotal: number;
  discount: number;
  shippingCharge: number;
  tax: number;
  total: number;
}

/* ──────────────────── Email Types ──────────────────── */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/* ──────────────────── Cloudinary Upload Result ──────────────────── */

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

/* ──────────────────── Dashboard Stats ──────────────────── */

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  recentOrders: unknown[];
  lowStockProducts: unknown[];
  monthlySales: { month: string; revenue: number; orders: number }[];
}
