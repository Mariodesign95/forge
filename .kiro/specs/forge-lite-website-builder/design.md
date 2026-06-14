# Design Document — Forge Lite Website Builder

## Overview

Forge Lite è un'applicazione desktop AI-powered costruita su **Electron + React + TypeScript**. Permette all'utente di costruire siti web e web app descrivendo a parole l'idea, discuterne con l'AI in un Plan Mode conversazionale, approvare un brief strutturato, generare il codice con live preview in tempo reale, ed esportare o deployare il progetto.

Questo documento descrive l'architettura tecnica dell'applicazione, i componenti principali, i canali IPC, i servizi core, e le proprietà di correttezza verificabili.

---

## Architecture

### Electron Process Model

Forge Lite segue il modello di sicurezza standard Electron con tre layer distinti:

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js — pieno accesso filesystem/rete)         │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ ModelRouter │  │SearchService │  │   ExportService       │  │
│  │ (Vercel AI  │  │ (Jina AI)    │  │   (archiver/zip)      │  │
│  │  SDK)       │  │              │  │                       │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬────────────┘  │
│         │                │                     │               │
│  ┌──────┴────────────────┴─────────────────────┴────────────┐  │
│  │              IPC Handler (ipcMain)                        │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────┴────────────────────────────────┐  │
│  │              Preload Script (contextBridge)               │  │
│  └──────────────────────────┬────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ (sandboxed IPC bridge)
┌────────────────────────────┴────────────────────────────────────┐
│  Renderer Process (Chromium — no Node.js, no nodeIntegration)   │
│                                                                 │
│  ┌──────────┐  ┌───────────┐  ┌─────────┐  ┌────────────────┐  │
│  │ AI_Chat  │  │  Editor   │  │ Preview │  │ Settings_Panel │  │
│  │          │  │  (Monaco) │  │(iframe) │  │                │  │
│  └──────────┘  └───────────┘  └─────────┘  └────────────────┘  │
│                     Shell (Three-Panel Layout)                  │
└─────────────────────────────────────────────────────────────────┘
```

**Principi architetturali:**
- `nodeIntegration: false` nel renderer — nessun accesso diretto a Node.js dal browser
- `contextIsolation: true` — il preload script espone solo le API esplicitamente whitelisted
- Tutte le chiamate AI, filesystem, e network vengono eseguite nel main process
- Il renderer comunica esclusivamente tramite `contextBridge` → `ipcRenderer`/`ipcMain`

---

## Project Directory Layout

```
forge-lite/
├── package.json                     # root (electron-builder config)
├── electron-builder.yml
├── tsconfig.json
│
├── src/
│   ├── main/                        # Main Process (Node.js)
│   │   ├── index.ts                 # Entry point: BrowserWindow + ipcMain registrations
│   │   ├── ipc-handlers.ts          # Tutti i canali ipcMain.handle()
│   │   ├── model-router.ts          # ModelRouter (Vercel AI SDK, 5 provider)
│   │   ├── search-service.ts        # SearchService (Jina AI + SearchCache)
│   │   ├── builder.ts               # Builder pipeline (Brief → AI → files)
│   │   ├── export-service.ts        # ExportService (ZIP generation)
│   │   ├── key-store.ts             # KeyStore (electron-store encrypted)
│   │   ├── project-store.ts         # ProjectStore (electron-store metadati + fs)
│   │   ├── snapshot-manager.ts      # SnapshotManager (undo/redo stack)
│   │   ├── updater.ts               # AutoUpdater (electron-updater)
│   │   └── style-library.ts         # StyleLibrary loader (DESIGN.md styles)
│   │
│   ├── preload/
│   │   └── index.ts                 # contextBridge — espone window.forge API
│   │
│   └── renderer/                    # Renderer Process (React + TypeScript)
│       ├── main.tsx                 # React entry point
│       ├── App.tsx                  # Root component + routing
│       │
│       ├── components/
│       │   ├── Shell/
│       │   │   ├── Shell.tsx        # Three-panel layout con ResizablePanels
│       │   │   ├── PanelDivider.tsx # Drag handle per resize
│       │   │   └── TopBar.tsx       # Panel toggles + global actions
│       │   │
│       │   ├── AI_Chat/
│       │   │   ├── AI_Chat.tsx      # Contenitore chat (Plan Mode / Iteration Mode)
│       │   │   ├── MessageList.tsx  # Lista messaggi con streaming
│       │   │   ├── MessageInput.tsx # Input con invio
│       │   │   ├── BriefPreview.tsx # Pannello anteprima Brief JSON
│       │   │   ├── StylePicker.tsx  # Selettore Style_Library
│       │   │   └── BriefActions.tsx # "Approva e Genera" / "Modifica Brief"
│       │   │
│       │   ├── Editor/
│       │   │   ├── Editor.tsx       # Monaco Editor wrapper
│       │   │   ├── FileTree.tsx     # Albero file navigabile
│       │   │   └── EditorToolbar.tsx# Save, undo/redo iterazioni
│       │   │
│       │   ├── Preview/
│       │   │   ├── Preview.tsx      # iframe sandbox + loading overlay
│       │   │   ├── ViewportControls.tsx  # mobile/tablet/desktop switcher
│       │   │   └── PreviewToolbar.tsx
│       │   │
│       │   └── Settings_Panel/
│       │       ├── Settings_Panel.tsx
│       │       ├── ApiKeyField.tsx  # Input mascherato (mostra ultimi 4 char)
│       │       ├── ModelSelector.tsx# Provider + model picker
│       │       └── ThemeToggle.tsx
│       │
│       ├── hooks/
│       │   ├── useIpc.ts            # Wrapper typed per window.forge.*
│       │   ├── useBuilder.ts        # Stato generazione (streaming, progress)
│       │   ├── useSnapshotStack.ts  # Undo/redo iterazioni
│       │   └── useProjectStore.ts   # Progetti recenti, caricamento
│       │
│       ├── stores/
│       │   ├── appStore.ts          # Zustand: tema, layout proporzioni
│       │   ├── projectStore.ts      # Zustand: progetto corrente, file generati
│       │   └── chatStore.ts         # Zustand: messaggi, Brief, mode
│       │
│       ├── types/
│       │   └── index.ts             # Tipi condivisi (Brief, Project, Snapshot…)
│       │
│       └── styles/
│           ├── globals.css
│           └── themes.css           # CSS custom properties dark/light
│
├── assets/
│   ├── styles/                      # DESIGN.md style tokens (JSON)
│   │   ├── stripe.json
│   │   ├── apple.json
│   │   ├── airbnb.json
│   │   ├── linear.json
│   │   ├── notion.json
│   │   ├── vercel.json
│   │   ├── figma.json
│   │   ├── supabase.json
│   │   ├── shadcn.json
│   │   └── minimal.json
│   └── icons/
│
└── tests/
    ├── unit/
    ├── integration/
    └── property/                    # Property-based tests (fast-check)
```

---

## Components and Interfaces

### Shell

Il componente radice che implementa il layout a tre pannelli ridimensionabili.

```typescript
interface ShellProps {
  theme: 'dark' | 'light';
  panelSizes: [number, number, number]; // percentuali, somma = 100
  onPanelResize: (sizes: [number, number, number]) => void;
}

interface PanelConstraints {
  minWidth: 200; // px — invariante per tutti i pannelli
}
```

Il layout usa **`react-resizable-panels`** internamente. Quando la finestra scende sotto i 900px, Shell passa alla modalità single-panel con NavigationTabs (`Chat | Code | Preview`).

Le proporzioni dei pannelli e il tema vengono persistiti tramite `electron-store` al cambio e ripristinati all'avvio.

---

### AI_Chat

Gestisce la conversazione con l'AI in due modalità distinte:

```typescript
type ChatMode = 'plan' | 'iteration';

interface ChatState {
  mode: ChatMode;
  messages: ChatMessage[];
  brief: Brief | null;
  briefStatus: 'collecting' | 'ready' | 'approved';
  streamingMessageId: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface Brief {
  siteType: string;
  pages: string[];
  style: StyleToken | null;
  targetAudience: string;
  brandName: string;
  colorPalette: string[];
  additionalNotes: string;
}
```

In **Plan Mode**, AI_Chat accumula il contesto conversazionale fino a quando il Brief è completo, poi lo presenta in `BriefPreview` con le azioni "Approva e Genera" / "Modifica Brief".

In **Iteration Mode** (dopo la generazione), AI_Chat accetta richieste di modifica chirurgiche sul codice esistente.

---

### Editor

Monaco Editor wrapper con tree dei file e toolbar.

```typescript
interface EditorProps {
  files: ProjectFile[];
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
}

interface ProjectFile {
  path: string;        // relativo alla root del progetto
  content: string;
  language: EditorLanguage;
  isDirty: boolean;
  cursorPosition?: { line: number; column: number };
}

type EditorLanguage = 'html' | 'css' | 'javascript' | 'typescript' | 'tsx' | 'jsx' | 'json';
```

Il debounce di 500ms viene gestito in `useBuilder.ts` tramite un `useEffect` che monitora `onChange`.

---

### Preview

Iframe sandboxed per il live preview.

```typescript
interface PreviewProps {
  files: ProjectFile[];
  viewport: ViewportSize;
  isGenerating: boolean;
}

type ViewportSize = 'mobile' | 'tablet' | 'desktop';

const VIEWPORT_WIDTHS: Record<ViewportSize, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
};
```

Il sandbox dell'iframe usa `sandbox="allow-scripts"` (senza `allow-same-origin`). Questo fa operare l'iframe con un'**origine opaca (null)**, impedendo al codice del sito di accedere a `window.parent`, alle API Electron, o a qualsiasi risorsa dell'origine principale.

**Strategia risorse:** poiché l'iframe ha origine opaca, le risorse relative non vengono risolte. Il Builder genera codice **self-contained**: CSS inline o in tag `<style>`, immagini come data URL, font via `@font-face` base64. Non viene usato nessun server HTTP locale — `srcDoc` è l'unico meccanismo di rendering, sia per HTML vanilla che per React (pre-renderizzato).

---

### Settings_Panel

```typescript
interface ProviderConfig {
  provider: Provider;
  apiKey?: string;      // mai in chiaro nel DOM, solo masked
  model: string;
  ollamaEndpoint?: string;  // default: http://localhost:11434
  openRouterModel?: string; // es. 'anthropic/claude-3.5-sonnet'
}

type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

interface Settings {
  activeProvider: Provider;
  providers: Record<Provider, ProviderConfig>;
  theme: 'dark' | 'light';
  defaultTemplate: ExportTemplate;
}
```

Le API key vengono mostrate solo come `••••••••••••abcd` (ultimi 4 caratteri visibili). Nessuna key viene mai loggata o inclusa nei source file.

---

## Data Models

### Brief (formato JSON approvato)

```typescript
interface Brief {
  version: '1.0';
  id: string;                        // uuid
  createdAt: string;                 // ISO 8601
  siteType: 'landing' | 'portfolio' | 'ecommerce' | 'blog' | 'saas' | 'other';
  pages: PageDefinition[];
  style: StyleToken;
  targetAudience: string;
  brandName: string;
  colorPalette: string[];            // hex colors
  typography?: TypographySpec;
  additionalNotes?: string;
}

interface PageDefinition {
  name: string;
  slug: string;
  sections: string[];                // es. ['hero', 'features', 'cta']
}

interface StyleToken {
  id: string;                        // es. 'stripe', 'apple', 'minimal'
  name: string;
  description: string;
  colors: Record<string, string>;
  typography: TypographySpec;
  spacing: string;
  borderRadius: string;
  shadow: string;
  promptBlock: string;               // iniettato verbatim nel prompt AI
}
```

### Project (metadati persistiti in electron-store)

```typescript
interface Project {
  id: string;                        // uuid
  name: string;
  brief: Brief;
  template: ExportTemplate;
  provider: Provider;
  model: string;
  createdAt: string;
  updatedAt: string;
  filesDir: string;                  // path assoluto su filesystem locale
  snapshotStack: IterationSnapshot[];
}

type ExportTemplate = 'vanilla' | 'react-vite' | 'nextjs';

// Subset usato dalla lista progetti recenti
interface ProjectMeta {
  id: string;
  name: string;
  siteType: string;
  template: ExportTemplate;
  provider: Provider;
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl: string | null;   // data URL base64 (PNG 320×200), vedi nota sotto
}
```

**Generazione del thumbnail:** il `thumbnailDataUrl` viene generato **nel renderer** al completamento della generazione del codice (evento `forge:ai:file-complete` con `done: true`), tramite `html2canvas` applicato all'iframe di Preview. Il data URL risultante (PNG, max 320×200px) viene trasmesso al main process via `forge:project:save` e persistito in `electron-store` assieme agli altri metadati. Non viene rigenerato ad ogni salvataggio manuale dell'editor — solo al termine di una nuova generazione AI o di una iterazione che modifica file visibili.

### IterationSnapshot

```typescript
interface IterationSnapshot {
  id: string;
  timestamp: string;
  brief: Brief;
  files: Record<string, string>;     // path → content
  description: string;               // es. "Before: added hero animation"
}
```

### IPC Message Types

```typescript
// Richiesta dal renderer al main
interface IpcRequest<T = unknown> {
  requestId: string;
  payload: T;
}

// Risposta dal main al renderer
interface IpcResponse<T = unknown> {
  requestId: string;
  ok: boolean;
  data?: T;
  error?: IpcError;
}

interface IpcError {
  code: string;          // es. 'PROVIDER_TIMEOUT', 'PERMISSION_DENIED'
  message: string;       // human-readable
  // NO stack trace esposta al renderer
}
```

---

## IPC Channel Map

Tutti i canali IPC sono definiti come costanti in `src/shared/ipc-channels.ts`. Il main process usa `ipcMain.handle()` per i canali request/response e `BrowserWindow.webContents.send()` per gli eventi push.

### Request/Response Channels (renderer → main)

| Canale | Payload | Risposta | Descrizione |
|--------|---------|----------|-------------|
| `forge:ai:chat` | `{ messages: ChatMessage[], provider: Provider, model: string }` | `{ content: string }` (streaming via eventi) | Invia messaggio all'AI, risposta via eventi `forge:ai:stream` |
| `forge:ai:generate` | `{ brief: Brief, provider: Provider, model: string }` | `{ jobId: string }` | Avvia generazione codice dal Brief approvato |
| `forge:ai:abort` | `{ jobId: string }` | `{ ok: boolean }` | Interrompe una generazione in corso |
| `forge:search:query` | `{ query: string }` | `{ results: SearchResult[] }` | Esegue ricerca Jina AI (con cache) |
| `forge:search:fetch` | `{ url: string }` | `{ content: string }` | Recupera contenuto URL via r.jina.ai |
| `forge:export:zip` | `{ projectId: string, template: ExportTemplate, destDir: string }` | `{ zipPath: string }` | Genera archivio ZIP del progetto |
| `forge:export:open-folder` | `{ path: string }` | `{ ok: boolean }` | Apre cartella nel file explorer OS |
| `forge:export:pick-directory` | `{}` | `{ path: string \| null }` | Dialog selezione directory (showOpenDialog) |
| `forge:keys:save` | `{ provider: Provider, key: string }` | `{ ok: boolean }` | Salva API key in electron-store cifrato |
| `forge:keys:get-masked` | `{ provider: Provider }` | `{ masked: string }` | Restituisce key mascherata (ultimi 4 chars) |
| `forge:keys:delete` | `{ provider: Provider }` | `{ ok: boolean }` | Elimina API key |
| `forge:project:save` | `{ project: Project }` | `{ ok: boolean }` | Salva metadati progetto |
| `forge:project:load` | `{ projectId: string }` | `{ project: Project }` | Carica progetto completo |
| `forge:project:list` | `{}` | `{ projects: ProjectMeta[] }` | Lista progetti recenti (max 20, LRU) |
| `forge:project:delete` | `{ projectId: string }` | `{ ok: boolean }` | Elimina progetto (metadati + file) |
| `forge:project:write-file` | `{ projectId: string, path: string, content: string }` | `{ ok: boolean }` | Scrive file di progetto su filesystem |
| `forge:project:read-file` | `{ projectId: string, path: string }` | `{ content: string }` | Legge file di progetto da filesystem |
| `forge:snapshot:push` | `{ projectId: string, snapshot: IterationSnapshot }` | `{ ok: boolean }` | Aggiunge snapshot undo stack (max 10) |
| `forge:snapshot:undo` | `{ projectId: string }` | `{ snapshot: IterationSnapshot \| null }` | Pop undo → restituisce snapshot precedente |
| `forge:snapshot:redo` | `{ projectId: string }` | `{ snapshot: IterationSnapshot \| null }` | Redo → restituisce snapshot successivo |
| `forge:settings:save` | `{ settings: Settings }` | `{ ok: boolean }` | Salva preferenze utente |
| `forge:settings:load` | `{}` | `{ settings: Settings }` | Carica preferenze utente |
| `forge:shell:layout:save` | `{ panelSizes: [number, number, number] }` | `{ ok: boolean }` | Persiste le proporzioni dei pannelli (% somma = 100) |
| `forge:shell:layout:load` | `{}` | `{ panelSizes: [number, number, number], theme: 'dark' \| 'light' }` | Ripristina proporzioni pannelli e tema al lancio |
| `forge:update:check` | `{}` | `{ hasUpdate: boolean, version?: string }` | Controlla disponibilità aggiornamenti |
| `forge:update:install` | `{}` | `{ ok: boolean }` | Scarica e installa aggiornamento |

### Push Events (main → renderer)

| Canale | Payload | Descrizione |
|--------|---------|-------------|
| `forge:ai:stream` | `{ jobId: string, chunk: string, done: boolean }` | Chunk di testo generato dall'AI (streaming) |
| `forge:ai:file-complete` | `{ jobId: string, path: string, content: string, index: number, total: number }` | File completato durante la generazione |
| `forge:ai:progress` | `{ jobId: string, filesCompleted: number, filesTotal: number, provider: string }` | Progresso generazione (es. "2/5 file") |
| `forge:ai:error` | `{ jobId: string, code: string, message: string }` | Errore durante generazione/chat |
| `forge:update:available` | `{ version: string }` | Nuovo aggiornamento disponibile |
| `forge:update:downloaded` | `{ version: string }` | Download aggiornamento completato |

### contextBridge API (window.forge)

Il preload script espone un oggetto `window.forge` tipizzato:

```typescript
// src/preload/index.ts
interface ForgeAPI {
  ai: {
    chat(req: ChatRequest): Promise<void>;          // risposta via forge:ai:stream
    generate(req: GenerateRequest): Promise<{ jobId: string }>;
    abort(jobId: string): Promise<void>;
    on(event: 'stream' | 'file-complete' | 'progress' | 'error', cb: (data: unknown) => void): () => void;
  };
  search: {
    query(query: string): Promise<SearchResult[]>;
    fetchUrl(url: string): Promise<string>;
  };
  export: {
    zip(req: ExportRequest): Promise<{ zipPath: string }>;
    openFolder(path: string): Promise<void>;
    pickDirectory(): Promise<string | null>;
  };
  keys: {
    save(provider: Provider, key: string): Promise<void>;
    getMasked(provider: Provider): Promise<string>;
    delete(provider: Provider): Promise<void>;
  };
  project: {
    save(project: Project): Promise<void>;
    load(projectId: string): Promise<Project>;
    list(): Promise<ProjectMeta[]>;
    delete(projectId: string): Promise<void>;
    writeFile(projectId: string, path: string, content: string): Promise<void>;
    readFile(projectId: string, path: string): Promise<string>;
  };
  snapshot: {
    push(projectId: string, snapshot: IterationSnapshot): Promise<void>;
    undo(projectId: string): Promise<IterationSnapshot | null>;
    redo(projectId: string): Promise<IterationSnapshot | null>;
  };
  settings: {
    save(settings: Settings): Promise<void>;
    load(): Promise<Settings>;
  };
  shell: {
    saveLayout(panelSizes: [number, number, number]): Promise<void>;
    loadLayout(): Promise<{ panelSizes: [number, number, number]; theme: 'dark' | 'light' }>;
  };
  update: {
    check(): Promise<{ hasUpdate: boolean; version?: string }>;
    install(): Promise<void>;
    on(event: 'available' | 'downloaded', cb: (data: unknown) => void): () => void;
  };
}

contextBridge.exposeInMainWorld('forge', forgeAPI);
```

---

## Model Router Design

Il `ModelRouter` di Forge Lite usa il **Vercel AI SDK** (`ai` package) come astrazione unificata su tutti i provider. Tutte le chiamate vengono eseguite esclusivamente nel main process.

### Provider Configuration

```typescript
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI as createOpenRouter } from '@ai-sdk/openai'; // OpenRouter è OpenAI-compatible
// Ollama usa @ai-sdk/openai con baseURL locale — nessuna dipendenza aggiuntiva
import { streamText, generateText } from 'ai';

type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

interface ModelRouterConfig {
  provider: Provider;
  model: string;
  apiKey?: string;
  ollamaEndpoint?: string;          // default: http://localhost:11434
  openRouterModel?: string;         // es. 'meta-llama/llama-3.1-70b-instruct'
  timeoutMs?: number;               // default: 60_000
}
```

### Routing Logic

```
ModelRouter.stream(messages, config)
  │
  ├─► provider === 'anthropic'
  │     └─► createAnthropic({ apiKey }) → streamText()
  │
  ├─► provider === 'openai'
  │     └─► createOpenAI({ apiKey }) → streamText()
  │
  ├─► provider === 'gemini'
  │     └─► createGoogleGenerativeAI({ apiKey }) → streamText()
  │
  ├─► provider === 'openrouter'
  │     └─► createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })
  │           model: config.openRouterModel → streamText()
  │
  └─► provider === 'ollama'
        └─► createOllama({ baseURL: ollamaEndpoint }) → streamText()
              (solo chiamate locali, nessuna rete esterna)
```

### Streaming verso il Renderer

Il main process usa `streamText()` di Vercel AI SDK che restituisce un `AsyncIterable<TextStreamPart>`. Ogni chunk viene inoltrato al renderer tramite `webContents.send('forge:ai:stream', { jobId, chunk, done: false })`. Al termine dello stream, viene inviato `{ done: true }`.

### Timeout e Error Handling

Un `AbortController` con `setTimeout(60_000)` viene passato a `streamText({ abortSignal })`. In caso di errore, il ModelRouter:
1. Cattura l'eccezione
2. Invia `forge:ai:error` con codice strutturato (`PROVIDER_TIMEOUT`, `PROVIDER_ERROR`, `NETWORK_ERROR`)
3. Preserva i file dell'ultima generazione completata con successo
4. Non espone stack trace raw al renderer

---

## Search Service Design

### Jina AI Endpoints

```typescript
const JINA_SEARCH_BASE = 'https://s.jina.ai/';
const JINA_READER_BASE = 'https://r.jina.ai/';
```

Nessuna API key richiesta. Le chiamate vengono effettuate esclusivamente dal main process.

### Search Cache (in-memory, session-scoped)

```typescript
class SearchCache {
  private cache = new Map<string, { result: SearchResult[]; timestamp: number }>();
  private readonly TTL_MS = Infinity;  // scoped alla sessione, nessuna scadenza

  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  get(query: string): SearchResult[] | null {
    const key = this.normalizeQuery(query);
    return this.cache.get(key)?.result ?? null;
  }

  set(query: string, result: SearchResult[]): void {
    const key = this.normalizeQuery(query);
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### SearchService

```typescript
class SearchService {
  private cache = new SearchCache();

  async search(query: string): Promise<SearchResult[]> {
    const cached = this.cache.get(query);
    if (cached) return cached;                   // hit: nessuna chiamata di rete

    try {
      const encoded = encodeURIComponent(query);
      const res = await fetch(`${JINA_SEARCH_BASE}${encoded}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Jina search error: ${res.status}`);
      const data = await res.json() as JinaSearchResponse;
      const results = parseJinaResults(data);
      this.cache.set(query, results);
      return results;
    } catch (err) {
      // Fallback silenzioso: builder procede senza search
      console.warn('[SearchService] Unavailable:', err);
      return [];
    }
  }

  async fetchUrl(url: string): Promise<string> {
    // NOTA: Jina Reader si aspetta l'URL senza encoding.
    // Corretto:   https://r.jina.ai/https://example.com
    // Sbagliato:  https://r.jina.ai/https%3A%2F%2Fexample.com
    const res = await fetch(`${JINA_READER_BASE}${url}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Jina reader error: ${res.status}`);
    return res.text();
  }
}
```

---

## Builder Pipeline

Il Builder orchestra l'intera pipeline: Brief approvato → prompt construction → chiamate AI → file output → live preview update.

```
Brief (JSON approvato)
    │
    ▼
[1] Search Phase
    │  SearchService.search("${siteType} ${style.id} design inspiration")
    │  → aggiunge risultati come contesto al prompt
    │
    ▼
[2] Prompt Construction
    │  SystemPrompt + StyleToken.promptBlock + Brief JSON + SearchResults
    │  → produce il prompt completo per la generazione
    │
    ▼
[3] AI Generation (ModelRouter.stream)
    │  Streaming: ogni chunk viene parsato per file boundaries
    │  Parser: riconosce blocchi ```filename\n...content\n```
    │
    ▼
[4] File Extraction
    │  Per ogni file completato:
    │  → webContents.send('forge:ai:file-complete', { path, content, index, total })
    │  → webContents.send('forge:ai:progress', { filesCompleted, filesTotal })
    │
    ▼
[5] File Persistence
    │  ProjectStore.writeFile(projectId, path, content)
    │  → filesystem locale in filesDir del progetto
    │
    ▼
[6] Preview Update
    → renderer riceve forge:ai:file-complete
    → aggiorna Preview (iframe reload o blob URL update)
    → entro 300ms dalla ricezione del chunk
```

### System Prompt Structure

```
You are an expert web developer. Generate a complete, production-ready website.

## Site Brief
{brief as JSON}

## Visual Style: {style.name}
{style.promptBlock}

## Design References (from web search)
{searchResults summary}

## Output Format
Output each file as a fenced code block with the filename as the language tag:
```index.html
...
```
```styles.css
...
```

Generate ALL required files. Do not omit any file.
```

### File Parser (streaming)

Il parser mantiene un buffer e riconosce il pattern `` ``` `` + `filename` come inizio di un nuovo file. Quando trova la tripla backtick di chiusura, marca il file come completo e lo emette.

---

## Style Library Structure

La Style Library contiene 10 stili caricati localmente da `assets/styles/*.json`. Ogni file segue questa struttura:

```typescript
interface StyleDefinition {
  id: string;
  name: string;
  inspiration: string;          // es. 'Stripe', 'Apple', 'Linear'
  description: string;
  thumbnail: string;            // path relativo all'asset
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
  };
  typography: {
    fontFamily: string;
    headingWeight: string;
    bodyWeight: string;
    scale: 'compact' | 'normal' | 'relaxed';
  };
  spacing: 'tight' | 'normal' | 'spacious';
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  shadow: 'none' | 'subtle' | 'medium' | 'strong';
  promptBlock: string;          // blocco di testo iniettato verbatim nel prompt AI
}
```

### I 10 Stili

| ID | Ispirazione | Carattere |
|----|-------------|-----------|
| `stripe` | Stripe | Blu notte, tipografia precisa, gradient sfumati |
| `apple` | Apple | Bianco/nero puro, minimalismo premium, grandi hero |
| `airbnb` | Airbnb | Caldo, rosso corallo, card arrotondate |
| `linear` | Linear | Scuro, neon subtle, UI densa da pro tool |
| `notion` | Notion | Beige/off-white, tipografia serif, note-style |
| `vercel` | Vercel | Nero assoluto, bordi sottili, developer-focus |
| `figma` | Figma | Viola/rosa, playful ma professionale |
| `supabase` | Supabase | Verde elettrico, dark mode, open-source vibe |
| `shadcn` | shadcn/ui | Grigio neutro, system-font, componenti precisi |
| `minimal` | Generic | Bianco, tipografia black, massimo spazio bianco |

---

## Export Service

### ZIP Generation

```typescript
import archiver from 'archiver';

class ExportService {
  async createZip(
    projectId: string,
    template: ExportTemplate,
    destDir: string,
    projectFiles: Record<string, string>,   // path → content
    brief: Brief,
  ): Promise<string> {
    const zipName = `${brief.brandName.toLowerCase().replace(/\s+/g, '-')}-${template}.zip`;
    const zipPath = path.join(destDir, zipName);

    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);

    await new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      output.on('close', resolve);
      archive.pipe(output);

      // File generati dall'AI
      for (const [filePath, content] of Object.entries(projectFiles)) {
        archive.append(content, { name: filePath });
      }

      // File di configurazione template-specifici
      const configFiles = this.getTemplateConfig(template, brief);
      for (const [filePath, content] of Object.entries(configFiles)) {
        archive.append(content, { name: filePath });
      }

      archive.finalize();
    });

    return zipPath;
  }
```

### Template Configuration Files

#### Template: `vanilla` (HTML/CSS/JS)

```
output/
├── index.html          (generato dall'AI)
├── styles.css          (generato dall'AI)
├── script.js           (generato dall'AI)
└── .gitignore
```

**`.gitignore`:**
```
node_modules/
dist/
.DS_Store
*.env
```

#### Template: `react-vite`

```
output/
├── src/
│   ├── App.tsx         (generato dall'AI)
│   ├── main.tsx        (generato dall'AI)
│   └── index.css       (generato dall'AI)
├── public/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── .gitignore
```

**`package.json` (react-vite):**
```json
{
  "name": "{brandName}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@types/react": "19.1.5",
    "@types/react-dom": "19.1.5",
    "@vitejs/plugin-react": "4.5.2",
    "typescript": "5.8.3",
    "vite": "6.3.5"
  }
}
```

**`vite.config.ts`:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

**`tsconfig.json` (react-vite):**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

**`.gitignore` (react-vite):**
```
node_modules/
dist/
.env
.env.local
.DS_Store
```

#### Template: `nextjs`

```
output/
├── app/
│   ├── layout.tsx      (generato dall'AI)
│   ├── page.tsx        (generato dall'AI)
│   └── globals.css     (generato dall'AI)
├── public/
├── package.json
├── next.config.js
├── tsconfig.json
└── .gitignore
```

**`package.json` (nextjs):**
```json
{
  "name": "{brandName}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.3.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5"
  }
}
```

**`next.config.js`:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

**`tsconfig.json` (nextjs):**
```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**`.gitignore` (nextjs):**
```
.next/
node_modules/
out/
dist/
.env
.env.local
.DS_Store
```

---

## Persistence

### electron-store (metadati)

```typescript
import Store from 'electron-store';

// Schemi separati per tipo di dato

const appStore = new Store<AppStoreSchema>({
  name: 'app-settings',
  schema: { /* Settings, tema, proporzioni pannelli */ },
});

const keyStore = new Store<KeyStoreSchema>({
  name: 'api-keys',
  encryptionKey: machineIdSync(),  // deriva dalla macchina, non hardcoded
});

const projectListStore = new Store<ProjectListSchema>({
  name: 'projects',
  schema: { projects: { type: 'array', maxItems: 20 } },
});
```

**Le API key vengono cifrate** usando `electron-store`'s `encryptionKey` derivato dall'ID univoco della macchina (tramite `node-machine-id`). Questo garantisce che il file store non sia portabile tra macchine diverse e non sia leggibile da altri processi.

### Filesystem (file generati)

I file di codice generati vengono scritti su disco nella directory dei documenti utente:

```
~/Documents/ForgeLite/projects/{projectId}/
├── src/
│   ├── index.html
│   ├── styles.css
│   └── ...
└── .forge/
    └── brief.json
```

`electron-store` salva solo i metadati del progetto (path, brief, template, timestamps). Il contenuto dei file vive interamente sul filesystem.

---

## Iteration Snapshot Stack

Lo stack degli snapshot implementa un undo/redo a livello di sessione con al massimo 10 elementi.

```typescript
class SnapshotManager {
  private stacks = new Map<string, {
    undoStack: IterationSnapshot[];
    redoStack: IterationSnapshot[];
  }>();

  private getOrCreate(projectId: string) {
    if (!this.stacks.has(projectId)) {
      this.stacks.set(projectId, { undoStack: [], redoStack: [] });
    }
    return this.stacks.get(projectId)!;
  }

  push(projectId: string, snapshot: IterationSnapshot): void {
    const { undoStack, redoStack } = this.getOrCreate(projectId);
    redoStack.length = 0;                    // invalida il redo dopo un nuovo push
    undoStack.push(snapshot);
    if (undoStack.length > 10) {
      undoStack.shift();                     // elimina lo snapshot più vecchio
    }
  }

  undo(projectId: string): IterationSnapshot | null {
    const { undoStack, redoStack } = this.getOrCreate(projectId);
    const snapshot = undoStack.pop() ?? null;
    if (snapshot) redoStack.push(snapshot);
    return snapshot;
  }

  redo(projectId: string): IterationSnapshot | null {
    const { undoStack, redoStack } = this.getOrCreate(projectId);
    const snapshot = redoStack.pop() ?? null;
    if (snapshot) undoStack.push(snapshot);
    return snapshot;
  }

  canUndo(projectId: string): boolean {
    return (this.stacks.get(projectId)?.undoStack.length ?? 0) > 0;
  }

  canRedo(projectId: string): boolean {
    return (this.stacks.get(projectId)?.redoStack.length ?? 0) > 0;
  }
}
```

**Invarianti garantite:**
- `undoStack.length <= MAX_SNAPSHOT_SIZE (10)` dopo ogni push — il redoStack non è soggetto a cap esplicito, ma viene svuotato ad ogni push, quindi in pratica non accumula mai più di `MAX_SNAPSHOT_SIZE` elementi
- Un `push` invalida sempre il redoStack (lo tronca a zero)
- `undo` è reversibile con `redo` (finché non c'è un nuovo push intermedio)

---

## Auto-Update

```typescript
// src/main/updater.ts
import { autoUpdater } from 'electron-updater';

autoUpdater.autoDownload = false; // l'utente approva esplicitamente al click su "Installa e riavvia"
autoUpdater.autoInstallOnAppQuit = false;

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('forge:update:available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('forge:update:downloaded', { version: info.version });
  });

  autoUpdater.on('error', () => {
    // Silenzioso: non blocca l'app se il check fallisce
  });

  // Check in background al lancio, senza bloccare l'avvio
  setImmediate(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}));
}
```

Il canale di update viene configurato in `electron-builder.yml` puntando al GitHub Releases del repository.

---

## Correctness Properties

*Una property è una caratteristica o comportamento che deve essere vera per tutte le esecuzioni valide del sistema — essenzialmente, uno statement formale su cosa il sistema dovrebbe fare. Le properties servono da ponte tra le specifiche leggibili dall'uomo e le garanzie di correttezza verificabili automaticamente.*

Per Forge Lite, la property-based testing è applicabile a tutti i componenti con logica pura e input variabile: il ModelRouter (routing deterministico), il SearchCache (invarianti di cache), l'ExportService (integrità ZIP), il KeyStore (round-trip di persistenza), il SnapshotManager (invarianti dello stack), e il sistema di mascheramento delle API key.

La libreria scelta è **`fast-check`** (TypeScript-first, integrazione nativa con Vitest/Jest).

---

### Property 1: Pannelli rispettano sempre la larghezza minima

*For any* configurazione di larghezze dei pannelli dello Shell, le proporzioni risultanti devono garantire che nessun pannello scenda sotto i 200px, indipendentemente dalla larghezza totale della finestra (purché la finestra sia ≥ 600px).

**Validates: Requirements 0.2**

---

### Property 2: Round-trip persistenza configurazione layout

*For any* configurazione di proporzioni dei pannelli (array di 3 numeri positivi che sommano a 100) e tema (`'dark' | 'light'`), serializzare la configurazione tramite `electron-store` e deserializzarla deve produrre un oggetto con valori identici a quelli originali.

**Validates: Requirements 0.6**

---

### Property 3: Brief JSON contiene sempre tutti i campi obbligatori

*For any* Brief generato dal flusso di Plan Mode (indipendentemente dal contenuto della conversazione), il JSON risultante deve contenere tutti i campi obbligatori definiti dall'interfaccia `Brief`: `id`, `siteType`, `pages` (array non vuoto), `style`, `targetAudience`, `brandName`, `colorPalette`.

**Validates: Requirements 1.3, 1.4**

---

### Property 4: SearchCache — idempotenza e assenza di duplicati network

*For any* query di ricerca `Q`, se il `SearchService.search(Q)` viene invocato due o più volte nella stessa sessione, tutti i risultati successivi al primo devono essere identici al primo e deve essere effettuata una sola chiamata di rete (le successive arrivano dalla cache). La query viene normalizzata (trim + lowercase + collasso spazi) prima della chiave di cache.

**Validates: Requirements 3.7**

---

### Property 5: Export ZIP round-trip — integrità e completezza dei file

*For any* insieme di file di progetto (`Record<string, string>` con path e contenuti arbitrari) e qualsiasi template di output (`vanilla`, `react-vite`, `nextjs`), l'archivio ZIP prodotto dall'`ExportService` deve: (a) contenere ogni file dell'input originale con contenuto byte-identico, (b) contenere tutti i file di configurazione richiesti dal template selezionato, (c) non contenere file non presenti nell'insieme originale o nella lista di configurazione del template.

**Validates: Requirements 7.2, 7.3, 7.7**

---

### Property 6: Mascheramento API key — lunghezza preservata e ultimi 4 visibili

*For any* API key di lunghezza N ≥ 4 caratteri, la funzione `maskApiKey(key)` deve: (a) restituire una stringa di lunghezza identica N, (b) i primi N-4 caratteri devono essere sostituiti dal carattere bullet `•`, (c) gli ultimi 4 caratteri devono essere identici agli ultimi 4 della key originale.

**Validates: Requirements 8.5**

---

### Property 7: SnapshotManager — invarianti dello stack undo/redo

*For any* sequenza di operazioni `push`, `undo`, e `redo` sullo `SnapshotManager`, devono valere tutte le seguenti invarianti:
- `undoStack.length <= MAX_SNAPSHOT_SIZE` dopo ogni push (il redoStack viene svuotato ad ogni push, quindi non accumula indipendentemente)
- Dopo un `push`, il `redoStack` è sempre vuoto
- Per qualsiasi stato in cui `canUndo()` è `true`, eseguire `undo()` seguito da `redo()` deve ripristinare lo stesso stato iniziale (round-trip)
- `canUndo()` restituisce `false` se e solo se `undoStack` è vuoto; analogamente per `canRedo()`

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**

---

### Property 8: ModelRouter — routing deterministico per configurazione

*For any* configurazione valida `(provider, model, apiKey)`, il `ModelRouter` deve sempre instradare la chiamata esattamente al provider specificato nella configurazione, senza cadere in fallback automatici quando la configurazione è esplicita e valida. Usando provider mock, per qualsiasi combinazione di input, il provider invocato deve corrispondere esattamente a quello configurato.

**Validates: Requirements 2.2, 2.8**

---

### Property 9: LRU della lista progetti — invariante del limite a 20

*For any* sequenza di N operazioni di aggiunta di progetti (con N > 20), la lista dei progetti recenti deve: (a) avere sempre al massimo 20 elementi dopo ogni operazione, (b) il progetto rimosso al raggiungimento del limite deve essere sempre quello con `updatedAt` più vecchio tra quelli presenti, (c) l'ordine della lista deve essere sempre decrescente per `updatedAt`.

**Validates: Requirements 10.2**

---

### Property 10: Le API key non compaiono mai nei log IPC

*For any* API key di lunghezza N configurata dall'utente, nessun payload di risposta IPC inviato dal main process al renderer tramite `webContents.send()` o restituito via `ipcMain.handle()` deve contenere la chiave in chiaro. L'unica rappresentazione consentita al renderer è la forma mascherata (`•••...abcd`). La verifica è effettuabile intercettando tutti i messaggi IPC con un listener spy e controllando che nessun valore corrisponda alla key originale.

**Validates: Requirements 8.3, 8.4, 8.5, 9.6**

---

### Property 11: Il renderer non esegue mai codice Node.js direttamente

*For any* stato dell'applicazione, il renderer process deve avere `nodeIntegration: false` e `contextIsolation: true`. In tutti i path di esecuzione, le API Node.js (`fs`, `path`, `child_process`, `net`, ecc.) non devono essere accessibili da `window` nel renderer. La verifica è effettuabile testando che `window.require`, `window.process.binding`, e `window.__electron_preload` non espongano moduli Node.js nativi oltre all'oggetto `window.forge` esplicitamente whitelisted.

**Validates: Requirements 9.3**

---

### Property 12: Un Brief non approvato non può avviare il Builder

*For any* stato del sistema in cui `briefStatus !== 'approved'` (ovvero `'collecting'` o `'ready'`), il canale IPC `forge:ai:generate` non deve mai essere invocato. L'invariante è verificabile osservando che: (a) il pulsante "Approva e Genera" nel renderer chiama `forge:ai:generate` solo dopo aver ricevuto conferma esplicita dall'utente, (b) il handler `ipcMain.handle('forge:ai:generate')` deve validare che il Brief ricevuto nel payload sia strutturalmente completo (tutti i campi obbligatori non-null) e rifiutare la richiesta con `INVALID_PAYLOAD` se non lo è.

**Validates: Requirements 1.5, 1.7, 2.2**

---

## Error Handling

### Principi Generali

1. **Mai esporre stack trace raw al renderer** — ogni errore viene trasformato in un `IpcError` strutturato con `code` e `message` leggibili
2. **Fallback graceful per servizi non critici** — la web search (Jina AI) fallisce silenziosamente, il Builder prosegue
3. **Preservazione dati in caso di errore generazione** — i file dell'ultima generazione completata non vengono mai sovrascritti da file parziali
4. **Validazione input IPC** — tutti i payload ricevuti da ipcMain vengono validati prima dell'esecuzione (Zod schemas)

### Error Code Reference

| Codice | Trigger | Comportamento |
|--------|---------|---------------|
| `PROVIDER_TIMEOUT` | Nessuna risposta entro 60s | Interrompe generazione, preserva file precedenti |
| `PROVIDER_ERROR` | Errore API provider (4xx, 5xx) | Notifica utente con messaggio provider, preserva file |
| `NETWORK_ERROR` | Assenza connessione | Distingue search (silenzioso) da AI (notifica) |
| `MISSING_API_KEY` | Generazione senza key configurata | Blocca e reindirizza a Settings_Panel |
| `EXPORT_WRITE_ERROR` | Permessi insufficienti su directory | Mostra path + motivo esatto |
| `PROJECT_NOT_FOUND` | projectId non esistente in store | Ritorna null, non crash |
| `INVALID_PAYLOAD` | Dati IPC malformati | Ritorna error 400-style, non esegue |

---

## Testing Strategy

### Approccio Duale

Il testing di Forge Lite usa due livelli complementari:

**Unit + Integration Tests** (Vitest):
- Componenti React: Vitest + Testing Library
- IPC handlers: Vitest con electron mocked
- Servizi main process: Vitest con fetch mocked
- Casi specifici, edge cases, e condizioni di errore

**Property-Based Tests** (fast-check + Vitest):
- Minimum 100 iterazioni per property test
- Ogni test referenzia la property del design document nel tag
- Tag format: `// Feature: forge-lite-website-builder, Property N: {title}`

### Property Test Examples

```typescript
// tests/property/snapshot-manager.test.ts
// Feature: forge-lite-website-builder, Property 7: SnapshotManager invariants

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { SnapshotManager } from '../../src/main/snapshot-manager';

describe('SnapshotManager — Property 7', () => {
  it('stack size never exceeds 10 after any push sequence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.uuid(), timestamp: fc.string(), brief: fc.anything(), files: fc.dictionary(fc.string(), fc.string()), description: fc.string() }), { minLength: 1, maxLength: 25 }),
        (snapshots) => {
          const manager = new SnapshotManager();
          for (const snap of snapshots) {
            manager.push('project-1', snap as any);
          }
          const state = manager.getState('project-1');
          return state.undoStack.length + state.redoStack.length <= 10;
        }
      ),
      { numRuns: 200 }
    );
  });
});
```

```typescript
// tests/property/api-key-masking.test.ts
// Feature: forge-lite-website-builder, Property 6: API key masking

import fc from 'fast-check';
import { maskApiKey } from '../../src/main/key-store';

it('masks all but last 4 chars, preserves length', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 4, maxLength: 128 }),
      (key) => {
        const masked = maskApiKey(key);
        const last4 = key.slice(-4);
        const bullets = masked.slice(0, masked.length - 4);
        return (
          masked.length === key.length &&
          masked.endsWith(last4) &&
          [...bullets].every(c => c === '•')
        );
      }
    ),
    { numRuns: 500 }
  );
});
```

```typescript
// tests/property/search-cache.test.ts
// Feature: forge-lite-website-builder, Property 4: SearchCache idempotency

import fc from 'fast-check';
import { SearchCache } from '../../src/main/search-service';

it('same query always returns same result (cache hit)', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }),
      fc.array(fc.record({ title: fc.string(), url: fc.string(), snippet: fc.string() })),
      (query, results) => {
        const cache = new SearchCache();
        cache.set(query, results as any);
        const first = cache.get(query);
        const second = cache.get(query);
        return JSON.stringify(first) === JSON.stringify(second);
      }
    ),
    { numRuns: 200 }
  );
});
```

### Test Coverage Targets

| Layer | Tool | Target |
|-------|------|--------|
| Pure functions (masking, routing, cache) | Vitest + fast-check | 100% |
| IPC handlers | Vitest + electron mock | ≥ 80% |
| React components | Vitest + Testing Library | ≥ 70% |
| Builder pipeline | Vitest + AI SDK mock | ≥ 80% |
| Export Service | Vitest + archiver | ≥ 90% |
| E2E (smoke) | Playwright + electron | Critical paths |
