/**
 * Shared TypeScript type definitions for Forge Lite.
 *
 * Requirements: 9.1, 9.2, 9.3
 */

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

export type ExportTemplate = 'vanilla' | 'react-vite' | 'nextjs';

export type ViewportSize = 'mobile' | 'tablet' | 'desktop';

export type ChatMode = 'plan' | 'iteration';

export type EditorLanguage = 'html' | 'css' | 'javascript' | 'typescript' | 'tsx' | 'jsx' | 'json';

export interface TypographySpec {
  fontFamily: string;
  headingsFont?: string;
  bodyFont?: string;
  baseSize?: string;
}

export interface PageDefinition {
  name: string;
  slug: string;
  sections: string[]; // e.g. ['hero', 'features', 'cta']
}

export interface StyleToken {
  id: string; // e.g. 'stripe', 'apple', 'minimal'
  name: string;
  description: string;
  colors: Record<string, string>;
  typography: TypographySpec;
  spacing: string;
  borderRadius: string;
  shadow: string;
  promptBlock: string; // injected verbatim into the AI prompt
}

export interface StyleDefinition extends StyleToken {
  inspiration?: string;
  thumbnail?: string;
}

export interface Brief {
  version: '1.0';
  id: string; // UUID
  createdAt: string; // ISO 8601
  siteType: 'landing' | 'portfolio' | 'ecommerce' | 'blog' | 'saas' | 'other';
  pages: PageDefinition[];
  style: StyleToken | null;
  targetAudience: string;
  brandName: string;
  colorPalette: string[]; // Hex colors
  language: string; // The website target language (e.g. "English", "Italian")
  typography?: TypographySpec;
  additionalNotes?: string;
}

export interface ProjectFile {
  path: string; // relative to project root
  content: string;
  language: EditorLanguage;
  isDirty: boolean;
  cursorPosition?: { line: number; column: number };
}

export interface IterationSnapshot {
  id: string;
  timestamp: string;
  brief: Brief;
  files: Record<string, string>; // path -> content
  description: string; // e.g. "Before: added hero animation"
}

export interface Project {
  id: string; // UUID
  name: string;
  brief: Brief;
  template: ExportTemplate;
  provider: Provider;
  model: string;
  createdAt: string;
  updatedAt: string;
  filesDir: string; // absolute path on local disk
  snapshotStack: IterationSnapshot[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  siteType: string;
  template: ExportTemplate;
  provider: Provider;
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl: string | null; // base64 PNG (320x200)
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ChatState {
  mode: ChatMode;
  messages: ChatMessage[];
  brief: Brief | null;
  briefStatus: 'collecting' | 'ready' | 'approved';
  streamingMessageId: string | null;
}

export interface ProviderConfig {
  provider: Provider;
  apiKey?: string; // masked in UI
  model: string;
  ollamaEndpoint?: string; // default: http://localhost:11434
  openRouterModel?: string; // e.g. 'anthropic/claude-3.5-sonnet'
}

export interface Settings {
  activeProvider: Provider;
  providers: Record<Provider, ProviderConfig>;
  theme: 'dark' | 'light';
  defaultTemplate: ExportTemplate;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// IPC Protocol Wrappers
export interface IpcRequest<T = unknown> {
  requestId: string;
  payload: T;
}

export interface IpcResponse<T = unknown> {
  requestId: string;
  ok: boolean;
  data?: T;
  error?: IpcError;
}

export interface IpcError {
  code: string; // e.g. 'PROVIDER_TIMEOUT', 'PERMISSION_DENIED'
  message: string; // human-readable
}
