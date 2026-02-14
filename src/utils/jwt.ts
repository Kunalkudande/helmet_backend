import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { logger } from './logger';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Generate an access token (short-lived)
 */
export function generateAccessToken(payload: TokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not defined');

  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRE || '30m') as string & SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign(payload, secret, options);
}

/**
 * Generate a refresh token (long-lived)
 */
export function generateRefreshToken(payload: TokenPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not defined');

  const options: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRE || '7d') as string & SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign(payload, secret, options);
}

/**
 * Verify an access token and return the payload
 */
export function verifyAccessToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not defined');

  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
  } catch (error) {
    logger.debug('Access token verification failed');
    throw error;
  }
}

/**
 * Verify a refresh token and return the payload
 */
export function verifyRefreshToken(token: string): TokenPayload {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not defined');

  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
  } catch (error) {
    logger.debug('Refresh token verification failed');
    throw error;
  }
}

/**
 * Generate a cryptographically secure random token for email verification / password reset
 * Uses Node.js crypto module for better security than Math.random()
 */
export function generateRandomToken(length: number = 64): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}
