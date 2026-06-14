/**
 * ModelRouter — Vercel AI SDK multi-provider abstraction
 *
 * Supports: Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama
 * All AI calls are executed in the Electron main process.
 *
 * Requirements: 2.1, 2.2, 2.7, 2.8, 2.9, 2.10
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

export interface ModelRouterConfig {
  provider: Provider;
  model: string;
  apiKey?: string;
  /** Default: http://localhost:11434 — only used when provider === 'ollama' */
  ollamaEndpoint?: string;
  /** Model identifier passed to OpenRouter, e.g. 'anthropic/claude-3.5-sonnet' */
  openRouterModel?: string;
  /** Timeout in milliseconds — default: 60_000 */
  timeoutMs?: number;
  /** Optional external abort signal to cancel streaming */
  abortSignal?: AbortSignal;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface IpcError {
  code: string;
  message: string;
}

// Error codes surfaced to the renderer via IPC
export const ERROR_CODES = {
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

// ---------------------------------------------------------------------------
// Provider factory helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Vercel AI SDK language-model instance for the given config.
 * Returns the model object ready to be passed to streamText().
 */
function buildModel(config: ModelRouterConfig) {
  const {
    provider,
    model,
    apiKey,
    ollamaEndpoint = 'http://localhost:11434',
    openRouterModel,
  } = config;

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }

    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }

    case 'gemini': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }

    case 'openrouter': {
      // OpenRouter is OpenAI-compatible — uses the same @ai-sdk/openai adapter
      const openrouter = createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
      });
      // openRouterModel overrides the model string when provided (Req 2.10)
      return openrouter(openRouterModel ?? model);
    }

    case 'ollama': {
      // Ollama exposes an OpenAI-compatible API at /v1 — no extra package needed
      const ollama = createOpenAI({
        // Ollama doesn't require an API key, but the SDK needs a non-empty string
        apiKey: 'ollama',
        baseURL: `${ollamaEndpoint}/v1`,
      });
      return ollama(model);
    }

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classifyError(err: unknown): IpcError {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    // AbortController triggered by our own timeout or manual cancellation
    if (err.name === 'AbortError' || msg.includes('aborted') || msg.includes('timeout')) {
      return {
        code: ERROR_CODES.PROVIDER_TIMEOUT,
        message: 'The AI provider did not respond within the timeout period or the request was cancelled.',
      };
    }

    // Network-level failures (fetch/DNS/connection refused)
    if (
      msg.includes('fetch failed') ||
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      msg.includes('network') ||
      msg.includes('socket')
    ) {
      return {
        code: ERROR_CODES.NETWORK_ERROR,
        message: `Network error while contacting the AI provider: ${err.message}`,
      };
    }

    // Everything else is a provider-level error (auth, rate limit, bad request…)
    return {
      code: ERROR_CODES.PROVIDER_ERROR,
      message: err.message,
    };
  }

  return {
    code: ERROR_CODES.PROVIDER_ERROR,
    message: String(err),
  };
}

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

export class ModelRouter {
  /**
   * Streams text from the configured AI provider.
   *
   * @param messages  Conversation history to send to the model.
   * @param config    Provider / model / key configuration.
   * @returns         AsyncIterable<string> yielding text chunks as they arrive.
   * @throws          IpcError-shaped Error on timeout, network, or provider failure.
   */
  async *stream(
    messages: ChatMessage[],
    config: ModelRouterConfig,
  ): AsyncIterable<string> {
    const timeoutMs = config.timeoutMs ?? 60_000;

    // AbortController used for both manual abort and timeout (Req 2.9)
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Link the external abort signal if provided
    if (config.abortSignal) {
      if (config.abortSignal.aborted) {
        controller.abort();
      } else {
        config.abortSignal.addEventListener('abort', () => {
          controller.abort();
        });
      }
    }

    try {
      const languageModel = buildModel(config);

      // Map ChatMessage[] to the CoreMessage format expected by the AI SDK
      const coreMessages = messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      const result = await streamText({
        model: languageModel,
        messages: coreMessages,
        abortSignal: controller.signal,
      });

      // Yield each text chunk from the stream
      for await (const chunk of result.textStream) {
        yield chunk;
      }
    } catch (err: unknown) {
      const ipcError = classifyError(err);
      // Re-throw as an Error with the IpcError fields attached so callers can
      // inspect the structured code without losing the Error identity.
      const error = new Error(ipcError.message) as Error & IpcError;
      error.code = ipcError.code;
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export — main process creates one instance shared by all handlers
// ---------------------------------------------------------------------------
export const modelRouter = new ModelRouter();
