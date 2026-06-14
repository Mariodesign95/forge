/**
 * AppStore — Manages layout and app settings persistence using electron-store.
 *
 * Requirements: 0.6, 8.1, 8.2, 8.6, 8.8
 */

import Store from 'electron-store';
import { Settings } from '../renderer/types';

interface AppStoreSchema {
  panelSizes: [number, number, number];
  theme: 'dark' | 'light';
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'ollama',
  providers: {
    anthropic: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    openai: { provider: 'openai', model: 'gpt-4o' },
    gemini: { provider: 'gemini', model: 'gemini-1.5-pro' },
    openrouter: { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
    ollama: { provider: 'ollama', model: 'gemma4:12b-it-q4_K_M', ollamaEndpoint: 'http://localhost:11434' },
  },
  theme: 'dark',
  defaultTemplate: 'vanilla',
};

let _store: Store<AppStoreSchema> | null = null;

function getStore(): Store<AppStoreSchema> {
  if (!_store) {
    _store = new Store<AppStoreSchema>({
      name: 'app-store',
      defaults: {
        panelSizes: [30, 40, 30],
        theme: 'dark',
        settings: DEFAULT_SETTINGS,
      },
    });
  }
  return _store;
}

/**
 * Saves the panel sizes layout proportions.
 * Sum of percentages should be roughly 100.
 */
export function savePanelSizes(panelSizes: [number, number, number]): void {
  // Simple check to ensure we got three numbers
  if (
    Array.isArray(panelSizes) &&
    panelSizes.length === 3 &&
    panelSizes.every((s) => typeof s === 'number')
  ) {
    getStore().set('panelSizes', panelSizes);
  }
}

/**
 * Loads the panel sizes layout proportions.
 */
export function loadPanelSizes(): [number, number, number] {
  return getStore().get('panelSizes', [30, 40, 30]);
}

/**
 * Saves app theme preference.
 */
export function saveTheme(theme: 'dark' | 'light'): void {
  if (theme === 'dark' || theme === 'light') {
    getStore().set('theme', theme);
  }
}

/**
 * Loads app theme preference.
 */
export function loadTheme(): 'dark' | 'light' {
  return getStore().get('theme', 'dark');
}

/**
 * Saves complete Settings dictionary.
 */
export function saveSettings(settings: Settings): void {
  if (settings && typeof settings === 'object') {
    // Save theme to settings block as well as top-level theme (Req 0.6)
    if (settings.theme) {
      saveTheme(settings.theme);
    }
    getStore().set('settings', settings);
  }
}

/**
 * Loads complete Settings dictionary.
 */
export function loadSettings(): Settings {
  const store = getStore();
  const settings = store.get('settings');
  
  // Ensure we fall back to defaults if something is missing
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    theme: loadTheme(), // Always sync with the loadTheme value
  };
}
