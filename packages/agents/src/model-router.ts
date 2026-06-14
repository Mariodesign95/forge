import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────
// MODEL ROUTER
// Priority: Ollama (local) → OpenAI → Anthropic → OpenRouter
// Falls back automatically if a provider fails or is unavailable.
// Budget tracking per call returned for cost metering.
// ─────────────────────────────────────────────────────────────

export type Provider = 'ollama' | 'openai' | 'anthropic' | 'openrouter';

export interface ModelConfig {
  provider: Provider;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelResponse {
  content: string;
  provider: Provider;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cost_eur: number;
  };
}

// Cost per 1M tokens in EUR (approximate, June 2025)
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o':                  { input: 4.6,  output: 13.8 },
  'gpt-4o-mini':             { input: 0.14, output: 0.55 },
  'claude-3-5-sonnet-20241022': { input: 2.75, output: 13.8 },
  'claude-3-haiku-20240307': { input: 0.23, output: 1.15 },
  // Ollama models are free (local)
  'default':                 { input: 0,    output: 0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_1M[model] ?? COST_PER_1M['default']!;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

// ── Ollama (local) ────────────────────────────────────────────

async function callOllama(
  model: string,
  messages: ChatMessage[],
  isRetry = false,
): Promise<ModelResponse> {
  const OLLAMA_HOST = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';

  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    if (res.status === 404 && !isRetry) {
      try {
        const listRes = await fetch(`${OLLAMA_HOST}/api/tags`);
        if (listRes.ok) {
          const listData = await listRes.json() as { models?: Array<{ name: string }> };
          const available = listData.models?.map((m) => m.name) ?? [];
          if (available.length > 0) {
            const fallbackModel = available[0]!;
            console.warn(`[ModelRouter] Ollama model "${model}" not found. Falling back to "${fallbackModel}"…`);
            return await callOllama(fallbackModel, messages, true);
          }
        }
      } catch (err) {
        console.error('[ModelRouter] Failed to fetch Ollama tags:', err);
      }
    }
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    message: { content: string };
    eval_count?: number;
    prompt_eval_count?: number;
  };

  const inputTokens  = data.prompt_eval_count ?? 0;
  const outputTokens = data.eval_count ?? 0;

  return {
    content: data.message.content,
    provider: 'ollama',
    model,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_eur: 0 },
  };
}

// ── OpenAI ────────────────────────────────────────────────────

async function callOpenAI(
  model: string,
  messages: ChatMessage[],
  baseURL?: string,
  apiKey?: string,
): Promise<ModelResponse> {
  const client = new OpenAI({
    apiKey: apiKey ?? process.env['OPENAI_API_KEY'],
    baseURL,
  });

  const res = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature: 0.3,
  });

  const inputTokens  = res.usage?.prompt_tokens ?? 0;
  const outputTokens = res.usage?.completion_tokens ?? 0;
  const content = res.choices[0]?.message.content ?? '';

  return {
    content,
    provider: baseURL ? 'openrouter' : 'openai',
    model,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_eur: estimateCost(model, inputTokens, outputTokens),
    },
  };
}

// ── Anthropic ─────────────────────────────────────────────────

async function callAnthropic(
  model: string,
  messages: ChatMessage[],
): Promise<ModelResponse> {
  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

  // Anthropic separates system message from chat messages
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const res = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemMsg,
    messages: chatMessages,
  });

  const inputTokens  = res.usage.input_tokens;
  const outputTokens = res.usage.output_tokens;
  const block = res.content[0];
  const content = block?.type === 'text' ? block.text : '';

  return {
    content,
    provider: 'anthropic',
    model,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_eur: estimateCost(model, inputTokens, outputTokens),
    },
  };
}

// ── Router ────────────────────────────────────────────────────

export interface RouterOptions {
  preferLocal?: boolean;     // try Ollama first (default: true)
  maxCostEur?: number;       // skip providers above this per-call cost
  agent?: string;            // the agent name (Architect, Planner, Coder, QA)
}

const DEFAULT_MODELS: Record<Provider, string> = {
  ollama:     process.env['OLLAMA_MODEL']     ?? 'llama3',
  openai:     process.env['OPENAI_MODEL']     ?? 'gpt-4o-mini',
  anthropic:  process.env['ANTHROPIC_MODEL']  ?? 'claude-3-5-sonnet-20241022',
  openrouter: process.env['OPENROUTER_MODEL'] ?? 'anthropic/claude-3-haiku',
};

let activeSettings: Record<string, any> = {};

export function updateRouterSettings(settings: Record<string, any>): void {
  activeSettings = settings;
}

export async function chat(
  messages: ChatMessage[],
  opts: RouterOptions = {},
): Promise<ModelResponse> {
  const { preferLocal = true, agent } = opts;

  let chosenProvider: Provider | undefined;
  let chosenModel: string | undefined;

  if (agent) {
    const agentKey = agent.toLowerCase();
    const agentModelSetting = activeSettings.agent_models?.[agentKey];
    if (agentModelSetting && typeof agentModelSetting === 'string') {
      const colonIdx = agentModelSetting.indexOf(':');
      if (colonIdx !== -1) {
        chosenProvider = agentModelSetting.slice(0, colonIdx) as Provider;
        chosenModel = agentModelSetting.slice(colonIdx + 1);
      }
    }
  }

  const providers: Array<() => Promise<ModelResponse>> = [];

  // 1. Prioritize agent-specific model selection if configured
  if (chosenProvider && chosenModel) {
    console.log(`[ModelRouter] Routing agent "${agent}" to explicitly configured model: ${chosenProvider}/${chosenModel}`);
    if (chosenProvider === 'ollama') {
      providers.push(() => callOllama(chosenModel!, messages));
    } else if (chosenProvider === 'openai') {
      providers.push(() => callOpenAI(chosenModel!, messages));
    } else if (chosenProvider === 'anthropic') {
      providers.push(() => callAnthropic(chosenModel!, messages));
    } else if (chosenProvider === 'openrouter') {
      providers.push(() =>
        callOpenAI(
          chosenModel!,
          messages,
          'https://openrouter.ai/api/v1',
          process.env['OPENROUTER_API_KEY'],
        )
      );
    }
  }

  // 2. Standard provider chain based on available keys + preference as fallback
  if (preferLocal) {
    if (!(chosenProvider === 'ollama' && chosenModel === DEFAULT_MODELS['ollama'])) {
      providers.push(() => callOllama(DEFAULT_MODELS['ollama']!, messages));
    }
  }
  if (process.env['OPENAI_API_KEY']) {
    if (!(chosenProvider === 'openai' && chosenModel === DEFAULT_MODELS['openai'])) {
      providers.push(() => callOpenAI(DEFAULT_MODELS['openai']!, messages));
    }
  }
  if (process.env['ANTHROPIC_API_KEY']) {
    if (!(chosenProvider === 'anthropic' && chosenModel === DEFAULT_MODELS['anthropic'])) {
      providers.push(() => callAnthropic(DEFAULT_MODELS['anthropic']!, messages));
    }
  }
  if (process.env['OPENROUTER_API_KEY']) {
    if (!(chosenProvider === 'openrouter' && chosenModel === DEFAULT_MODELS['openrouter'])) {
      providers.push(() =>
        callOpenAI(
          DEFAULT_MODELS['openrouter']!,
          messages,
          'https://openrouter.ai/api/v1',
          process.env['OPENROUTER_API_KEY'],
        )
      );
    }
  }
  if (!preferLocal) {
    if (!(chosenProvider === 'ollama' && chosenModel === DEFAULT_MODELS['ollama'])) {
      providers.push(() => callOllama(DEFAULT_MODELS['ollama']!, messages));
    }
  }

  if (providers.length === 0) {
    throw new Error(
      'No AI provider available. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or run Ollama locally.',
    );
  }

  let lastError: Error | undefined;
  for (const callProvider of providers) {
    try {
      return await callProvider();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ModelRouter] Provider failed: ${lastError.message} — trying next…`);
    }
  }

  throw new Error(`All providers failed. Last error: ${lastError?.message}`);
}
