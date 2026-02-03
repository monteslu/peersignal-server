import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../server/rate-limit.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      windowMs: 1000,
      maxRequests: 3
    });
  });

  it('should allow requests under limit', () => {
    expect(limiter.isAllowed('key1')).toBe(true);
    expect(limiter.isAllowed('key1')).toBe(true);
    expect(limiter.isAllowed('key1')).toBe(true);
  });

  it('should block requests over limit', () => {
    limiter.isAllowed('key1');
    limiter.isAllowed('key1');
    limiter.isAllowed('key1');
    expect(limiter.isAllowed('key1')).toBe(false);
  });

  it('should track different keys separately', () => {
    limiter.isAllowed('key1');
    limiter.isAllowed('key1');
    limiter.isAllowed('key1');
    expect(limiter.isAllowed('key1')).toBe(false);
    expect(limiter.isAllowed('key2')).toBe(true);
  });

  it('should report remaining requests', () => {
    expect(limiter.getRemainingRequests('key1')).toBe(3);
    limiter.isAllowed('key1');
    expect(limiter.getRemainingRequests('key1')).toBe(2);
    limiter.isAllowed('key1');
    expect(limiter.getRemainingRequests('key1')).toBe(1);
  });

  it('should reset after window expires', async () => {
    limiter.isAllowed('key1');
    limiter.isAllowed('key1');
    limiter.isAllowed('key1');
    expect(limiter.isAllowed('key1')).toBe(false);
    
    // Wait for window to expire
    await new Promise(r => setTimeout(r, 1100));
    
    expect(limiter.isAllowed('key1')).toBe(true);
  });

  it('should cleanup old entries', async () => {
    limiter.isAllowed('key1');
    await new Promise(r => setTimeout(r, 1100));
    limiter.cleanup();
    expect(limiter.getRemainingRequests('key1')).toBe(3);
  });
});
