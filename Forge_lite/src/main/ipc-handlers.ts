/**
 * IPC handlers registration for the Electron Main process.
 * Maps incoming renderer messages to main process services.
 *
 * Requirements: 9.4, 9.6
 */

import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';

// Import services
import * as keyStore from './key-store';
import * as appStore from './app-store';
import * as projectStore from './project-store';
import { snapshotManager } from './snapshot-manager';
import { SearchService } from './search-service';
import { Provider } from '../renderer/types';

// Instantiate search service singleton
const searchService = new SearchService();

/**
 * Validates that the input is a valid Provider.
 */
function isValidProvider(provider: any): provider is Provider {
  return ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'].includes(provider);
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ─── KEY STORE HANDLERS (Requirement 8) ─────────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.KEYS.SAVE, async (_, payload) => {
    const { provider, key } = payload || {};
    if (!isValidProvider(provider) || typeof key !== 'string') {
      throw new Error('Invalid payload for keys:save');
    }
    keyStore.saveKey(provider, key);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.KEYS.GET_MASKED, async (_, payload) => {
    const { provider } = payload || {};
    if (!isValidProvider(provider)) {
      throw new Error('Invalid payload for keys:get-masked');
    }
    return keyStore.getMasked(provider);
  });

  ipcMain.handle(IPC_CHANNELS.KEYS.DELETE, async (_, payload) => {
    const { provider } = payload || {};
    if (!isValidProvider(provider)) {
      throw new Error('Invalid payload for keys:delete');
    }
    keyStore.deleteKey(provider);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.KEYS.HAS, async (_, payload) => {
    const { provider } = payload || {};
    if (!isValidProvider(provider)) {
      throw new Error('Invalid payload for keys:has');
    }
    return !!keyStore.getKey(provider);
  });

  // ─── SETTINGS HANDLERS (Requirement 8) ──────────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE, async (_, payload) => {
    const { settings } = payload || {};
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid payload for settings:save');
    }
    appStore.saveSettings(settings);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.LOAD, async () => {
    return appStore.loadSettings();
  });

  // ─── SHELL LAYOUT HANDLERS (Requirement 0.6) ────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.SHELL.SAVE_LAYOUT, async (_, payload) => {
    const { panelSizes } = payload || {};
    if (!Array.isArray(panelSizes) || panelSizes.length !== 3) {
      throw new Error('Invalid payload for shell:layout:save');
    }
    appStore.savePanelSizes(panelSizes as [number, number, number]);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.LOAD_LAYOUT, async () => {
    return {
      panelSizes: appStore.loadPanelSizes(),
      theme: appStore.loadTheme(),
    };
  });

  // ─── SEARCH HANDLERS (Requirement 3) ────────────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.SEARCH.QUERY, async (_, payload) => {
    const { query } = payload || {};
    if (typeof query !== 'string') {
      throw new Error('Invalid payload for search:query');
    }
    const results = await searchService.search(query);
    return { results };
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH.FETCH, async (_, payload) => {
    const { url } = payload || {};
    if (typeof url !== 'string') {
      throw new Error('Invalid payload for search:fetch');
    }
    const content = await searchService.fetchUrl(url);
    return { content };
  });

  // ─── SNAPSHOT HANDLERS (Requirement 11) ──────────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.SNAPSHOT.PUSH, async (_, payload) => {
    const { projectId, snapshot } = payload || {};
    if (typeof projectId !== 'string' || !snapshot || typeof snapshot !== 'object') {
      throw new Error('Invalid payload for snapshot:push');
    }
    snapshotManager.push(projectId, snapshot);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.SNAPSHOT.UNDO, async (_, payload) => {
    const { projectId } = payload || {};
    if (typeof projectId !== 'string') {
      throw new Error('Invalid payload for snapshot:undo');
    }
    const snapshot = snapshotManager.undo(projectId);
    return { snapshot };
  });

  ipcMain.handle(IPC_CHANNELS.SNAPSHOT.REDO, async (_, payload) => {
    const { projectId } = payload || {};
    if (typeof projectId !== 'string') {
      throw new Error('Invalid payload for snapshot:redo');
    }
    const snapshot = snapshotManager.redo(projectId);
    return { snapshot };
  });

  // ─── PROJECT HANDLERS (Requirement 10) ───────────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.PROJECT.SAVE, async (_, payload) => {
    const { project } = payload || {};
    if (!project || typeof project !== 'object' || typeof project.id !== 'string') {
      throw new Error('Invalid payload for project:save');
    }
    await projectStore.saveProject(project);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.LOAD, async (_, payload) => {
    const { projectId } = payload || {};
    if (typeof projectId !== 'string') {
      throw new Error('Invalid payload for project:load');
    }
    const project = projectStore.loadProject(projectId);
    if (!project) return null;

    // Load files list dynamically from project directory (Requirement 10.4)
    const files = await projectStore.readProjectFiles(projectId);
    return {
      project,
      files,
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.LIST, async () => {
    const projects = projectStore.listProjects();
    return { projects };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.DELETE, async (_, payload) => {
    const { projectId } = payload || {};
    if (typeof projectId !== 'string') {
      throw new Error('Invalid payload for project:delete');
    }
    await projectStore.deleteProject(projectId);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.WRITE_FILE, async (_, payload) => {
    const { projectId, path: filePath, content } = payload || {};
    if (typeof projectId !== 'string' || typeof filePath !== 'string' || typeof content !== 'string') {
      throw new Error('Invalid payload for project:write-file');
    }
    await projectStore.writeFile(projectId, filePath, content);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT.READ_FILE, async (_, payload) => {
    const { projectId, path: filePath } = payload || {};
    if (typeof projectId !== 'string' || typeof filePath !== 'string') {
      throw new Error('Invalid payload for project:read-file');
    }
    const content = await projectStore.readFile(projectId, filePath);
    return { content };
  });

  // ─── EXPORT HANDLERS (Requirement 7) ────────────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.EXPORT.ZIP, async (_, payload) => {
    console.log('[IPC] EXPORT_ZIP stub', payload);
    return { zipPath: '' };
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT.OPEN_FOLDER, async (_, payload) => {
    const { path: folderPath } = payload || {};
    if (typeof folderPath !== 'string') {
      throw new Error('Invalid payload for export:open-folder');
    }
    try {
      await shell.openPath(folderPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT.PICK_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ─── AUTO UPDATE HANDLERS (Requirement 12) ───────────────────────────────────
  
  ipcMain.handle(IPC_CHANNELS.UPDATE.CHECK, async () => {
    console.log('[IPC] UPDATE_CHECK stub');
    return { hasUpdate: false };
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE.INSTALL, async () => {
    console.log('[IPC] UPDATE_INSTALL stub');
    return { ok: true };
  });
}
