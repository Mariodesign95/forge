# Implementation Plan: Forge Lite Website Builder — Phase 1 (MVP)

## Overview

Piano di implementazione incrementale per Forge Lite: un'applicazione desktop Electron + React + TypeScript che permette di costruire siti web tramite AI. Ogni task produce codice funzionante e integrabile nello step successivo. L'implementazione segue l'architettura definita nel design document, rispettando il modello di sicurezza Electron (main/preload/renderer separati), il ModelRouter via Vercel AI SDK, e la pipeline Builder → Preview → Export.

---

## Tasks

- [~] 1. Setup progetto e struttura base
  - [-] 1.1 Inizializza il progetto Electron + React + TypeScript + Vite
    - Crea la struttura directory: `src/main/`, `src/preload/`, `src/renderer/`, `assets/styles/`, `tests/`
    - Configura `package.json` root con `electron-builder`, dipendenze principali: `electron`, `electron-builder`, `electron-updater`, `electron-store`, `node-machine-id`, `archiver`, `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `react`, `react-dom`, `@monaco-editor/react`, `react-resizable-panels`, `zustand`, `html2canvas`, `fast-check`, `vitest`, `@testing-library/react`; devDependencies: `@types/archiver`
    - Configura `tsconfig.json` radice + `tsconfig.main.json` + `tsconfig.renderer.json`
    - Configura Vite per il renderer (`vite.config.ts`) e il build Electron (`electron-builder.yml`)
    - Crea `src/shared/ipc-channels.ts` con tutte le costanti dei canali IPC definite nel design (request/response e push events)
    - Crea `src/renderer/types/index.ts` con tutti i tipi condivisi: `Brief` (incluso il campo `language`), `Project`, `ProjectMeta`, `ProjectFile`, `IterationSnapshot`, `ChatMessage`, `ChatMode`, `ChatState`, `Provider`, `ProviderConfig`, `Settings`, `ExportTemplate`, `StyleToken`, `PageDefinition`, `TypographySpec`, `IpcRequest`, `IpcResponse`, `IpcError`, `ViewportSize`, `SearchResult`, `StyleDefinition`
    - _Requirements: 9.1, 9.2, 9.3_

  - [-] 1.2 Configura il main process entry point con BrowserWindow sicura
    - Crea `src/main/index.ts`: crea `BrowserWindow` con `nodeIntegration: false`, `contextIsolation: true`, preload path corretto
    - Registra tutti i canali `ipcMain.handle()` importando da `ipc-handlers.ts`
    - Gestisce `app.on('ready')`, `app.on('window-all-closed')`, `app.on('activate')`
    - _Requirements: 9.3, 9.4_

  - [-] 1.3 Implementa il preload script con contextBridge
    - Crea `src/preload/index.ts`: espone `window.forge` via `contextBridge.exposeInMainWorld` con tutti i namespace definiti nel design (`ai`, `search`, `export`, `keys`, `project`, `snapshot`, `settings`, `shell`, `update`)
    - Ogni metodo wrappa `ipcRenderer.invoke()` o `ipcRenderer.send()` con i canali corretti da `ipc-channels.ts`
    - Implementa `forge.ai.on()` e `forge.update.on()` per la sottoscrizione agli eventi push (ritorna una funzione di cleanup che chiama `ipcRenderer.removeListener`)
    - _Requirements: 9.3, 9.5_

- [ ] 2. Implementa KeyStore e Settings persistenza
  - [x] 2.1 Implementa `KeyStore` con electron-store cifrato
    - Crea `src/main/key-store.ts`: istanzia `electron-store` con `encryptionKey: machineIdSync()` da `node-machine-id`
    - Espone: `saveKey(provider, key)`, `getKey(provider)`, `deleteKey(provider)`, `getMasked(provider)` → restituisce `'•'.repeat(key.length - 4) + key.slice(-4)` per key ≥ 4 chars
    - Esporta la funzione pura `maskApiKey(key: string): string` per i test
    - _Requirements: 8.3, 8.4, 8.5_

  - [ ]* 2.2 Scrivi property test per maskApiKey (Property 6)
    - **Property 6: Mascheramento API key — lunghezza preservata e ultimi 4 visibili**
    - **Validates: Requirements 8.5**
    - File: `tests/property/api-key-masking.test.ts`
    - Usa `fc.string({ minLength: 4, maxLength: 128 })` per generare key arbitrarie
    - Verifica: (a) `masked.length === key.length`, (b) i primi N-4 char sono tutti `•`, (c) gli ultimi 4 sono identici alla key originale
    - `numRuns: 500`

  - [~] 2.3 Implementa IPC handlers per keys e settings e `AppStore`
    - Crea `src/main/ipc-handlers.ts`: registra `forge:keys:save`, `forge:keys:get-masked`, `forge:keys:delete`, `forge:keys:has`
    - Crea `src/main/app-store.ts`: gestisce **solo** `appStore` (settings, tema, layout panel) — **non** la lista progetti (quella è responsabilità di Task 6.1)
    - Registra `forge:settings:save`, `forge:settings:load`, `forge:shell:layout:save`, `forge:shell:layout:load`
    - Valida tutti i payload IPC prima dell'esecuzione (Zod schemas o validazione manuale)
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 9.4, 9.6, 0.6_

  - [ ]* 2.4 Scrivi unit test per KeyStore e Settings handlers
    - Test: `saveKey` + `getMasked` round-trip, `deleteKey` rimuove la key, provider Ollama usa endpoint URL
    - Mock `electron-store` e `node-machine-id`
    - _Requirements: 8.3, 8.5_

- [ ] 3. Implementa ModelRouter (Vercel AI SDK)
  - [-] 3.1 Implementa `ModelRouter` con i 5 provider
    - Crea `src/main/model-router.ts`
    - Importa: `createAnthropic`, `createOpenAI`, `createGoogleGenerativeAI` dai rispettivi `@ai-sdk/*` packages
    - Implementa il routing: `anthropic` → `createAnthropic`, `openai` → `createOpenAI`, `gemini` → `createGoogleGenerativeAI`, `openrouter` → `createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })`, `ollama` → `createOpenAI({ baseURL: ollamaEndpoint + '/v1' })`
    - Espone `stream(messages, config): AsyncIterable<string>` usando `streamText()` di Vercel AI SDK
    - Implementa timeout con `AbortController` + `setTimeout(60_000)`
    - In caso di errore, cattura e mappa su `IpcError` con codici: `PROVIDER_TIMEOUT`, `PROVIDER_ERROR`, `NETWORK_ERROR`
    - _Requirements: 2.1, 2.2, 2.7, 2.8, 2.9, 2.10_

  - [ ]* 3.2 Scrivi property test per ModelRouter routing deterministico (Property 8)
    - **Property 8: ModelRouter — routing deterministico per configurazione**
    - **Validates: Requirements 2.2, 2.8**
    - File: `tests/property/model-router.test.ts`
    - Usa provider mock (non chiama API reali); per ogni combinazione `(provider, model, apiKey)` verifica che il provider invocato corrisponda esattamente a quello configurato
    - `numRuns: 200`

  - [~] 3.3 Implementa IPC handler per `forge:ai:chat` e `forge:ai:abort`
    - In `src/main/ipc-handlers.ts`: registra `forge:ai:chat` → assegna un `chatJobId` univoco alla chiamata, chiama `ModelRouter.stream()`, itera sull'AsyncIterable e invia `forge:ai:stream` chunks via `webContents.send()`
    - Alla fine dello stream (o su abort), invia `{ done: true }`
    - `forge:ai:abort` accetta un `jobId` opzionale: se passato interrompe quel job specifico; se omesso interrompe l'ultimo job chat attivo
    - Mantiene una `Map<string, AbortController>` **condivisa** per tutti i job attivi (sia chat che builder); la chiave è il `jobId`; il cleanup del controller avviene dopo `done` o `error`
    - _Requirements: 2.4, 2.5, 9.1, 9.5_

- [ ] 4. Implementa SearchService (Jina AI)
  - [-] 4.1 Implementa `SearchCache` e `SearchService`
    - Crea `src/main/search-service.ts`
    - `SearchCache`: `Map<string, SearchResult[]>` in-memory, normalizza query con `trim().toLowerCase().replace(/\s+/g, ' ')`, TTL infinito (session-scoped)
    - `SearchService.search(query)`: controlla cache → se miss chiama `https://s.jina.ai/${encodeURIComponent(query)}` con header `Accept: application/json` e `AbortSignal.timeout(10_000)` → salva in cache → ritorna risultati; in caso di errore, ritorna `[]` senza throw (fallback silenzioso)
    - `SearchService.fetchUrl(url)`: chiama `https://r.jina.ai/${url}` (NO `encodeURIComponent` sull'URL) con `AbortSignal.timeout(15_000)`
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7_

  - [ ]* 4.2 Scrivi property test per SearchCache idempotenza (Property 4)
    - **Property 4: SearchCache — idempotenza e assenza di duplicati network**
    - **Validates: Requirements 3.7**
    - File: `tests/property/search-cache.test.ts`
    - Per qualsiasi query `Q` e risultati `R`: `cache.set(Q, R)` → `cache.get(Q)` ritorna `R` identico in JSON; la stessa query normalizzata produce sempre lo stesso risultato; `numRuns: 200`

  - [~] 4.3 Implementa IPC handlers per `forge:search:query` e `forge:search:fetch`
    - Registra i due canali in `src/main/ipc-handlers.ts`
    - Valida il payload in ingresso prima di chiamare `SearchService`
    - _Requirements: 3.6, 9.4_

- [ ] 5. Implementa SnapshotManager
  - [-] 5.1 Implementa `SnapshotManager`
    - Crea `src/main/snapshot-manager.ts`
    - Implementa la classe con `Map<string, { undoStack: IterationSnapshot[]; redoStack: IterationSnapshot[] }>`
    - `push(projectId, snapshot)`: svuota `redoStack`, fa push su `undoStack`, se `undoStack.length > MAX_SNAPSHOT_SIZE (10)` fa `shift()`
    - `undo(projectId)`: pop da `undoStack`, push su `redoStack`, ritorna snapshot o null
    - `redo(projectId)`: pop da `redoStack`, push su `undoStack`, ritorna snapshot o null
    - `canUndo(projectId)`, `canRedo(projectId)`: booleani
    - Esporta la costante `MAX_SNAPSHOT_SIZE = 10`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 5.2 Scrivi property test per SnapshotManager invarianti (Property 7)
    - **Property 7: SnapshotManager — invarianti dello stack undo/redo**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**
    - File: `tests/property/snapshot-manager.test.ts`
    - Genera sequenze arbitrarie di operazioni `push`/`undo`/`redo` (fino a 25 push)
    - Verifica: (a) `undoStack.length <= 10` sempre, (b) dopo ogni `push` il `redoStack` è vuoto, (c) `undo()` + `redo()` è round-trip (ripristina stato iniziale), (d) `canUndo()` ↔ `undoStack.length > 0`
    - `numRuns: 200`

  - [~] 5.3 Implementa IPC handlers per snapshot
    - Registra `forge:snapshot:push`, `forge:snapshot:undo`, `forge:snapshot:redo` in `src/main/ipc-handlers.ts`
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 6. Implementa ProjectStore e gestione filesystem
  - [-] 6.1 Implementa `ProjectStore` con electron-store e filesystem
    - Crea `src/main/project-store.ts` — gestisce **solo** `projectListStore` (lista progetti, LRU max 20); **non** `appStore` (quella è in `app-store.ts`, Task 2.3)
    - Salva metadati progetto in `electron-store` (`projectListStore`), file generati in `~/Documents/ForgeLite/projects/{projectId}/`
    - `saveProject(project)`: serializza metadati, crea directory se non esiste
    - `loadProject(projectId)`: carica metadati da store + legge file da filesystem
    - `listProjects()`: ritorna array `ProjectMeta[]` ordinato per `updatedAt` decrescente, max 20 (LRU: rimuove il più vecchio quando raggiunge il limite)
    - `deleteProject(projectId)`: rimuove metadati da store + cancella directory filesystem
    - `writeFile(projectId, path, content)` / `readFile(projectId, path)`: operazioni su filesystem locale
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 6.2 Scrivi property test per LRU lista progetti (Property 9)
    - **Property 9: LRU della lista progetti — invariante del limite a 20**
    - **Validates: Requirements 10.2**
    - File: `tests/property/project-store.test.ts`
    - Genera sequenze di N > 20 operazioni `saveProject`, verifica: (a) lista mai > 20 elementi, (b) il rimosso al raggiungimento del limite è quello con `updatedAt` più vecchio, (c) lista sempre ordinata `updatedAt` decrescente
    - Mock `electron-store` e `fs`
    - `numRuns: 100`

  - [~] 6.3 Implementa IPC handlers per project
    - Registra `forge:project:save`, `forge:project:load`, `forge:project:list`, `forge:project:delete`, `forge:project:write-file`, `forge:project:read-file`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [~] 7. Checkpoint — core services completi
  - Verifica che tutti i test unitari e property-based dei task 2–6 passino
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implementa ExportService
  - [~] 8.1 Implementa `ExportService` con archiver
    - Crea `src/main/export-service.ts`
    - Implementa `createZip(projectId, template, destDir, projectFiles, brief)`: usa `archiver('zip', { zlib: { level: 9 } })`, aggiunge ogni file del progetto, aggiunge i file di configurazione specifici del template
    - Implementa `getTemplateConfig(template, brief)`: ritorna i file di configurazione per `vanilla` (`.gitignore`), `react-vite` (`package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`) e `nextjs` (`package.json`, `next.config.js`, `tsconfig.json`, `.gitignore`) con i contenuti esatti definiti nel design
    - Il nome del ZIP è `{brandName.toLowerCase().replace(/\s+/g, '-')}-{template}.zip`
    - In caso di errore write, lancia eccezione mappata su `IpcError` con codice `EXPORT_WRITE_ERROR`
    - _Requirements: 7.2, 7.3, 7.7_

  - [ ]* 8.2 Scrivi property test per ExportService round-trip ZIP (Property 5)
    - **Property 5: Export ZIP round-trip — integrità e completezza dei file**
    - **Validates: Requirements 7.2, 7.3, 7.7**
    - File: `tests/property/export-service.test.ts`
    - Per qualsiasi `Record<string, string>` di file e qualsiasi template, verifica: (a) ogni file dell'input è nel ZIP con contenuto byte-identico, (b) tutti i file di configurazione del template sono presenti, (c) nessun file extra non previsto
    - Usa `unzipper` o `adm-zip` per leggere l'archivio nei test
    - `numRuns: 100`

  - [~] 8.3 Implementa IPC handlers per export
    - Registra `forge:export:zip`, `forge:export:open-folder`, `forge:export:pick-directory`
    - `forge:export:open-folder` usa `shell.openPath()`
    - `forge:export:pick-directory` usa `dialog.showOpenDialog({ properties: ['openDirectory'] })`
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

- [ ] 9. Implementa Style Library
  - [~] 9.1 Crea i 10 file JSON degli stili
    - Crea `assets/styles/stripe.json`, `apple.json`, `airbnb.json`, `linear.json`, `notion.json`, `vercel.json`, `figma.json`, `supabase.json`, `shadcn.json`, `minimal.json`
    - Ogni file rispetta la struttura `StyleDefinition` definita nel design: `id`, `name`, `inspiration`, `description`, `thumbnail`, `colors` (8 campi), `typography`, `spacing`, `borderRadius`, `shadow`, `promptBlock`
    - Il `promptBlock` contiene le istruzioni stilistiche dettagliate iniettate nel prompt AI
    - _Requirements: 4.1, 4.6_

  - [~] 9.2 Implementa `StyleLibrary` loader
    - Crea `src/main/style-library.ts`
    - `loadStyles()`: legge tutti i 10 file JSON da `assets/styles/`, li valida, ritorna `StyleDefinition[]`
    - Caricamento sincrono all'avvio del main process (o lazy on first request)
    - `getStyleById(id)`: ritorna il token corrispondente o `null`
    - _Requirements: 4.1, 4.6_

- [ ] 10. Implementa Builder pipeline
  - [~] 10.1 Crea il file parser per lo streaming AI
    - Crea `src/main/builder.ts` — sezione parser
    - Il parser mantiene un buffer e riconosce il pattern `<<FILE:path>>` ... `<<END_FILE>>` per i blocchi file
    - Quando trova un file completo, lo emette come `{ path, content }`
    - Gestisce il parsing incrementale (chunk per chunk dallo stream)
    - _Requirements: 2.3, 2.4_

  - [~] 10.2 Implementa la pipeline Builder completa
    - In `src/main/builder.ts`:
    - **Phase 1 — Search**: `SearchService.search("${brief.siteType} ${brief.style.id} design inspiration")`; se fallisce, prosegue senza risultati
    - **Phase 2 — Prompt Construction**: assembla system prompt con `Brief JSON` + `StyleToken.promptBlock` + search results summary; definisce il formato di output con pattern `<<FILE:path>>` / `<<END_FILE>>`
    - **Phase 3 — AI Generation**: chiama `ModelRouter.stream()`, itera i chunk, alimenta il file parser
    - **Phase 4 — File Emission**: per ogni file completato: `webContents.send('forge:ai:file-complete', { jobId, path, content, index, total })` + `webContents.send('forge:ai:progress', { jobId, filesCompleted, filesTotal, provider })`
    - **Phase 5 — Persistence**: chiama `ProjectStore.writeFile()` per ogni file
    - Implementa `abort(jobId)`: chiama `AbortController.abort()`
    - Preserva i file dell'ultima generazione completata in caso di errore (non sovrascrive con file parziali)
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.3, 3.4, 3.5, 4.4, 4.5_

  - [~] 10.3 Implementa IPC handler per `forge:ai:generate`
    - Registra `forge:ai:generate` in `src/main/ipc-handlers.ts`
    - Valida che il Brief nel payload sia strutturalmente completo (tutti i campi obbligatori non-null): se non lo è, ritorna `IpcError` con codice `INVALID_PAYLOAD`
    - Avvia `Builder.build(brief, provider, model, jobId, mainWindow)` in modo asincrono
    - Ritorna `{ jobId }` immediatamente
    - _Requirements: 1.7, 2.2, 2.3, 9.4_

- [ ] 11. Implementa AutoUpdater
  - [~] 11.1 Implementa `initAutoUpdater`
    - Crea `src/main/updater.ts`
    - Configura `autoUpdater.autoDownload = false`, `autoUpdater.autoInstallOnAppQuit = false`
    - Listener `update-available` → `mainWindow.webContents.send('forge:update:available', { version })`
    - Listener `update-downloaded` → `mainWindow.webContents.send('forge:update:downloaded', { version })`
    - Listener `error` → silenzioso (non blocca l'app)
    - `initAutoUpdater(mainWindow)`: chiama `setImmediate(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}))`
    - Registra `forge:update:check` e `forge:update:install` in `ipc-handlers.ts`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [~] 12. Checkpoint — main process completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implementa renderer: tipi, store Zustand, hook IPC
  - [~] 13.1 Configura Zustand stores nel renderer
    - Crea `src/renderer/stores/appStore.ts`: stato tema (`'dark' | 'light'`), proporzioni pannelli `[number, number, number]`; azioni `setTheme`, `setPanelSizes`
    - Crea `src/renderer/stores/chatStore.ts`: `ChatState` completo (`mode`, `messages`, `brief`, `briefStatus`, `streamingMessageId`); azioni `addMessage`, `updateStreamingMessage`, `setBrief`, `setBriefStatus`, `setMode`, `clearChat`
    - Crea `src/renderer/stores/projectStore.ts`: progetto corrente (`Project | null`), file generati (`ProjectFile[]`), file attivo, lista progetti recenti; azioni `setProject`, `setFiles`, `setActiveFile`, `updateFileContent`
    - _Requirements: 0.4, 1.2, 1.4, 10.3_

  - [~] 13.2 Implementa hook `useIpc` tipizzato
    - Crea `src/renderer/hooks/useIpc.ts`: wrapper typed per tutti i metodi `window.forge.*`
    - Gestisce l'errore IPC ritornando `IpcResponse` strutturato al caller (no throw non gestiti)
    - Espone `useForgeAiEvents()` per sottoscriversi a `forge:ai:stream`, `forge:ai:file-complete`, `forge:ai:progress`, `forge:ai:error` con auto-cleanup sul unmount
    - _Requirements: 9.5, 9.6_

  - [~] 13.3 Implementa hook `useSnapshotStack` e `useBuilder`
    - `src/renderer/hooks/useSnapshotStack.ts`: wrappa `window.forge.snapshot.*`, espone `canUndo`, `canRedo`, `pushSnapshot`, `undo`, `redo`
    - `src/renderer/hooks/useBuilder.ts`: gestisce lo stato di generazione (streaming, progress, isGenerating), debounce 500ms su `onChange` tramite `useEffect`, chiama `window.forge.ai.generate()` e ascolta gli eventi push per aggiornare `projectStore`
    - _Requirements: 2.4, 2.5, 5.3, 11.2, 11.3_

  - [~] 13.4 Implementa hook `useProjectStore` renderer-side
    - `src/renderer/hooks/useProjectStore.ts`: wrappa le chiamate `window.forge.project.*`, sincronizza con lo Zustand `projectStore`, gestisce il caricamento progetti recenti
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 14. Implementa Shell e layout principale
  - [~] 14.1 Implementa `Shell.tsx` con react-resizable-panels
    - Crea `src/renderer/components/Shell/Shell.tsx`
    - Usa `PanelGroup` + `Panel` + `PanelResizeHandle` da `react-resizable-panels` per il layout a tre pannelli (Chat | Editor | Preview)
    - Imposta `minSize` equivalente a 200px per ciascun pannello
    - Al cambio di dimensioni, chiama `window.forge.shell.saveLayout(panelSizes)` (debounced)
    - All'avvio, carica layout e tema via `window.forge.shell.loadLayout()` e aggiorna `appStore`
    - _Requirements: 0.1, 0.2, 0.6_

  - [~] 14.2 Implementa `TopBar.tsx` e `PanelDivider.tsx`
    - `TopBar.tsx`: toggle visibility per ciascun pannello, pulsante Settings, pulsante Export (abilitato solo dopo generazione), indicatore update
    - `PanelDivider.tsx`: drag handle personalizzato per i resize handle di `react-resizable-panels`
    - _Requirements: 0.7_

  - [~] 14.3 Implementa responsive collapse sotto 900px
    - In `Shell.tsx`: monitora `window.innerWidth` con `ResizeObserver`
    - Quando larghezza < 900px, nasconde `PanelGroup` e mostra `NavigationTabs` (`Chat | Code | Preview`) con un singolo pannello visibile alla volta
    - _Requirements: 0.3_

  - [ ]* 14.4 Scrivi property test per pannelli e larghezza minima (Property 1)
    - **Property 1: Pannelli rispettano sempre la larghezza minima**
    - **Validates: Requirements 0.2**
    - File: `tests/property/shell-panels.test.ts`
    - Per qualsiasi larghezza finestra ≥ 600px e qualsiasi distribuzione di proporzioni, verifica che nessun pannello calcolato scenda sotto 200px
    - `numRuns: 200`

  - [ ]* 14.5 Scrivi property test per round-trip layout (Property 2)
    - **Property 2: Round-trip persistenza configurazione layout**
    - **Validates: Requirements 0.6**
    - File: `tests/property/layout-persistence.test.ts`
    - Per qualsiasi array `[a, b, c]` con `a + b + c = 100` e tema `'dark' | 'light'`: serializza via `electron-store` mock, deserializza, verifica valori identici
    - `numRuns: 200`

- [ ] 15. Implementa Settings Panel
  - [~] 15.1 Implementa `Settings_Panel.tsx` e sotto-componenti
    - Crea `src/renderer/components/Settings_Panel/Settings_Panel.tsx`: pannello accessibile da icona in `TopBar`, mostra form provider/modello e campi API key
    - Crea `ApiKeyField.tsx`: input di tipo password con `onChange` che chiama `window.forge.keys.save()` al blur; mostra valore mascherato (`getMasked`) su load; pulsante "Cancella" che chiama `window.forge.keys.delete()`
    - Crea `ModelSelector.tsx`: dropdown provider (`anthropic`, `openai`, `gemini`, `openrouter`, `ollama`) + input testo model; per Ollama mostra campo URL endpoint (default `http://localhost:11434`); per OpenRouter mostra campo model identifier
    - Crea `ThemeToggle.tsx`: switch dark/light che aggiorna `appStore.setTheme` e chiama `window.forge.settings.save()`
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 8.8_

  - [ ]* 15.2 Scrivi unit test per ApiKeyField e mascheramento
    - Verifica che il DOM non mostri mai la key in chiaro, solo la forma mascherata
    - Verifica che `window.forge.keys.save` venga chiamata al blur con il valore corretto
    - Mock `window.forge`
    - _Requirements: 8.5_

- [ ] 16. Implementa AI_Chat (Plan Mode + Iteration Mode)
  - [~] 16.1 Implementa `AI_Chat.tsx` con `MessageList` e `MessageInput`
    - Crea `src/renderer/components/AI_Chat/AI_Chat.tsx`: legge `chatStore.mode`, renderizza `MessageList` + `MessageInput`
    - Crea `MessageList.tsx`: lista scrollabile di `ChatMessage`; il messaggio con `isStreaming: true` mostra un cursore animato; auto-scroll all'ultimo messaggio
    - Crea `MessageInput.tsx`: textarea con invio tramite Enter (Shift+Enter = newline), pulsante Send; disabilitato mentre `isGenerating`
    - All'invio, chiama `window.forge.ai.chat()` e ascolta `forge:ai:stream` per aggiornare il messaggio in streaming nel `chatStore`
    - _Requirements: 1.1, 1.2_

  - [~] 16.2 Implementa `StylePicker.tsx` e `BriefPreview.tsx`
    - `StylePicker.tsx`: griglia di card con i 10 stili (caricati via IPC o bundle locale), selezione aggiorna il Brief in `chatStore`; ogni card mostra nome, ispirazione, colori campione
    - `BriefPreview.tsx`: visualizza il Brief corrente in formato leggibile (siteType, pages, style, targetAudience, brandName, colorPalette); accessibile quando `briefStatus === 'ready' || 'approved'`
    - _Requirements: 1.4, 4.2, 4.3_

  - [~] 16.3 Implementa `BriefActions.tsx` e transizione Plan → Iteration Mode
    - `BriefActions.tsx`: mostra i pulsanti "Approva e Genera" e "Modifica Brief" solo quando `briefStatus === 'ready'`
    - "Approva e Genera": setta `briefStatus = 'approved'`, chiama `window.forge.ai.generate()`, transiziona a Iteration Mode
    - "Modifica Brief": setta `briefStatus = 'collecting'`, riprende conversazione in Plan Mode
    - Salva lo stato conversazionale tramite `window.forge.project.save()` (per ripristino su riapertura — Requirement 1.8)
    - _Requirements: 1.5, 1.6, 1.7, 1.8_

  - [ ]* 16.4 Scrivi property test per Brief campi obbligatori (Property 3)
    - **Property 3: Brief JSON contiene sempre tutti i campi obbligatori**
    - **Validates: Requirements 1.3, 1.4**
    - File: `tests/property/brief-validation.test.ts`
    - Per qualsiasi Brief generato (usando `fc.record` con i campi definiti), verifica presenza di tutti i campi obbligatori: `id`, `siteType`, `pages` (array non vuoto), `style`, `targetAudience`, `brandName`, `colorPalette`, `language`
    - `numRuns: 300`

  - [ ]* 16.5 Scrivi unit test per BriefActions (Property 12)
    - **Property 12: Un Brief non approvato non può avviare il Builder**
    - **Validates: Requirements 1.5, 1.7, 2.2**
    - Verifica che `forge:ai:generate` NON venga chiamato quando `briefStatus !== 'approved'`
    - Verifica che il pulsante "Approva e Genera" sia disabilitato se `briefStatus === 'collecting'`
    - Mock `window.forge.ai.generate`

- [ ] 17. Implementa Editor (Monaco)
  - [~] 17.1 Implementa `Editor.tsx` con `@monaco-editor/react`
    - Crea `src/renderer/components/Editor/Editor.tsx`: wrapper Monaco, legge `activeFile` da `projectStore`, passa `language` corretto basato sull'estensione (`html`, `css`, `javascript`, `typescript`, `tsx`, `jsx`, `json`)
    - `onChange`: aggiorna `projectStore.updateFileContent()`, avvia il debounce 500ms in `useBuilder`
    - Sincronizza tema Monaco con `appStore.theme` (`vs-dark` / `vs`)
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [~] 17.2 Implementa `FileTree.tsx` e `EditorToolbar.tsx`
    - `FileTree.tsx`: albero navigabile dei file del progetto (`projectStore.files`), click su nodo chiama `projectStore.setActiveFile()`; mantiene la posizione cursore per file già visitati via `cursorPosition` su `ProjectFile`
    - `EditorToolbar.tsx`: pulsante Save (Ctrl+S), pulsanti Undo iterazione / Redo iterazione (chiama `useSnapshotStack`), stato disabilitato in base a `canUndo`/`canRedo`
    - _Requirements: 5.4, 5.5, 11.2, 11.3, 11.5, 11.6_

- [ ] 18. Implementa Preview (iframe sandbox)
  - [~] 18.1 Implementa `Preview.tsx` con iframe srcDoc
    - Crea `src/renderer/components/Preview/Preview.tsx`
    - Renderizza un `<iframe sandbox="allow-scripts">` (solo `allow-scripts`, senza `allow-same-origin`) con attributo `srcDoc`
    - `srcDoc` viene costruito assemblea i file self-contained del progetto: per template vanilla, concatena HTML + CSS inline + JS; il codice è già self-contained (niente risorse relative esterne)
    - Aggiorna `srcDoc` quando cambia il contenuto dei file (da eventi `forge:ai:file-complete` o da save in Editor) entro il timeout specificato (300ms per generazione, 500ms per save)
    - Mostra overlay di loading (`isGenerating`) sovrapposto all'iframe parziale
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [~] 18.2 Implementa `ViewportControls.tsx` e `PreviewToolbar.tsx`
    - `ViewportControls.tsx`: bottoni Mobile (375px) / Tablet (768px) / Desktop (1280px), aggiornano la larghezza dell'iframe (container con overflow hidden)
    - `PreviewToolbar.tsx`: label viewport corrente, pulsante refresh manuale
    - _Requirements: 6.6_

- [ ] 19. Implementa tema Dark/Light
  - [~] 19.1 Implementa CSS custom properties e ThemeToggle wiring
    - Crea `src/renderer/styles/themes.css`: definisce CSS custom properties per tema dark (default) e light (`[data-theme="light"]`)
    - In `App.tsx`: al mount, carica tema da `window.forge.shell.loadLayout()`, imposta `document.documentElement.dataset.theme`; si sottoscrive a `appStore.theme` per aggiornare il dato senza riavvio
    - Crea `src/renderer/styles/globals.css` con reset, font, variabili base
    - _Requirements: 0.4, 0.5_

- [ ] 20. Implementa App.tsx, React entry point e wiring finale
  - [~] 20.1 Implementa `App.tsx` e `main.tsx`
    - Crea `src/renderer/main.tsx`: entry React, monta `<App />` nel DOM
    - Crea `src/renderer/App.tsx`: renderizza `<Shell>` con i tre pannelli (`AI_Chat`, `Editor`, `Preview`); si sottoscrive a `useForgeAiEvents()` per distribuire gli eventi push agli store/hook corretti; mostra banner update quando `forge:update:available` arriva
    - All'avvio, chiama `window.forge.shell.loadLayout()` per ripristinare proporzioni e tema
    - Controlla se `forge:keys:get-masked` per provider attivo ritorna una key configurata; se no, redirect a `Settings_Panel`
    - _Requirements: 0.1, 0.4, 0.6, 8.7, 12.3_

  - [~] 20.2 Implementa schermata progetti recenti / Home
    - In `App.tsx` (o componente `Home.tsx`): se nessun progetto attivo, mostra la lista dei progetti recenti (`window.forge.project.list()`), card di "Nuovo progetto", e pulsante "Elimina" per ciascun progetto (con dialog di conferma)
    - Selezione progetto chiama `window.forge.project.load(projectId)` e popola `projectStore`
    - _Requirements: 10.2, 10.3, 10.5_

  - [~] 20.3 Implementa blocco generazione senza API key e redirect
    - In `BriefActions.tsx` (prima della chiamata `forge:ai:generate`): verifica che la key per il provider attivo sia configurata chiamando `window.forge.keys.getMasked(provider)` — se ritorna stringa vuota, mostra messaggio esplicativo e apre `Settings_Panel`
    - _Requirements: 8.7_

- [ ] 21. Implementa indicatore di stato generazione e progress
  - [~] 21.1 Implementa progress overlay nella Preview e TopBar
    - In `Preview.tsx`: mostra overlay semitrasparente con spinner e label "Generazione in corso..." mentre `useBuilder.isGenerating === true`
    - In `TopBar.tsx` (o componente dedicato `GenerationStatus.tsx`): mostra `"{provider} — {filesCompleted} / {filesTotal} file"` durante la generazione, basandosi sugli eventi `forge:ai:progress`
    - _Requirements: 2.5_

- [~] 22. Checkpoint finale — integrazione completa
  - Verifica che il flusso end-to-end funzioni: Plan Mode → Brief → Genera → Preview live → Edit → Undo/Redo → Export ZIP
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- I task con `*` sono opzionali e possono essere saltati per un MVP più veloce; i property test garantiscono correttezza formale ma non sono bloccanti
- Ogni task referenzia i requirements specifici per la tracciabilità
- Il pattern `<<FILE:path>>` / `<<END_FILE>>` è la convenzione concordata per il file parser del Builder; assicurarsi che il system prompt usi esattamente questo formato
- La costante `MAX_SNAPSHOT_SIZE = 10` deve essere importata ovunque venga usato il limite degli snapshot (non duplicare il valore)
- L'iframe Preview usa SOLO `sandbox="allow-scripts"` — non aggiungere `allow-same-origin` mai, per sicurezza
- Il Jina Reader (`r.jina.ai`) NON usa `encodeURIComponent` sull'URL; il Jina Search (`s.jina.ai`) USA `encodeURIComponent` sulla query
- Per Ollama, usare `@ai-sdk/openai` con `baseURL: ollamaEndpoint + '/v1'` — nessun package aggiuntivo

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "9.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.2", "5.2", "6.2", "9.2"] },
    { "id": 3, "tasks": ["2.4", "3.3", "4.3", "5.3", "6.3", "8.1", "11.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "10.1"] },
    { "id": 5, "tasks": ["10.2", "10.3"] },
    { "id": 6, "tasks": ["13.1", "13.2"] },
    { "id": 7, "tasks": ["13.3", "13.4"] },
    { "id": 8, "tasks": ["14.1", "15.1", "16.1", "17.1", "18.1", "19.1"] },
    { "id": 9, "tasks": ["14.2", "14.3", "14.4", "14.5", "15.2", "16.2", "17.2", "18.2"] },
    { "id": 10, "tasks": ["16.3", "16.4", "16.5"] },
    { "id": 11, "tasks": ["20.1", "20.2", "21.1"] },
    { "id": 12, "tasks": ["20.3"] }
  ]
}
```
