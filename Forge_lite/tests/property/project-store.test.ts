import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('mock-documents'),
  },
}));

// Mock electron-store
const storeData = new Map<string, any>();
const mockStore = {
  get: vi.fn().mockImplementation((key, defaultValue) => {
    return storeData.has(key) ? storeData.get(key) : defaultValue;
  }),
  set: vi.fn().mockImplementation((key, value) => {
    storeData.set(key, value);
  }),
};
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => mockStore),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  readdir: vi.fn().mockResolvedValue([]),
}));

// Import target under test after mocks are registered
import { saveProject, listProjects } from '../../src/main/project-store';
import { Project } from '../../src/renderer/types';

describe('Property 9: ProjectStore LRU Eviction', () => {
  beforeEach(() => {
    storeData.clear();
    vi.clearAllMocks();
  });

  it('should maintain at most 20 projects and evict the oldest one by updatedAt', async () => {
    // We generate a list of N projects (N between 21 and 40)
    // with random UUIDs and distinct updatedAt timestamps.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 21, max: 35 }),
        async (numProjects) => {
          storeData.clear();
          vi.clearAllMocks();

          // Generate list of projects with incremented dates to ensure strict ordering
          const projects: Project[] = [];
          for (let i = 0; i < numProjects; i++) {
            // Distinct ISO dates
            const date = new Date(2026, 5, 14, 12, i, 0).toISOString();
            projects.push({
              id: `project-${i}`,
              name: `Project ${i}`,
              brief: {
                version: '1.0',
                id: `brief-${i}`,
                createdAt: date,
                siteType: 'landing',
                pages: [],
                style: null,
                targetAudience: 'users',
                brandName: `Brand ${i}`,
                colorPalette: [],
                language: 'en',
              },
              template: 'vanilla',
              provider: 'ollama',
              model: 'gemma',
              createdAt: date,
              updatedAt: date,
              filesDir: '',
              snapshotStack: [],
            });
          }

          // Save projects sequentially
          for (const project of projects) {
            await saveProject(project);
          }

          // Retrieve active projects from metadata list
          const list = listProjects();

          // 1. Verify list size is exactly 20
          expect(list.length).toBe(20);

          // 2. Verify sorted order by updatedAt descending
          for (let i = 0; i < list.length - 1; i++) {
            const dateCurrent = new Date(list[i].updatedAt).getTime();
            const dateNext = new Date(list[i + 1].updatedAt).getTime();
            expect(dateCurrent).toBeGreaterThan(dateNext);
          }

          // 3. Verify that the evicted projects are the oldest ones
          const activeIds = new Set(list.map((p) => p.id));
          const expectedActiveIds = new Set(
            projects
              .slice(-20) // The last 20 pushed should be the most recently updated
              .map((p) => p.id)
          );

          expect(activeIds).toEqual(expectedActiveIds);

          // 4. Verify fs.rm was called to delete folder of evicted projects
          const evictedCount = numProjects - 20;
          expect(fs.rm).toHaveBeenCalledTimes(evictedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
