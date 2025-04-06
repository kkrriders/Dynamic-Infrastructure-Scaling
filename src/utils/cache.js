const logger = require('./logger');

/**
 * Simple in-memory cache implementation
 * For production, consider using Redis or another distributed cache
 */
class Cache {
  constructor(options = {}) {
    this.ttl = options.ttl || 60 * 1000; // Default TTL: 60 seconds
    this.checkPeriod = options.checkPeriod || 5 * 60 * 1000; // Default cleanup: 5 minutes
    this.maxSize = options.maxSize || 100; // Default max items: 100
    this.cache = new Map();
    
    // Setup periodic cache cleanup
    this.interval = setInterval(() => this.cleanup(), this.checkPeriod);
  }
  
  /**
   * Set a value in the cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to store
   * @param {number} [ttl] - Time to live in ms, overrides default if provided
   */
  set(key, value, ttl) {
    // Ensure cache doesn't grow too large
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }
    
    const expires = Date.now() + (ttl || this.ttl);
    this.cache.set(key, {
      value,
      expires
    });
    
    logger.debug(`Cache set: ${key}`, { cacheSize: this.cache.size });
    return value;
  }
  
  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    
    // Return null if item doesn't exist or has expired
    if (!item || item.expires < Date.now()) {
      if (item) {
        // Clean up expired item
        this.cache.delete(key);
        logger.debug(`Cache expired: ${key}`);
      }
      return null;
    }
    
    logger.debug(`Cache hit: ${key}`);
    return item.value;
  }
  
  /**
   * Remove an item from the cache
   * @param {string} key - Cache key to delete
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug(`Cache deleted: ${key}`);
    }
    return deleted;
  }
  
  /**
   * Get a value from cache if it exists, otherwise compute and cache it
   * @param {string} key - Cache key
   * @param {Function} fn - Function to compute value if not in cache
   * @param {number} [ttl] - Optional TTL override
   * @returns {Promise<any>} Resolved with cached or computed value
   */
  async getOrSet(key, fn, ttl) {
    const cachedValue = this.get(key);
    
    if (cachedValue !== null) {
      return cachedValue;
    }
    
    try {
      logger.debug(`Cache miss: ${key}`);
      const value = await fn();
      return this.set(key, value, ttl);
    } catch (error) {
      logger.error(`Error computing value for cache key ${key}: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Clear all items from the cache
   */
  clear() {
    this.cache.clear();
    logger.debug('Cache cleared');
  }
  
  /**
   * Remove expired items from the cache
   */
  cleanup() {
    const now = Date.now();
    let count = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expires < now) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.debug(`Cache cleanup: removed ${count} expired items`, { 
        cacheSize: this.cache.size 
      });
    }
  }
  
  /**
   * Evict the oldest item from the cache when it reaches max size
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expires < oldestTime) {
        oldestKey = key;
        oldestTime = item.expires;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Cache eviction: removed oldest item ${oldestKey}`);
    }
  }
  
  /**
   * Destroy the cache instance and clear cleanup interval
   */
  destroy() {
    clearInterval(this.interval);
    this.clear();
    logger.debug('Cache destroyed');
  }
}

// Create and export a singleton instance
const metricsCache = new Cache({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 500 // Maximum 500 items
});

const predictionsCache = new Cache({
  ttl: 15 * 60 * 1000, // 15 minutes
  maxSize: 200 // Maximum 200 items
});

module.exports = {
  metricsCache,
  predictionsCache,
  Cache  // Export class for creating custom caches
}; 