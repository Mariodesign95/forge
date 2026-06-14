/**
 * SnapshotManager — Manages the Undo/Redo stacks for iteration snapshots.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { IterationSnapshot } from '../renderer/types';

export const MAX_SNAPSHOT_SIZE = 10;

interface ProjectSnapshotStack {
  undoStack: IterationSnapshot[];
  redoStack: IterationSnapshot[];
}

export class SnapshotManager {
  // Store stacks per projectId
  private readonly projectStacks = new Map<string, ProjectSnapshotStack>();

  /**
   * Helper to ensure the snapshot stacks for a project are initialised.
   */
  private getOrCreateStack(projectId: string): ProjectSnapshotStack {
    let stack = this.projectStacks.get(projectId);
    if (!stack) {
      stack = { undoStack: [], redoStack: [] };
      this.projectStacks.set(projectId, stack);
    }
    return stack;
  }

  /**
   * Pushes a new snapshot onto the undo stack.
   * Clears the redo stack (Requirement 11.3).
   * Evicts the oldest snapshot if the undo stack exceeds MAX_SNAPSHOT_SIZE (Requirement 11.4).
   */
  push(projectId: string, snapshot: IterationSnapshot): void {
    const stack = this.getOrCreateStack(projectId);
    
    // Clear redo stack on new operation
    stack.redoStack = [];
    
    // Push new snapshot to undo stack
    stack.undoStack.push(snapshot);
    
    // Maintain maximum stack size (Requirement 11.4)
    if (stack.undoStack.length > MAX_SNAPSHOT_SIZE) {
      stack.undoStack.shift();
    }
  }

  /**
   * Performs an Undo operation (Requirement 11.2).
   * Moves the current state to the redo stack and returns the previous snapshot.
   */
  undo(projectId: string): IterationSnapshot | null {
    const stack = this.getOrCreateStack(projectId);
    if (stack.undoStack.length === 0) {
      return null;
    }
    
    const snapshot = stack.undoStack.pop()!;
    stack.redoStack.push(snapshot);
    
    return snapshot;
  }

  /**
   * Performs a Redo operation (Requirement 11.3).
   * Restores the next snapshot from the redo stack.
   */
  redo(projectId: string): IterationSnapshot | null {
    const stack = this.getOrCreateStack(projectId);
    if (stack.redoStack.length === 0) {
      return null;
    }
    
    const snapshot = stack.redoStack.pop()!;
    stack.undoStack.push(snapshot);
    return snapshot;
  }

  /**
   * Returns whether an Undo operation is possible.
   * Requirement 11.5
   */
  canUndo(projectId: string): boolean {
    const stack = this.projectStacks.get(projectId);
    return stack ? stack.undoStack.length > 0 : false;
  }

  /**
   * Returns whether a Redo operation is possible.
   * Requirement 11.6
   */
  canRedo(projectId: string): boolean {
    const stack = this.projectStacks.get(projectId);
    return stack ? stack.redoStack.length > 0 : false;
  }

  /**
   * Completely clears the stacks for a project (e.g. on deletion or close).
   */
  clear(projectId: string): void {
    this.projectStacks.delete(projectId);
  }
}

// Export singleton instance
export const snapshotManager = new SnapshotManager();
