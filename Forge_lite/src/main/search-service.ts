/**
 * SearchService — Jina AI web search and reader integration
 *
 * Requirements: 3.1, 3.2, 3.5, 3.6, 3.7
 *
 * - SearchCache: in-memory, session-scoped (TTL infinito), query normalizzata
 * - SearchService.search(): cerca via s.jina.ai, fallback silenzioso su errore
 * - SearchService.fetchUrl(): recupera contenuto via r.jina.ai (NO encodeURIComponent sull'URL)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface JinaSearchResultItem {
  title?: string;
  url?: string;
  description?: string;
  snippet?: string;
  content?: string;
}

interface JinaSearchResponse {
  data?: JinaSearchResultItem[];
  results?: JinaSearchResultItem[];
  // Jina può variare il formato — gestiamo entrambe le chiavi
  [key: string]: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JINA_SEARCH_BASE = 'https://s.jina.ai/';
const JINA_READER_BASE = 'https://r.jina.ai/';

// ─── SearchCache ──────────────────────────────────────────────────────────────

/**
 * Cache in-memory per i risultati di ricerca.
 * TTL infinito (scope sessione): i risultati non scadono mai durante la sessione.
 * Le query vengono normalizzate prima di essere usate come chiave.
 *
 * Requirement 3.7
 */
export class SearchCache {
  private readonly cache = new Map<string, SearchResult[]>();

  /**
   * Normalizza la query: trim, lowercase, spazi multipli → singolo spazio.
   */
  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Restituisce i risultati cached per la query, oppure null se non in cache.
   */
  get(query: string): SearchResult[] | null {
    const key = this.normalizeQuery(query);
    const cached = this.cache.get(key);
    return cached !== undefined ? cached : null;
  }

  /**
   * Salva i risultati in cache per la query normalizzata.
   */
  set(query: string, results: SearchResult[]): void {
    const key = this.normalizeQuery(query);
    this.cache.set(key, results);
  }

  /**
   * Svuota la cache (utile per i test o al reset della sessione).
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Numero di entry attualmente in cache.
   */
  get size(): number {
    return this.cache.size;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parsa la risposta JSON di Jina Search in un array di SearchResult.
 * Gestisce in modo difensivo le variazioni di formato dell'API.
 */
function parseJinaResults(data: JinaSearchResponse): SearchResult[] {
  // Jina può restituire i risultati sotto "data" o "results"
  const raw: JinaSearchResultItem[] =
    Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.results)
      ? data.results
      : [];

  return raw.map((item) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.description ?? item.snippet ?? item.content ?? '',
  }));
}

// ─── SearchService ────────────────────────────────────────────────────────────

/**
 * Servizio di web search e lettura URL basato su Jina AI.
 * Tutte le chiamate vengono eseguite dal main process di Electron (Requirement 3.6).
 *
 * Requirements: 3.1, 3.2, 3.5, 3.6, 3.7
 */
export class SearchService {
  private readonly cache = new SearchCache();

  /**
   * Esegue una ricerca web tramite Jina Search (s.jina.ai).
   *
   * - Controlla prima la cache (Requirement 3.7)
   * - Se miss: chiama l'endpoint con encodeURIComponent sulla query
   * - Salva il risultato in cache prima di restituirlo
   * - In caso di qualsiasi errore, restituisce [] silenziosamente (Requirement 3.5)
   *
   * Requirement 3.1, 3.7
   */
  async search(query: string): Promise<SearchResult[]> {
    // Cache hit: nessuna chiamata di rete
    const cached = this.cache.get(query);
    if (cached !== null) {
      return cached;
    }

    try {
      const encoded = encodeURIComponent(query);
      const res = await fetch(`${JINA_SEARCH_BASE}${encoded}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`Jina search error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as JinaSearchResponse;
      const results = parseJinaResults(data);

      // Salva in cache prima di restituire
      this.cache.set(query, results);

      return results;
    } catch (err) {
      // Fallback silenzioso: il Builder procede senza risultati di ricerca (Requirement 3.5)
      console.warn('[SearchService] search unavailable:', err);
      return [];
    }
  }

  /**
   * Recupera il contenuto testuale di un URL tramite Jina Reader (r.jina.ai).
   *
   * IMPORTANTE: Jina Reader si aspetta l'URL passato senza encodeURIComponent.
   *   Corretto:   https://r.jina.ai/https://example.com/path
   *   Sbagliato:  https://r.jina.ai/https%3A%2F%2Fexample.com%2Fpath
   *
   * A differenza di search(), fetchUrl() propaga l'errore al chiamante
   * (il Builder decide come gestirlo).
   *
   * Requirement 3.2
   */
  async fetchUrl(url: string): Promise<string> {
    // NON usare encodeURIComponent sull'URL — Jina Reader lo gestisce nativamente
    const res = await fetch(`${JINA_READER_BASE}${url}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Jina reader error: ${res.status} ${res.statusText}`);
    }

    return res.text();
  }

  /**
   * Accesso diretto alla cache (utile per test e diagnostica).
   */
  get searchCache(): SearchCache {
    return this.cache;
  }
}
