import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SnapshotManager, MAX_SNAPSHOT_SIZE } from '../../src/main/snapshot-manager';
import { IterationSnapshot } from '../../src/renderer/types';

// Simple snapshot mock generator
function generateMockSnapshot(id: string): IterationSnapshot {
  return {
    id,
    timestamp: new Date().toISOString(),
    brief: {
      version: '1.0',
      id: 'brief-id',
      createdAt: new Date().toISOString(),
      siteType: 'landing',
      pages: [],
      style: null,
      targetAudience: 'users',
      brandName: 'Test',
      colorPalette: [],
      language: 'en',
    },
    files: {},
    description: `Snapshot ${id}`,
  };
}

describe('Property 7: SnapshotManager Stack Invariants', () => {
  it('should maintain size, clear redo on push, and perform correct round-trips', () => {
    const manager = new SnapshotManager();
    const projectId = 'test-project';

    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 25 }),
        (snapshotIds) => {
          manager.clear(projectId);

          // 1. Verify undoStack size limit <= 10 after pushing elements
          for (const id of snapshotIds) {
            manager.push(projectId, generateMockSnapshot(id));
            expect(manager.canUndo(projectId)).toBe(true);
            expect(manager.canRedo(projectId)).toBe(false); // Redo cleared on push
          }

          // Ensure undo limit is respected
          // Direct check is possible by invoking undo() up to 15 times and verifying we hit limit of 10
          let undosPossible = 0;
          const undoResults: any[] = [];
          while (manager.canUndo(projectId)) {
            const popped = manager.undo(projectId);
            undosPossible++;
            if (popped) {
              undoResults.push(popped);
            }
          }

          expect(undosPossible).toBeLessThanOrEqual(MAX_SNAPSHOT_SIZE);

          // 2. Verify undo -> redo round trip integrity
          let redosPossible = 0;
          const redoResults: any[] = [];
          while (manager.canRedo(projectId)) {
            const restored = manager.redo(projectId);
            redosPossible++;
            if (restored) {
              redoResults.push(restored);
            }
          }

          expect(redosPossible).toBe(undosPossible);
          // The order of redone snapshots must be identical to the popped order reversed
          expect(redoResults.map(r => r.id)).toEqual(undoResults.reverse().map(r => r.id));
        }
      ),
      { numRuns: 200 }
    );
  });
});
