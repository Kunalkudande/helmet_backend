/**
 * Cache service — no-op stubs
 * These functions exist so that controller code compiles without changes.
 * They always return null / do nothing.
 */

export async function getCache<T>(_key: string): Promise<T | null> {
  return null;
}

export async function setCache(
  _key: string,
  _data: unknown,
  _ttl: number = 300
): Promise<void> {
  // no-op
}

export async function deleteCache(_key: string): Promise<void> {
  // no-op
}

export async function deleteCachePattern(_pattern: string): Promise<void> {
  // no-op
}
