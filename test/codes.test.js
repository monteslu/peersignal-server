import { describe, it, expect } from 'vitest';
import { generateCode, normalizeCode, validateCode } from '../server/codes.js';

describe('generateCode', () => {
  it('should generate xxx-xxx-xxx format', () => {
    const code = generateCode();
    expect(code).toMatch(/^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/);
  });

  it('should not contain confusing characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      expect(code).not.toMatch(/[01ilo]/);
    }
  });

  it('should generate unique codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateCode());
    }
    expect(codes.size).toBe(100);
  });
});

describe('normalizeCode', () => {
  it('should lowercase input', () => {
    expect(normalizeCode('ABC-DEF-GHJ')).toBe('abc-def-ghj');
  });

  it('should trim whitespace', () => {
    expect(normalizeCode('  abc-def-ghj  ')).toBe('abc-def-ghj');
  });

  it('should convert spaces to dashes', () => {
    expect(normalizeCode('abc def ghj')).toBe('abc-def-ghj');
  });
});

describe('validateCode', () => {
  it('should accept valid codes', () => {
    expect(validateCode('abc-def-ghj')).toBe(true);
    expect(validateCode('k7m-p2x-9nf')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(validateCode('abc')).toBe(false);
    expect(validateCode('abc-def')).toBe(false);
    expect(validateCode('abcd-efgh-ijkl')).toBe(false);
    expect(validateCode('')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(validateCode('ABC-DEF-GHJ')).toBe(true);
  });
});
