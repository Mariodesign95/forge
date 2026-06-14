/**
 * IPC channel constants for communication between main process and renderer process.
 *
 * Requirements: 9.1, 9.2, 9.3
 */

export const IPC_CHANNELS = {
  // Request/Response Channels (renderer -> main)
  AI: {
    CHAT: 'forge:ai:chat',
    GENERATE: 'forge:ai:generate',
    ABORT: 'forge:ai:abort',
  },
  SEARCH: {
    QUERY: 'forge:search:query',
    FETCH: 'forge:search:fetch',
  },
  EXPORT: {
    ZIP: 'forge:export:zip',
    OPEN_FOLDER: 'forge:export:open-folder',
    PICK_DIRECTORY: 'forge:export:pick-directory',
  },
  KEYS: {
    SAVE: 'forge:keys:save',
    GET_MASKED: 'forge:keys:get-masked',
    DELETE: 'forge:keys:delete',
    HAS: 'forge:keys:has',
  },
  PROJECT: {
    SAVE: 'forge:project:save',
    LOAD: 'forge:project:load',
    LIST: 'forge:project:list',
    DELETE: 'forge:project:delete',
    WRITE_FILE: 'forge:project:write-file',
    READ_FILE: 'forge:project:read-file',
  },
  SNAPSHOT: {
    PUSH: 'forge:snapshot:push',
    UNDO: 'forge:snapshot:undo',
    REDO: 'forge:snapshot:redo',
  },
  SETTINGS: {
    SAVE: 'forge:settings:save',
    LOAD: 'forge:settings:load',
  },
  SHELL: {
    SAVE_LAYOUT: 'forge:shell:layout:save',
    LOAD_LAYOUT: 'forge:shell:layout:load',
  },
  UPDATE: {
    CHECK: 'forge:update:check',
    INSTALL: 'forge:update:install',
  },

  // Push Events Channels (main -> renderer)
  EVENTS: {
    AI_STREAM: 'forge:ai:stream',
    AI_FILE_COMPLETE: 'forge:ai:file-complete',
    AI_PROGRESS: 'forge:ai:progress',
    AI_ERROR: 'forge:ai:error',
    UPDATE_AVAILABLE: 'forge:update:available',
    UPDATE_DOWNLOADED: 'forge:update:downloaded',
  },
} as const;
