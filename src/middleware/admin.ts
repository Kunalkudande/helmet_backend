import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';

/**
 * Admin middleware — restricts route to ADMIN role only
 * Must be used AFTER the authenticate middleware
 * Verifies role from the database (not just the JWT) to handle role changes immediately
 */
export async function adminOnly(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  // Quick JWT-level check first
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.',
    });
    return;
  }

  // SECURITY: Re-verify role from database to handle role revocations
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true },
    });

    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.',
      });
      return;
    }
  } catch {
    res.status(500).json({
      success: false,
      error: 'Authorization check failed',
    });
    return;
  }

  next();
}
