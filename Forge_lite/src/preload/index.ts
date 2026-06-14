/**
 * Electron Preload script exposing privileged API to the renderer process safely.
 *
 * Requirements: 9.3, 9.5
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';

contextBridge.exposeInMainWorld('forge', {
  ai: {
    chat: (req: { messages: any[]; provider: string; model: string }) => 
      ipcRenderer.invoke(IPC_CHANNELS.AI.CHAT, req),
    generate: (req: { brief: any; provider: string; model: string }) => 
      ipcRenderer.invoke(IPC_CHANNELS.AI.GENERATE, req),
    abort: (jobId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.AI.ABORT, { jobId }),
    on: (event: 'stream' | 'file-complete' | 'progress' | 'error', cb: (data: any) => void) => {
      const channel = `forge:ai:${event}`;
      const subscription = (_event: any, data: any) => cb(data);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
  },
  search: {
    query: (query: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH.QUERY, { query }),
    fetchUrl: (url: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH.FETCH, { url }),
  },
  export: {
    zip: (req: { projectId: string; template: string; destDir: string }) => 
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT.ZIP, req),
    openFolder: (path: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT.OPEN_FOLDER, { path }),
    pickDirectory: () => 
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT.PICK_DIRECTORY),
  },
  keys: {
    save: (provider: string, key: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.KEYS.SAVE, { provider, key }),
    getMasked: (provider: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.KEYS.GET_MASKED, { provider }),
    delete: (provider: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.KEYS.DELETE, { provider }),
  },
  project: {
    save: (project: any) => 
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT.SAVE, { project }),
    load: (projectId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT.LOAD, { projectId }),
    list: () => 
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT.LIST),
    delete: (projectId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT.DELETE, { projectId }),
    writeFile: (projectId: string, path: string, content: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT.WRITE_FILE, { projectId, path, content }),
    readFile: (projectId: string, path: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT.READ_FILE, { projectId, path }),
  },
  snapshot: {
    push: (projectId: string, snapshot: any) => 
      ipcRenderer.invoke(IPC_CHANNELS.SNAPSHOT.PUSH, { projectId, snapshot }),
    undo: (projectId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.SNAPSHOT.UNDO, { projectId }),
    redo: (projectId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.SNAPSHOT.REDO, { projectId }),
  },
  settings: {
    save: (settings: any) => 
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE, { settings }),
    load: () => 
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.LOAD),
  },
  shell: {
    saveLayout: (panelSizes: [number, number, number]) => 
      ipcRenderer.invoke(IPC_CHANNELS.SHELL.SAVE_LAYOUT, { panelSizes }),
    loadLayout: () => 
      ipcRenderer.invoke(IPC_CHANNELS.SHELL.LOAD_LAYOUT),
  },
  update: {
    check: () => 
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE.CHECK),
    install: () => 
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE.INSTALL),
    on: (event: 'available' | 'downloaded', cb: (data: any) => void) => {
      const channel = `forge:update:${event}`;
      const subscription = (_event: any, data: any) => cb(data);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
  },
});
