// Simple in-memory rate limiter (no external deps)
// For production, consider Redis-based solution

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    this.maxRequests = options.maxRequests || DEFAULT_MAX_REQUESTS;
    this.requests = new Map(); // key -> { count, resetTime }
  }

  isAllowed(key) {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (record.count >= this.maxRequests) {
      return false;
    }

    record.count++;
    return true;
  }

  getRemainingRequests(key) {
    const record = this.requests.get(key);
    if (!record || Date.now() > record.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - record.count);
  }

  // Cleanup old entries periodically
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// Pre-configured limiters
export const connectionLimiter = new RateLimiter({
  windowMs: 60 * 1000,    // 1 minute
  maxRequests: 20         // 20 connections per IP per minute
});

export const roomCreationLimiter = new RateLimiter({
  windowMs: 60 * 1000,    // 1 minute
  maxRequests: 5          // 5 rooms per IP per minute
});

export const joinLimiter = new RateLimiter({
  windowMs: 60 * 1000,    // 1 minute
  maxRequests: 30         // 30 join attempts per IP per minute
});

export const signalLimiter = new RateLimiter({
  windowMs: 1000,         // 1 second
  maxRequests: 50         // 50 signals per socket per second
});

// Cleanup every minute
setInterval(() => {
  connectionLimiter.cleanup();
  roomCreationLimiter.cleanup();
  joinLimiter.cleanup();
  signalLimiter.cleanup();
}, 60 * 1000);

export { RateLimiter };
