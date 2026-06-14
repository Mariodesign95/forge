import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ModelRouter, ModelRouterConfig } from '../../src/main/model-router';

// Mock the Vercel AI SDK and adapters
const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (args: any) => mockStreamText(args),
}));

const mockAnthropicFactory = vi.fn().mockImplementation(() => vi.fn());
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (args: any) => mockAnthropicFactory(args),
}));

const mockOpenAIFactory = vi.fn().mockImplementation(() => vi.fn());
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (args: any) => mockOpenAIFactory(args),
}));

const mockGoogleFactory = vi.fn().mockImplementation(() => vi.fn());
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: (args: any) => mockGoogleFactory(args),
}));

describe('Property 8: ModelRouter Determinisim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamText.mockResolvedValue({
      textStream: (async function* () {
        yield 'chunk';
      })(),
    });
  });

  it('should map configurations to the correct providers deterministically', async () => {
    const router = new ModelRouter();

    // Fast-check property to test arbitrary combinations of provider configurations
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('anthropic', 'openai', 'gemini', 'openrouter', 'ollama'),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 30 }),
        fc.option(fc.string({ minLength: 5, maxLength: 50 })),
        async (provider, model, apiKey, ollamaEndpoint) => {
          vi.clearAllMocks();

          const config: ModelRouterConfig = {
            provider: provider as any,
            model,
            apiKey,
            ollamaEndpoint: ollamaEndpoint || undefined,
            openRouterModel: provider === 'openrouter' ? 'meta-llama/llama-3' : undefined,
          };

          // Call the router's stream. We consume the stream to trigger buildModel and streamText.
          const streamIterable = await router.stream([], config);
          for await (const _ of streamIterable) {
            // consume stream
          }

          // Check that factories were invoked with the correct properties
          if (provider === 'anthropic') {
            expect(mockAnthropicFactory).toHaveBeenCalledWith({ apiKey });
          } else if (provider === 'openai') {
            expect(mockOpenAIFactory).toHaveBeenCalledWith({ apiKey });
          } else if (provider === 'gemini') {
            expect(mockGoogleFactory).toHaveBeenCalledWith({ apiKey });
          } else if (provider === 'openrouter') {
            expect(mockOpenAIFactory).toHaveBeenCalledWith({
              apiKey,
              baseURL: 'https://openrouter.ai/api/v1',
            });
          } else if (provider === 'ollama') {
            const expectedEndpoint = ollamaEndpoint || 'http://localhost:11434';
            expect(mockOpenAIFactory).toHaveBeenCalledWith({
              apiKey: 'ollama',
              baseURL: `${expectedEndpoint}/v1`,
            });
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
