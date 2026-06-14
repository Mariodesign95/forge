/**
 * IPC handlers registration for the Electron Main process.
 * Handlers are registered here and map to services.
 *
 * Requirements: 9.4
 */

import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ─── AI HANDLERS ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AI.CHAT, async (_, payload) => {
    console.log('[IPC] AI_CHAT stub', payload);
    return { content: 'AI Chat Stub Response' };
  });

  ipcMain.handle(IPC_CHANNELS.AI.GENERATE, async (_, payload) => {
    console.log('[IPC] AI_GENERATE stub', payload);
    return { jobId: 'stub-job-id' };
  });

  ipcMain.handle(IPC_CHANNELS.AI.ABORT, async (_, payload) => {
    console.log('[IPC] AI_ABORT stub', payload);
    return { ok: true };
  });

  // ─── SEARCH HANDLERS ────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SEARCH.QUERY, async (_, payload) => {
    console.log('[IPC] SEARCH_QUERY stub', payload);
    return { results: [] };
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH.FETCH, async (_, payload) => {
    console.log('[IPC] SEARCH_FETCH stub', payload);
    return { content: '' };
  });

  // ─── EXPORT HANDLERS ────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.EXPORT.ZIP, async (_, payload) => {
    console.log('[IPC] EXPORT_ZIP stub', payload);
    return { zipPath: '' };
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT.OPEN_FOLDER, async (_, { path }) => {
    console.log('[IPC] EXPORT_OPEN_FOLDER stub', path);
    try {
      await shell.openPath(path);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT.PICK_DIRECTORY, async () => {
    console.log('[IPC] EXPORT_PICK_DIRECTORY stub');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ─── KEY STORE HANDLERS ─────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.KEYS.SAVE, async (_, payload) => {
    console.log('[IPC] KEYS_SAVE stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.KEYS.GET_MASKED, async (_, payload) => {
    console.log('[IPC] KEYS_GET_MASKED stub', payload);
    return '';
  });

  ipcMain.handle(IPC_CHANNELS.KEYS.DELETE, async (_, payload) => {
    console.log('[IPC] KEYS_DELETE stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.KEYS.HAS, async (_, payload) => {
    console.log('[IPC] KEYS_HAS stub', payload);
    return false;
  });

  // ─── PROJECT HANDLERS ───────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.PROJECT.SAVE, async (_, payload) => {
    console.log('[IPC] PROJECT_SAVE stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.LOAD, async (_, payload) => {
    console.log('[IPC] PROJECT_LOAD stub', payload);
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.LIST, async () => {
    console.log('[IPC] PROJECT_LIST stub');
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.DELETE, async (_, payload) => {
    console.log('[IPC] PROJECT_DELETE stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.WRITE_FILE, async (_, payload) => {
    console.log('[IPC] PROJECT_WRITE_FILE stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.READ_FILE, async (_, payload) => {
    console.log('[IPC] PROJECT_READ_FILE stub', payload);
    return '';
  });

  // ─── SNAPSHOT HANDLERS ──────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SNAPSHOT.PUSH, async (_, payload) => {
    console.log('[IPC] SNAPSHOT_PUSH stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.SNAPSHOT.UNDO, async (_, payload) => {
    console.log('[IPC] SNAPSHOT_UNDO stub', payload);
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.SNAPSHOT.REDO, async (_, payload) => {
    console.log('[IPC] SNAPSHOT_REDO stub', payload);
    return null;
  });

  // ─── SETTINGS HANDLERS ──────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE, async (_, payload) => {
    console.log('[IPC] SETTINGS_SAVE stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.LOAD, async () => {
    console.log('[IPC] SETTINGS_LOAD stub');
    return {
      activeProvider: 'ollama',
      providers: {
        ollama: { provider: 'ollama', model: 'qwen2.5-coder:7b' }
      },
      theme: 'dark',
      defaultTemplate: 'vanilla'
    };
  });

  // ─── SHELL LAYOUT HANDLERS ──────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SHELL.SAVE_LAYOUT, async (_, payload) => {
    console.log('[IPC] SHELL_SAVE_LAYOUT stub', payload);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.LOAD_LAYOUT, async () => {
    console.log('[IPC] SHELL_LOAD_LAYOUT stub');
    return {
      panelSizes: [30, 40, 30],
      theme: 'dark',
    };
  });

  // ─── AUTO UPDATE HANDLERS ───────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.UPDATE.CHECK, async () => {
    console.log('[IPC] UPDATE_CHECK stub');
    return { hasUpdate: false };
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE.INSTALL, async () => {
    console.log('[IPC] UPDATE_INSTALL stub');
    return { ok: true };
  });
}
