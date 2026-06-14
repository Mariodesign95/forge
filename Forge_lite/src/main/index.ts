/**
 * Electron Main Process Entry Point.
 *
 * Requirements: 9.3, 9.4
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Forge Lite',
    webPreferences: {
      // Security configurations (Requirement 9.3)
      nodeIntegration: false,
      contextIsolation: true,
      // Load preload script from dist output directory
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
    },
  });

  // Register IPC handlers
  registerIpcHandlers(mainWindow);

  if (isDev) {
    // Load from Vite dev server in development
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Load local index.html in production
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron lifecycle handlers
app.on('ready', createMainWindow);

app.on('window-all-closed', () => {
  // Respect platform-specific behavior (keep running on macOS unless explicit quit)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
