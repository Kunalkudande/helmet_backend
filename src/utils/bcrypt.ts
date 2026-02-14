import bcrypt from 'bcryptjs';

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

/**
 * Hash a plain-text password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plain-text password with a hashed password
 */
export async function comparePassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}
