import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { maskApiKey } from '../../src/main/key-store';

describe('Property 6: API Key Masking', () => {
  it('should preserve length and reveal only the last 4 characters for keys with length >= 4', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 128 }),
        (key) => {
          const masked = maskApiKey(key);
          
          // 1. Length must be preserved
          expect(masked.length).toBe(key.length);
          
          // 2. Last 4 characters must match the original key
          expect(masked.slice(-4)).toBe(key.slice(-4));
          
          // 3. All other characters must be '•'
          const prefix = masked.slice(0, -4);
          const expectedPrefix = '•'.repeat(key.length - 4);
          expect(prefix).toBe(expectedPrefix);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('should return the key as-is for keys with length < 4', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 3 }),
        (key) => {
          const masked = maskApiKey(key);
          expect(masked).toBe(key);
        }
      ),
      { numRuns: 100 }
    );
  });
});
