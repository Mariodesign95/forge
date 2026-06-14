import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SearchCache, SearchResult } from '../../src/main/search-service';

describe('Property 4: SearchCache Idempotency & Normalisation', () => {
  it('should normalized queries and return cached results idempotently', () => {
    const cache = new SearchCache();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(
          fc.record({
            title: fc.string(),
            url: fc.webUrl(),
            snippet: fc.string(),
          })
        ),
        (query, results) => {
          cache.clear();

          // 1. Set results in cache
          cache.set(query, results as SearchResult[]);

          // 2. Get from cache with exact same query should match
          expect(cache.get(query)).toEqual(results);

          // 3. Normalised variations (spaces and case) should also match
          const upperspaced = '   ' + query.toUpperCase() + '   ';
          expect(cache.get(upperspaced)).toEqual(results);

          const lowerMap = query.toLowerCase().replace(/\s+/g, ' ');
          expect(cache.get(lowerMap)).toEqual(results);
        }
      ),
      { numRuns: 200 }
    );
  });
});
