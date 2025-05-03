// Cache utility

// Cache types
type CacheOptions = {
  maxAge?: number // in milliseconds
}

// In-memory cache
const memoryCache = new Map<string, { value: any; timestamp: number; maxAge: number }>()

// Set cache item
export function setCacheItem<T>(key: string, value: T, options: CacheOptions = {}): void {
  const maxAge = options.maxAge || 5 * 60 * 1000 // Default: 5 minutes

  memoryCache.set(key, {
    value,
    timestamp: Date.now(),
    maxAge,
  })
}

// Get cache item
export function getCacheItem<T>(key: string): T | null {
  const item = memoryCache.get(key)

  if (!item) {
    return null
  }

  // Check if item is expired
  if (Date.now() - item.timestamp > item.maxAge) {
    memoryCache.delete(key)
    return null
  }

  return item.value as T
}

// Clear cache item
export function clearCacheItem(key: string): void {
  memoryCache.delete(key)
}

// Clear all cache
export function clearCache(): void {
  memoryCache.clear()
}

// Get cache size
export function getCacheSize(): number {
  return memoryCache.size
}

// Get cache keys
export function getCacheKeys(): string[] {
  return Array.from(memoryCache.keys())
}

// Check if cache has key
export function hasCacheKey(key: string): boolean {
  return memoryCache.has(key)
}
