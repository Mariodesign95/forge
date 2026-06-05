# 🍿 Mariflix — Private Stremio Addon

Add-on Stremio **privato** per lo streaming di torrent italiani tramite **Real-Debrid** e **Torbox**.

## ⚡ Fonti di ricerca (7 in parallelo)

| Fonte | Tipo | Descrizione |
|-------|------|-------------|
| 🗃️ Colabrodo Viola | Database locale | 136k+ torrent ITA (SQLite in-memory) |
| 🏴 Il Corsaro Nero | Scraper live | Ricerca in tempo reale |
| 🌐 ext.to | Scraper live | Motore di ricerca torrent |
| 🏴‍☠️ PirateBay (Apibay) | API live | Filtro automatico ITA |
| 🎬 YTS | API live | Film (match IMDb) |
| 📺 EZTV | API live | Serie TV (match episodio) |
| 🔍 Prowlarr / 🔎 Jackett | Opzionale | I tuoi indexer privati |

## 🚀 Avvio locale

```bash
# 1. Installa dipendenze
npm install

# 2. Configura le chiavi API nel file .env
#    (RD_TOKEN e/o TB_TOKEN)

# 3. Avvia
npm start
```

Poi apri Stremio e aggiungi l'addon: `http://localhost:7000/manifest.json`

## ☁️ Deploy su Hugging Face Spaces

1. Crea un nuovo Space su [huggingface.co/spaces](https://huggingface.co/spaces) con SDK **Docker**
2. Carica tutti i file di questo progetto
3. Nelle impostazioni dello Space, aggiungi le variabili d'ambiente:
   - `RD_TOKEN` = la tua chiave Real-Debrid
   - `TB_TOKEN` = la tua chiave Torbox
   - `ADDON_URL` = l'URL pubblico dello space (es. `https://tuonome-mariflix.hf.space`)
4. Lo Space si avvierà automaticamente

Poi in Stremio: `https://tuonome-mariflix.hf.space/manifest.json`

## ☁️ Deploy su Render

1. Crea un nuovo **Web Service** su [render.com](https://render.com)
2. Collega il repository GitHub (o carica i file)
3. Imposta le variabili d'ambiente come sopra
4. Render rileverà automaticamente il Dockerfile

## 📺 Compatibilità TV Samsung

L'addon funziona con qualsiasi client Stremio, inclusa la Samsung Smart TV:
- Usa il web player: `https://web.stremio.com`
- Aggiungi l'addon con il link del manifest
- I link di streaming sono HTTPS diretti (302 redirect) — compatibili con tutti i player

## 🔒 Sicurezza

Le chiavi API sono salvate solo nel file `.env` (locale) o come variabili d'ambiente (cloud).
Non vengono mai esposte nel codice o nei log.
