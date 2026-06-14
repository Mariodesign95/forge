# Forge Lite — AI-Powered Website & Web App Builder

Forge Lite è un costruttore di siti web e web app desktop guidato dall'intelligenza artificiale, sviluppato con **Electron**, **React**, **TypeScript** e **Vite**. 

Consente agli utenti di descrivere a parole il sito che desiderano creare, definire i dettagli tramite una conversazione interattiva (**Plan Mode**), approvare un brief di progetto strutturato in JSON, generare il codice sorgente con un'anteprima live in tempo reale e pubblicare il risultato su GitHub, Vercel o Netlify — tutto all'interno di un'unica applicazione desktop.

---

## 🚀 Caratteristiche Principali

### Phase 1: MVP (Minimum Viable Product)
- **Plan Mode**: Fase di chat pre-generazione per raccogliere i requisiti (palette, stile, target) e comporre un brief strutturato.
- **AI Chat & Model Router**: Architettura multi-provider con supporto per Anthropic (Claude), OpenAI (GPT-4o), Google (Gemini), OpenRouter e Ollama (modelli locali come `gemma4:12b` e `qwen2.5-coder`).
- **Web Search Integrata**: Ricerca web in tempo reale tramite Jina AI (`s.jina.ai` e `r.jina.ai`) per recuperare reference di design e contenuti.
- **Style Library**: Libreria integrata di stili ispirata a brand di successo (es. Stripe, Apple, Airbnb, Notion, Supabase, Tailwind Minimal).
- **Editor & Live Preview**: Editor di codice Monaco integrato affiancato da un iframe sandbox per l'anteprima live con hot reload istantaneo.
- **Esportazione ZIP**: Esportazione in diversi formati strutturati (HTML/CSS/JS nativo, React + Vite, Next.js).
- **Sicurezza delle Chiavi**: Salvataggio cifrato e locale delle API Key con `electron-store`, senza esposizione nel codice o nei log.

### Phase 2: Deploy & CLI (Pianificato)
- **Deploy Automatico**: Integrazione diretta con le API di GitHub, Vercel e Netlify per la pubblicazione in un click.
- **Forge CLI**: Command Line Interface (`@forge/cli`) per automatizzare e avviare la generazione direttamente da terminale.

### Phase 3: Avanzato (Pianificato)
- **Integrazione MCP (Model Context Protocol)**: Connessione a server di contesto esterni per ricevere linee guida di design avanzate.
- **Generazione Multi-Pagina Parallela**: Elaborazione contemporanea di più pagine web per velocizzare la build.
- **Iterazioni Chat-Based**: Modifiche mirate al codice generato mantenendo il contesto del brief originario.

---

## 📁 Struttura del Repository

Questo repository è focalizzato esclusivamente sullo sviluppo di **Forge Lite**. I vecchi file di progetto sono stati spostati nell'archivio storico.

```
Forge/
├── .kiro/specs/forge-lite-website-builder/    # Specifiche tecniche del costruttore Forge Lite
│   ├── requirements.md                         # Requisiti e criteri di accettazione dettagliati
│   ├── design.md                               # Architettura, canali IPC e specifiche UX/UI
│   └── tasks.md                                # Elenco dei task di sviluppo e Wave di implementazione
├── Forge_lite/                                 # Directory di sviluppo dell'applicazione desktop Forge Lite
└── archive/agent-os/                           # Archivio storico del codice e delle spec del precedente Agent OS
```

Per consultare i dettagli del piano di sviluppo e i singoli task, fare riferimento a:
👉 [Specifica dei Task](.kiro/specs/forge-lite-website-builder/tasks.md)

---

## 🛠️ Come Iniziare

Il progetto è attualmente nella fase di scaffolding (Wave 0 / Wave 1). La documentazione sull'installazione e la build di sviluppo in locale verrà aggiunta qui non appena lo scaffolding del codice sarà completato.
