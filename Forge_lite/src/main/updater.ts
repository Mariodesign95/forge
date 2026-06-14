/**
 * AutoUpdater — Background update checks and installation using electron-updater.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC_CHANNELS } from '../shared/ipc-channels';

let updateWindow: BrowserWindow | null = null;

// Configure updater options (Requirement 12.1)
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// ─── Events wiring ─────────────────────────────────────────────────────────

autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log(`[AutoUpdater] Update available: ${info.version}`);
  if (updateWindow && !updateWindow.isDestroyed()) {
    // Notify renderer (Requirement 12.3)
    updateWindow.webContents.send(IPC_CHANNELS.EVENTS.UPDATE_AVAILABLE, {
      version: info.version,
    });
  }
});

autoUpdater.on('update-not-available', () => {
  console.log('[AutoUpdater] Update not available.');
});

autoUpdater.on('update-downloaded', (info) => {
  console.log(`[AutoUpdater] Update downloaded: ${info.version}`);
  if (updateWindow && !updateWindow.isDestroyed()) {
    // Notify renderer (Requirement 12.3)
    updateWindow.webContents.send(IPC_CHANNELS.EVENTS.UPDATE_DOWNLOADED, {
      version: info.version,
    });
  }
});

autoUpdater.on('error', (err) => {
  // Silent on error — does not disrupt user experience (Requirement 12.5)
  console.warn('[AutoUpdater] Silent check failure:', err);
});

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initializes the auto updater. Sets window reference and starts background checks.
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  updateWindow = mainWindow;

  // Run checking asynchronously (Requirement 12.2)
  setImmediate(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[AutoUpdater] Failed to check for updates on startup:', err);
    });
  });
}

/**
 * Manually starts checking/downloading updates.
 */
export async function checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string }> {
  try {
    const checkResult = await autoUpdater.checkForUpdates();
    if (checkResult && checkResult.updateInfo) {
      // If there is an update, trigger download
      if (checkResult.updateInfo.version !== autoUpdater.currentVersion.version) {
        // Start downloading in background
        autoUpdater.downloadUpdate().catch((err) => {
          console.warn('[AutoUpdater] Failed downloading update:', err);
        });
        return {
          hasUpdate: true,
          version: checkResult.updateInfo.version,
        };
      }
    }
  } catch (err) {
    console.warn('[AutoUpdater] Check for updates failed:', err);
  }
  return { hasUpdate: false };
}

/**
 * Quits the application and installs the downloaded update (Requirement 12.4).
 */
export function quitAndInstall(): void {
  try {
    autoUpdater.quitAndInstall();
  } catch (err) {
    console.error('[AutoUpdater] Failed to install update:', err);
  }
}
