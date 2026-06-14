/**
 * KeyStore — encrypted API key persistence using electron-store.
 *
 * Requirements: 8.3, 8.4, 8.5
 *
 * API keys are stored encrypted on disk using the machine-specific ID as
 * the encryption key, so they are tied to the local user profile and never
 * appear in plaintext in config files or source code.
 */

import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';

// ---------------------------------------------------------------------------
// Provider type (shared across the main process)
// ---------------------------------------------------------------------------

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

// ---------------------------------------------------------------------------
// Pure utility — exported separately so property tests can import it without
// needing an Electron environment.
// ---------------------------------------------------------------------------

/**
 * Masks an API key so that only the last 4 characters are visible.
 *
 * - Keys with length >= 4: returns `'•'.repeat(length - 4) + key.slice(-4)`
 * - Keys with length < 4 : returns the key as-is (nothing to mask)
 *
 * @param key - The raw API key string.
 * @returns The masked representation of the key.
 */
export function maskApiKey(key: string): string {
  if (key.length < 4) {
    return key;
  }
  return '•'.repeat(key.length - 4) + key.slice(-4);
}

// ---------------------------------------------------------------------------
// Store schema
// ---------------------------------------------------------------------------

interface KeyStoreSchema {
  keys: Partial<Record<Provider, string>>;
}

// ---------------------------------------------------------------------------
// KeyStore singleton
// ---------------------------------------------------------------------------

/**
 * Lazily-initialised electron-store instance.
 * We use a factory function so the store is only created after the Electron
 * app is ready and `machineIdSync()` can be called safely.
 */
let _store: Store<KeyStoreSchema> | null = null;

function getStore(): Store<KeyStoreSchema> {
  if (!_store) {
    _store = new Store<KeyStoreSchema>({
      name: 'key-store',
      encryptionKey: machineIdSync(),
      defaults: {
        keys: {},
      },
    });
  }
  return _store;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persists an API key for the given provider.
 * Requirement 8.3 — keys are stored encrypted on disk.
 */
export function saveKey(provider: Provider, key: string): void {
  const store = getStore();
  const keys = store.get('keys', {});
  keys[provider] = key;
  store.set('keys', keys);
}

/**
 * Retrieves the raw API key for the given provider, or `undefined` if not set.
 * The raw value is intentionally not exposed to the renderer; it is only used
 * internally by the main process services (e.g. ModelRouter).
 */
export function getKey(provider: Provider): string | undefined {
  return getStore().get('keys', {})[provider];
}

/**
 * Removes the API key for the given provider from the store.
 */
export function deleteKey(provider: Provider): void {
  const store = getStore();
  const keys = store.get('keys', {});
  delete keys[provider];
  store.set('keys', keys);
}

/**
 * Returns the masked version of the API key for the given provider.
 * Requirement 8.5 — the UI only ever sees the masked form (e.g. `••••••••abcd`).
 *
 * Returns an empty string when no key is configured for the provider.
 */
export function getMasked(provider: Provider): string {
  const key = getKey(provider);
  if (!key) return '';
  return maskApiKey(key);
}
