# Requirements Document

## Introduction

Forge Lite è un AI-powered Website & Web App Builder desktop costruito su Electron. Permette all'utente di descrivere a parole il sito che vuole creare, discuterne con l'AI attraverso un **Plan Mode** conversazionale, approvare un brief strutturato, generare il codice con live preview in tempo reale, e pubblicarlo su GitHub + Vercel/Netlify — tutto da un'unica applicazione desktop.

I requirements sono organizzati in tre fasi:

- **Phase 1 (MVP)**: Plan Mode, Web Search, Design Styles, Multi-provider AI, Monaco Editor + Live Preview, Export ZIP
- **Phase 2**: Deploy integrato (GitHub → Vercel/Netlify), CLI tool
- **Phase 3**: MCP Integration, generazione multi-pagina parallela, iterazioni AI chat-based, CMS, SEO

---

## Glossary

- **App**: l'applicazione desktop Forge Lite (Electron + React + TypeScript)
- **Plan_Mode**: la fase conversazionale pre-generazione in cui l'AI raccoglie requisiti e produce un brief strutturato
- **Iteration_Mode**: la fase post-generazione in cui l'AI_Chat accetta richieste di modifica sul codice già generato
- **AI_Chat**: il componente UI che gestisce la conversazione in Plan Mode e in Iteration Mode
- **Brief**: il documento strutturato (JSON) prodotto dal Plan Mode che descrive il sito da generare (pagine, stile, target, brand)
- **Builder**: il motore di generazione del codice che trasforma il Brief in file HTML/CSS/JS (o React/Next.js)
- **Preview**: l'iframe di anteprima live del sito generato con hot reload
- **Editor**: il componente Monaco Editor per la visualizzazione e modifica del codice generato
- **Shell**: la finestra Electron principale che ospita il layout a tre pannelli (AI_Chat | Editor | Preview)
- **Style_Library**: la raccolta di stili pronti (basata su DESIGN.md, es. Stripe, Apple, Airbnb) iniettati nel prompt di generazione
- **Model_Router**: l'astrazione multi-provider che gestisce le chiamate AI verso Claude, GPT-4o, Gemini, OpenRouter e Ollama
- **Search_Service**: il servizio di web search basato su Jina AI (`s.jina.ai/{query}` e `r.jina.ai/{url}`)
- **Search_Cache**: cache in-memory delle risposte Jina AI, scoped alla sessione corrente
- **Settings_Panel**: il pannello UI per la configurazione delle API key e delle preferenze dell'utente
- **Key_Store**: il meccanismo di persistenza locale delle API key (electron-store), mai esposto nel codice sorgente
- **Export_Service**: il servizio che produce un archivio ZIP del progetto generato
- **Deploy_Service**: il servizio che gestisce il deploy su GitHub e Vercel/Netlify (Phase 2)
- **CLI**: il tool da riga di comando `@forge/cli` (Phase 2)
- **IPC**: il canale di comunicazione Electron tra main process (Node.js) e renderer process (React)
- **Provider**: un fornitore di modelli AI (Anthropic, OpenAI, Google, Ollama)
- **Iteration_Snapshot**: lo stato completo del progetto (Brief + file generati) salvato prima di ogni iterazione AI, usato per undo/redo

---

## Requirements

---

### Requirement 0: Shell & Layout Principale

**User Story:** Come utente, voglio un'interfaccia a tre pannelli (Chat, Editor, Preview) che posso ridimensionare e riorganizzare liberamente, così da adattare il workspace al mio flusso di lavoro.

#### Acceptance Criteria

1. THE Shell SHALL presentare un layout a tre pannelli orizzontali: AI_Chat a sinistra, Editor al centro, Preview a destra.
2. THE Shell SHALL supportare il ridimensionamento dei pannelli tramite drag dei divisori, con larghezza minima di 200px per ciascun pannello.
3. WHEN la larghezza della finestra è inferiore a 900px, THE Shell SHALL collassare automaticamente il layout a un pannello alla volta con controlli di navigazione tra i pannelli (Chat | Code | Preview).
4. THE App SHALL supportare tema Dark e tema Light, selezionabile dall'utente nel Settings_Panel, con Dark come default.
5. WHEN l'utente cambia tema, THE App SHALL applicare il tema selezionato all'intera interfaccia inclusi Shell, Editor Monaco, e AI_Chat senza richiedere il riavvio dell'app.
6. THE Shell SHALL persistere le proporzioni dei pannelli e il tema selezionato tramite electron-store e ripristinarli al prossimo avvio.
7. THE Shell SHALL esporre un pulsante di toggle per ciascun pannello nella barra superiore, permettendo di nascondere/mostrare i pannelli individualmente.

---

### Requirement 1: Plan Mode — Raccolta Requisiti Conversazionale

**User Story:** Come utente che vuole costruire un sito, voglio descrivere a parole la mia idea e rispondere a domande guidate dell'AI, così da ottenere un brief strutturato prima che venga generato qualsiasi codice.

#### Acceptance Criteria

1. WHEN l'utente avvia una nuova sessione, THE App SHALL presentare l'AI_Chat in Plan Mode come schermata iniziale, prima di qualsiasi generazione di codice.
2. WHEN l'utente invia un messaggio in Plan Mode, THE AI_Chat SHALL inviare la richiesta al Model_Router tramite IPC e visualizzare la risposta dell'AI in streaming.
3. WHILE il Plan Mode è attivo, THE AI_Chat SHALL raccogliere almeno i seguenti campi nel Brief: tipo di sito, numero di pagine, stile visivo, target audience, nome del brand, palette colori preferita, lingua target del sito (es. Italiano, Inglese).
4. WHEN l'AI ha raccolto informazioni sufficienti, THE AI_Chat SHALL generare un Brief strutturato in formato JSON e presentarlo all'utente in un pannello di anteprima dedicato.
5. WHEN l'utente visualizza il Brief, THE App SHALL offrire due azioni esclusive: "Approva e Genera" e "Modifica Brief".
6. WHEN l'utente seleziona "Modifica Brief", THE AI_Chat SHALL riprendere la conversazione in Plan Mode mantenendo il contesto accumulato.
7. WHEN l'utente seleziona "Approva e Genera", THE Builder SHALL avviare il processo di generazione del codice usando il Brief approvato come input.
8. IF la sessione Plan Mode viene interrotta prima dell'approvazione del Brief, THEN THE App SHALL salvare lo stato della conversazione e del Brief parziale in modo da permettere il ripristino alla riapertura.

---

### Requirement 2: Generazione del Codice con AI Multi-Provider

**User Story:** Come utente, voglio che il codice del mio sito venga generato dall'AI usando il provider e il modello che preferisco, così da avere flessibilità nella scelta tra velocità, costo e qualità.

#### Acceptance Criteria

1. THE Model_Router SHALL supportare almeno cinque provider: Anthropic (Claude), OpenAI (GPT-4o), Google (Gemini), OpenRouter (qualsiasi modello via singola API key), e Ollama (locale).
2. WHEN il Builder avvia la generazione, THE Model_Router SHALL usare il provider e il modello configurati dall'utente nel Settings_Panel.
3. WHEN il Builder riceve il Brief approvato, THE Builder SHALL generare tutti i file del sito (HTML, CSS, JS e/o componenti React) in una singola sessione continua di chiamate AI, senza richiedere input dell'utente, fino al completamento o a un errore esplicito.
4. WHILE la generazione è in corso, THE Builder SHALL trasmettere ogni chunk di codice ricevuto al Preview tramite IPC entro 300ms dalla ricezione, in modo da aggiornare l'anteprima in tempo reale.
5. WHILE la generazione è in corso, THE App SHALL visualizzare un indicatore di stato con il nome del provider attivo e il numero di file completati rispetto al totale atteso (es. "2 / 5 file").
6. IF il provider primario restituisce un errore durante la generazione, THEN THE Model_Router SHALL notificare l'utente con un messaggio che indica la causa del fallimento e preservare i file dell'ultima generazione completata con successo, scartando i file parziali della sessione corrente.
7. WHERE Ollama è il provider configurato, THE Model_Router SHALL eseguire le chiamate AI esclusivamente in locale senza effettuare richieste di rete verso provider esterni.
8. THE Model_Router SHALL effettuare tutte le chiamate AI dal main process di Electron tramite Vercel AI SDK, esponendo i risultati al renderer tramite IPC.
9. IF una chiamata al provider non riceve risposta entro 60 secondi, THEN THE Model_Router SHALL interrompere la generazione, notificare l'utente con il messaggio di timeout, e preservare i file dell'ultima generazione completata con successo.
10. WHERE OpenRouter è il provider configurato, THE Model_Router SHALL permettere all'utente di specificare qualsiasi identificatore di modello OpenRouter (es. `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3.1-70b-instruct`) nel Settings_Panel.

---

### Requirement 3: Web Search Integrata (Jina AI)

**User Story:** Come utente, voglio che l'AI possa cercare ispirazione e tendenze reali sul web durante la generazione del mio sito, così da ottenere un risultato aggiornato e ispirato ai trend attuali.

#### Acceptance Criteria

1. THE Search_Service SHALL effettuare ricerche web usando l'endpoint `https://s.jina.ai/{query}` senza richiedere API key all'utente.
2. THE Search_Service SHALL recuperare il contenuto di URL specifici usando l'endpoint `https://r.jina.ai/{url}` senza richiedere API key all'utente.
3. WHEN il Builder è in esecuzione, THE Builder SHALL invocare il Search_Service per cercare riferimenti di design pertinenti allo stile e al tipo di sito nel Brief approvato.
4. WHEN il Search_Service restituisce risultati, THE Builder SHALL includere un riassunto dei risultati nel contesto del prompt inviato al Model_Router.
5. IF il Search_Service non è raggiungibile (es. assenza di connessione internet), THEN THE Builder SHALL procedere alla generazione senza risultati di ricerca e notificare l'utente che la web search non è disponibile.
6. THE Search_Service SHALL essere eseguito esclusivamente dal main process di Electron tramite IPC, mai direttamente dal renderer process.
7. THE Search_Cache SHALL memorizzare in-memory le risposte del Search_Service usando la query normalizzata come chiave; WHEN il Builder invoca il Search_Service con una query identica a una già eseguita nella stessa sessione, THE Search_Service SHALL restituire il risultato dalla cache senza effettuare una nuova richiesta di rete.

---

### Requirement 4: Style Library (DESIGN.md)

**User Story:** Come utente, voglio scegliere uno stile visivo predefinito per il mio sito da una libreria di stili pronti, così da ottenere un risultato coerente con estetica di livello professionale senza doverlo descrivere da zero.

#### Acceptance Criteria

1. THE Style_Library SHALL contenere almeno 10 stili predefiniti, ciascuno ispirato a brand riconoscibili (es. Stripe, Apple, Airbnb, Linear, Notion, Vercel, Figma, Supabase, Shadcn, Minimal).
2. WHEN l'utente è in Plan Mode, THE AI_Chat SHALL presentare la Style_Library come opzione di selezione nel flusso conversazionale o in un pannello laterale dedicato.
3. WHEN l'utente seleziona uno stile dalla Style_Library, THE App SHALL aggiornare il Brief includendo il nome dello stile e il relativo token di configurazione visiva.
4. WHEN il Builder genera il codice, THE Builder SHALL iniettare le specifiche dello stile selezionato nel prompt come blocco di contesto dedicato.
5. WHEN nessuno stile è selezionato, THE Builder SHALL usare uno stile di default neutro e moderno compatibile con la descrizione nel Brief.
6. THE Style_Library SHALL essere caricata localmente dall'App senza richiedere connessione di rete.

---

### Requirement 5: Monaco Editor

**User Story:** Come utente, voglio visualizzare e modificare il codice generato in un editor professionale integrato nell'app, così da poter fare aggiustamenti manuali senza dover aprire strumenti esterni.

#### Acceptance Criteria

1. THE Editor SHALL utilizzare Monaco Editor (`@monaco-editor/react`) come componente di editing del codice.
2. WHEN il Builder completa la generazione di un file, THE Editor SHALL caricare il file generato con syntax highlighting per il linguaggio corretto (HTML, CSS, TypeScript, JSX).
3. WHEN l'utente modifica il contenuto di un file nell'Editor, THE Preview SHALL aggiornare l'anteprima entro 500ms dalla cessazione dell'input dell'utente (debounce).
4. THE Editor SHALL visualizzare la struttura dei file del progetto in un pannello ad albero navigabile, permettendo all'utente di passare da un file all'altro.
5. WHEN l'utente naviga verso un file nell'albero del progetto, THE Editor SHALL caricare il contenuto del file selezionato mantenendo la posizione del cursore per i file già visitati.
6. THE Editor SHALL supportare almeno le seguenti funzionalità: completamento automatico del codice, evidenziazione degli errori di sintassi, ricerca e sostituzione nel file corrente.

---

### Requirement 6: Live Preview con Hot Reload

**User Story:** Come utente, voglio vedere un'anteprima live del sito generato direttamente nell'app, così da valutare il risultato visivo in tempo reale senza dover aprire un browser esterno.

#### Acceptance Criteria

1. THE Preview SHALL renderizzare il sito generato all'interno di un iframe nell'interfaccia dell'App.
2. WHEN il Builder trasmette nuovo codice durante la generazione, THE Preview SHALL aggiornare l'iframe entro 300ms dalla ricezione del nuovo contenuto.
3. WHEN l'utente salva una modifica nell'Editor (Ctrl+S o pulsante Save), THE Preview SHALL ricaricare l'iframe entro 500ms dalla ricezione del segnale di salvataggio, applicando lo stesso debounce di 500ms definito in Requirement 5 criterio 3.
4. THE Preview SHALL isolare il contenuto del sito generato dal DOM dell'App tramite il sandbox dell'iframe, impedendo al codice del sito di accedere al contesto Electron.
5. WHILE la generazione è in corso, THE Preview SHALL mostrare uno stato di caricamento sovrapposto all'anteprima parziale.
6. THE Preview SHALL offrire controlli per simulare viewport di larghezze diverse: mobile (375px), tablet (768px), desktop (1280px).

---

### Requirement 7: Export ZIP

**User Story:** Come utente, voglio esportare il codice del sito generato come archivio ZIP, così da poterlo usare in modo autonomo, caricarlo su qualsiasi hosting, o continuare a lavorarci nel mio editor preferito.

#### Acceptance Criteria

1. WHEN la generazione del codice è completata, THE App SHALL rendere disponibile il pulsante "Esporta ZIP".
2. WHEN l'utente attiva l'esportazione, THE Export_Service SHALL produrre un archivio ZIP che include tutti i file del progetto generato nella struttura di directory corretta.
3. THE Export_Service SHALL supportare almeno tre template di output: HTML/CSS/JS vanilla, React + Vite, e Next.js.
4. WHEN l'utente avvia l'export, THE App SHALL presentare una dialog di selezione del template di output e della directory di destinazione sul filesystem locale.
5. WHEN l'Export_Service completa la creazione dell'archivio, THE App SHALL aprire la directory di destinazione nel file explorer del sistema operativo.
6. IF l'Export_Service non riesce a scrivere nella directory di destinazione (es. permessi insufficienti), THEN THE Export_Service SHALL notificare l'utente con un messaggio di errore che include il path e il motivo del fallimento.
7. WHEN il template di output è React + Vite o Next.js, THE Export_Service SHALL includere nel ZIP i file di configurazione necessari: `package.json` (con dipendenze e script), `vite.config.ts` o `next.config.js`, `tsconfig.json`, e `.gitignore` precompilato.

---

### Requirement 8: Settings Panel e Gestione API Key

**User Story:** Come utente, voglio inserire e salvare le mie API key per i vari provider AI in un pannello dedicato dell'app, così da usare i miei account personali senza che le key siano mai esposte nel codice sorgente.

#### Acceptance Criteria

1. THE Settings_Panel SHALL essere accessibile tramite un'icona persistente nella navigazione principale dell'App.
2. THE Settings_Panel SHALL fornire un campo di input dedicato per ciascun provider supportato: Anthropic, OpenAI, Google Gemini, OpenRouter, e Ollama (endpoint URL).
3. WHEN l'utente salva una API key, THE Key_Store SHALL persistere la key usando electron-store in modo cifrato nel profilo locale dell'utente.
4. THE App SHALL mai includere API key hardcodate nel codice sorgente, nei file di configurazione, o nei log.
5. WHEN il Settings_Panel visualizza una API key salvata, THE App SHALL mostrare solo gli ultimi 4 caratteri della key (es. `••••••••••••abcd`) per evitare l'esposizione accidentale.
6. THE Settings_Panel SHALL permettere all'utente di selezionare il provider e il modello AI predefiniti usati dal Builder.
7. IF l'utente tenta di avviare una generazione senza aver configurato una API key per il provider selezionato, THEN THE App SHALL bloccare la generazione e reindirizzare l'utente al Settings_Panel con un messaggio esplicativo.
8. WHERE Ollama è il provider selezionato, THE Settings_Panel SHALL permettere all'utente di configurare l'URL dell'endpoint Ollama locale (default: `http://localhost:11434`).

---

### Requirement 9: Architettura IPC Electron

**User Story:** Come sviluppatore, voglio che tutte le operazioni privilegiate (chiamate AI, web search, accesso al filesystem) vengano eseguite nel main process di Electron e comunicate al renderer tramite IPC, così da rispettare il modello di sicurezza di Electron e mantenere una separazione netta tra UI e logica.

#### Acceptance Criteria

1. THE App SHALL eseguire tutte le chiamate al Model_Router dal main process di Electron tramite Vercel AI SDK.
2. THE App SHALL eseguire tutte le chiamate al Search_Service dal main process di Electron.
3. THE App SHALL esporre le funzionalità del main process al renderer tramite `contextBridge` di Electron, senza abilitare `nodeIntegration` nel renderer.
4. WHEN il renderer invia una richiesta IPC al main process, THE App SHALL validare tutti i parametri in ingresso prima dell'esecuzione.
5. THE IPC SHALL supportare la trasmissione in streaming dei token generati dall'AI verso il renderer tramite eventi IPC incrementali.
6. THE App SHALL gestire i casi di errore IPC restituendo oggetti di errore strutturati con codice errore e messaggio leggibile, mai stack trace raw.

---

### Requirement 10: Persistenza dello Stato del Progetto

**User Story:** Come utente, voglio che i miei progetti vengano salvati automaticamente, così da poter riprendere il lavoro dove l'avevo lasciato senza perdere il Brief approvato o il codice generato.

#### Acceptance Criteria

1. THE App SHALL salvare automaticamente il Brief approvato, i file generati, e lo stile selezionato ogni volta che viene effettuata una modifica.
2. THE App SHALL mantenere una lista dei progetti recenti nella schermata iniziale, ordinata per data di ultima modifica, con un massimo di 20 progetti; WHEN il limite è raggiunto, THE App SHALL rimuovere il progetto con la data di ultima modifica più vecchia per fare spazio al nuovo.
3. WHEN l'utente seleziona un progetto dalla lista dei progetti recenti, THE App SHALL ripristinare lo stato completo del progetto includendo Brief, codice generato, stile, e provider configurato.
4. THE App SHALL usare electron-store per la persistenza dei metadati dei progetti e il filesystem locale per i file di codice generati.
5. WHEN l'utente elimina un progetto dalla lista, THE App SHALL richiedere conferma esplicita prima di procedere e cancellare sia i metadati che i file di codice associati.

---

### Requirement 11: Undo/Redo delle Iterazioni AI

**User Story:** Come utente in Iteration Mode, voglio poter annullare e ripristinare le modifiche applicate dall'AI al codice del mio sito, così da tornare a uno stato precedente se un'iterazione non produce il risultato atteso.

#### Acceptance Criteria

1. WHEN il Builder completa un'iterazione AI in Iteration Mode, THE App SHALL salvare un Iteration_Snapshot dello stato completo del progetto (tutti i file generati e il Brief) prima di applicare le modifiche.
2. WHEN l'utente attiva "Undo iterazione" (pulsante dedicato o scorciatoia Ctrl+Z a livello di sessione), THE App SHALL ripristinare l'Iteration_Snapshot immediatamente precedente e aggiornare Editor e Preview per riflettere lo stato ripristinato.
3. WHEN l'utente attiva "Redo iterazione" dopo un undo, THE App SHALL ripristinare l'Iteration_Snapshot successivo nella catena.
4. THE App SHALL mantenere uno stack di Iteration_Snapshot con un massimo di 10 snapshot per sessione; WHEN il limite è raggiunto, THE App SHALL eliminare lo snapshot più vecchio.
5. IF non esistono Iteration_Snapshot precedenti, THEN THE App SHALL disabilitare il controllo "Undo iterazione" nell'interfaccia.
6. IF non esistono Iteration_Snapshot successivi, THEN THE App SHALL disabilitare il controllo "Redo iterazione" nell'interfaccia.

---

### Requirement 12: Aggiornamenti Automatici dell'App

**User Story:** Come utente, voglio che l'app si aggiorni automaticamente quando è disponibile una nuova versione, così da ricevere miglioramenti e fix senza dover reinstallare manualmente.

#### Acceptance Criteria

1. THE App SHALL integrare `electron-updater` per il controllo e il download degli aggiornamenti automatici.
2. WHEN l'App si avvia, THE App SHALL verificare in background la disponibilità di nuovi aggiornamenti senza bloccare l'interfaccia utente.
3. WHEN un aggiornamento è disponibile, THE App SHALL notificare l'utente tramite un banner non intrusivo con la versione disponibile e un pulsante "Installa e riavvia".
4. WHEN l'utente seleziona "Installa e riavvia", THE App SHALL completare il download (se non già completato) e riavviarsi con la nuova versione installata.
5. IF il controllo degli aggiornamenti fallisce (es. assenza di connessione), THE App SHALL procedere normalmente senza mostrare errori all'utente.

---

## Phase 2 — Deploy & CLI (High-Level Requirements)

### Requirement 13: Deploy Integrato su GitHub e Vercel/Netlify

**User Story:** Come utente, voglio pubblicare il mio sito direttamente dall'app su GitHub e poi su Vercel o Netlify con un singolo click, così da mettere online il progetto senza dover usare strumenti separati.

#### Acceptance Criteria

1. THE Deploy_Service SHALL supportare la creazione di un repository GitHub e il push del codice generato tramite le GitHub API v3.
2. THE Deploy_Service SHALL supportare il deploy automatico su Vercel tramite le Vercel API e su Netlify tramite le Netlify API.
3. WHEN l'utente avvia il deploy, THE Settings_Panel SHALL richiedere i token di autenticazione per GitHub, Vercel, e/o Netlify se non ancora configurati.
4. WHEN il deploy è completato con successo, THE App SHALL visualizzare l'URL pubblico del sito deployato e offrire la possibilità di aprirlo nel browser di sistema.
5. IF il deploy fallisce, THEN THE Deploy_Service SHALL presentare il messaggio di errore restituito dalla piattaforma di destinazione e suggerire le azioni correttive.

---

### Requirement 14: CLI Tool (`@forge/cli`)

**User Story:** Come sviluppatore, voglio usare Forge Lite da riga di comando, così da integrarlo in script e workflow automatizzati senza dover aprire l'interfaccia desktop.

#### Acceptance Criteria

1. THE CLI SHALL essere distribuito come package npm pubblico con nome `@forge/cli` e installabile tramite `npm install -g @forge/cli`.
2. THE CLI SHALL esporre almeno i seguenti comandi: `forge generate <brief>`, `forge export --template <template> --output <path>`, `forge deploy --provider <github|vercel|netlify>`.
3. WHEN il CLI esegue una generazione, THE CLI SHALL leggere la configurazione API key da un file di configurazione locale (`~/.forge/config.json`) o da variabili d'ambiente.
4. THE CLI SHALL produrre output leggibile sia in modalità interattiva (con progress indicators) che in modalità non interattiva (JSON machine-readable con flag `--json`).

---

## Phase 3 — Avanzato (High-Level Requirements)

### Requirement 15: MCP Integration

**User Story:** Come utente avanzato, voglio che Forge Lite possa connettersi a server MCP (Model Context Protocol) per accedere a strumenti specializzati di design durante la generazione, così da ottenere output di qualità superiore con guide di design contestuali.

#### Acceptance Criteria

1. THE App SHALL supportare la connessione a server MCP compatibili, tra cui `page-design-guide-mcp`, tramite configurazione nel Settings_Panel.
2. WHEN un server MCP è configurato e attivo, THE Builder SHALL invocare gli strumenti MCP pertinenti durante la generazione per arricchire il contesto del prompt.

---

### Requirement 16: Generazione Multi-Pagina Parallela

**User Story:** Come utente, voglio che le pagine di un sito multi-pagina vengano generate in parallelo, così da ridurre il tempo totale di generazione per progetti complessi.

#### Acceptance Criteria

1. WHEN il Brief contiene più di una pagina, THE Builder SHALL generare le pagine in parallelo con un massimo di 4 pagine concorrenti.
2. WHILE la generazione parallela è in corso, THE Preview SHALL aggiornare la visualizzazione delle singole pagine man mano che vengono completate.

---

### Requirement 17: Iterazioni AI Chat-Based

**User Story:** Come utente, voglio poter descrivere modifiche al sito già generato tramite chat con l'AI, così da iterare sul risultato senza dover rigenerare tutto da zero.

#### Acceptance Criteria

1. WHEN il codice di un sito è stato generato e approvato, THE AI_Chat SHALL passare dalla modalità Plan Mode alla modalità Iteration Mode, mantenendo il Brief come contesto.
2. WHEN l'utente descrive una modifica in Iteration Mode, THE Builder SHALL applicare modifiche chirurgiche ai file pertinenti senza rigenerare i file non coinvolti.
3. THE AI_Chat SHALL mantenere la cronologia delle iterazioni precedenti come contesto per le richieste successive nella stessa sessione.

---

### Requirement 18: SEO Automatico e Integrazione CMS

**User Story:** Come utente, voglio che il sito generato includa SEO di base e la possibilità di collegare un CMS headless, così da avere un sito pronto per il web senza dover configurare manualmente questi aspetti.

#### Acceptance Criteria

1. WHEN il Builder genera il codice di un sito, THE Builder SHALL includere automaticamente meta tag SEO di base (title, description, og:image, canonical URL) derivati dalle informazioni nel Brief.
2. WHERE il Brief specifica l'integrazione con un CMS, THE Builder SHALL generare le integrazioni necessarie per i CMS headless supportati (es. Contentful, Sanity, Strapi).
