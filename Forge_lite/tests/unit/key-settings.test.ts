import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── MOCKS ───────────────────────────────────────────────────────────────────

const storeData = new Map<string, any>();

const mockStoreInstance = {
  get: vi.fn().mockImplementation((key, defaultValue) => {
    return storeData.has(key) ? storeData.get(key) : defaultValue;
  }),
  set: vi.fn().mockImplementation((key, value) => {
    storeData.set(key, value);
  }),
};

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => mockStoreInstance),
}));

vi.mock('node-machine-id', () => ({
  machineIdSync: vi.fn().mockReturnValue('mock-machine-id-12345'),
}));

// ─── IMPORTS AFTER MOCKS ──────────────────────────────────────────────────────

import * as keyStore from '../../src/main/key-store';
import * as appStore from '../../src/main/app-store';
import { Settings } from '../../src/renderer/types';

describe('Task 2.4: KeyStore & Settings Unit Tests', () => {
  beforeEach(() => {
    storeData.clear();
    vi.clearAllMocks();
  });

  // ─── KEY STORE TESTS ───────────────────────────────────────────────────────
  
  describe('KeyStore Module', () => {
    it('should save a key and retrieve its masked value correctly', () => {
      // Save key
      keyStore.saveKey('openai', 'sk-proj-1234567890abcdef');

      // Check masked retrieval
      const masked = keyStore.getMasked('openai');
      expect(masked).toBe('••••••••••••••••••••cdef');
      expect(masked.length).toBe('sk-proj-1234567890abcdef'.length);

      // Check key storage internally
      const savedKeys = storeData.get('keys');
      expect(savedKeys.openai).toBe('sk-proj-1234567890abcdef');
    });

    it('should return empty string when getting masked key for unconfigured provider', () => {
      const masked = keyStore.getMasked('anthropic');
      expect(masked).toBe('');
    });

    it('should delete a key from the store', () => {
      keyStore.saveKey('gemini', 'gemini-secret-key');
      expect(keyStore.getMasked('gemini')).not.toBe('');

      keyStore.deleteKey('gemini');
      expect(keyStore.getMasked('gemini')).toBe('');
      
      const savedKeys = storeData.get('keys');
      expect(savedKeys.gemini).toBeUndefined();
    });

    it('should mask API keys properly via utility function', () => {
      expect(keyStore.maskApiKey('123456789')).toBe('•••••6789');
      expect(keyStore.maskApiKey('abc')).toBe('abc'); // too short to mask
    });
  });

  // ─── APP STORE & SETTINGS TESTS ──────────────────────────────────────────
  
  describe('AppStore Settings & Layout', () => {
    it('should save and load panel sizes layout', () => {
      appStore.savePanelSizes([25, 50, 25]);
      expect(appStore.loadPanelSizes()).toEqual([25, 50, 25]);
      expect(storeData.get('panelSizes')).toEqual([25, 50, 25]);
    });

    it('should load default panel sizes when unconfigured', () => {
      expect(appStore.loadPanelSizes()).toEqual([30, 40, 30]);
    });

    it('should save and load theme preference', () => {
      appStore.saveTheme('light');
      expect(appStore.loadTheme()).toBe('light');
      expect(storeData.get('theme')).toBe('light');
    });

    it('should save and load app settings config', () => {
      const customSettings: Settings = {
        activeProvider: 'anthropic',
        providers: {
          anthropic: { provider: 'anthropic', model: 'claude-3' },
          openai: { provider: 'openai', model: 'gpt-4' },
          gemini: { provider: 'gemini', model: 'gemini' },
          openrouter: { provider: 'openrouter', model: 'llama' },
          ollama: { provider: 'ollama', model: 'gemma', ollamaEndpoint: 'http://127.0.0.1:11434' },
        },
        theme: 'light',
        defaultTemplate: 'react-vite',
      };

      appStore.saveSettings(customSettings);
      const loaded = appStore.loadSettings();

      expect(loaded.activeProvider).toBe('anthropic');
      expect(loaded.theme).toBe('light');
      expect(loaded.defaultTemplate).toBe('react-vite');
      expect(loaded.providers.ollama.ollamaEndpoint).toBe('http://127.0.0.1:11434');
    });
  });
});
