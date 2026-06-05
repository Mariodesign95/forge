// ============================================
//  🍿 MARIFLIX — Private Stremio Addon
//  Multi-Source Italian Torrent Streaming
//  Real-Debrid & Torbox Support
// ============================================

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const initSqlJs = require('sql.js');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 7000;
const RD_TOKEN = process.env.RD_TOKEN || '';
const TB_TOKEN = process.env.TB_TOKEN || '';
const PROWLARR_URL = process.env.PROWLARR_URL || '';
const PROWLARR_API_KEY = process.env.PROWLARR_API_KEY || '';
const JACKETT_URL = process.env.JACKETT_URL || '';
const JACKETT_API_KEY = process.env.JACKETT_API_KEY || '';

// Colabrodo Viola DB — GitHub source
const COLABRODO_DB_URL = 'https://github.com/sybaumike/colabrodoviola/raw/main/pezzhub-db.jsonl.zip';

// In-memory SQLite database handle
let db = null;

// ============================================
//  CORS Middleware (Required for Stremio Web)
// ============================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ============================================
//  Helper: Detect public ADDON_URL from request
// ============================================
function getAddonUrl(req) {
    if (process.env.ADDON_URL && process.env.ADDON_URL !== 'http://localhost:7000') {
        return process.env.ADDON_URL.replace(/\/$/, '');
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}

// ============================================
//  STREMIO MANIFEST
// ============================================
const MANIFEST = {
    id: 'com.mariflix.addon',
    version: '1.0.0',
    name: '🍿 Mariflix',
    description: 'Add-on privato per streaming torrent italiani — Real-Debrid & Torbox',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt'],
    behaviorHints: { configurable: false, configurationRequired: false }
};

app.get('/manifest.json', (req, res) => res.json(MANIFEST));
app.get('/:params/manifest.json', (req, res) => res.json(MANIFEST));

// ============================================
//  LANDING PAGE
// ============================================
app.get('/', (req, res) => {
    const addonUrl = getAddonUrl(req);
    const installUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(addonUrl + '/manifest.json')}`;
    res.send(`<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mariflix — Stremio Addon</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#0a0a1a 0%,#1a0a2e 50%,#0a1628 100%);
  font-family:'Segoe UI',system-ui,sans-serif;color:#e0e0e0}
.card{background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);
  border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:48px;
  max-width:520px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.5)}
h1{font-size:2.5rem;margin-bottom:8px;background:linear-gradient(135deg,#ff6b6b,#ffa07a,#ffcc5c);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{color:#888;margin-bottom:32px;font-size:1rem}
.sources{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:32px}
.tag{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);
  border-radius:20px;padding:6px 14px;font-size:0.8rem;color:#aaa}
.btn{display:inline-block;padding:16px 40px;border-radius:14px;text-decoration:none;
  font-weight:700;font-size:1.1rem;color:#fff;
  background:linear-gradient(135deg,#7c3aed,#2563eb);
  box-shadow:0 8px 30px rgba(124,58,237,0.4);transition:transform 0.2s,box-shadow 0.2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(124,58,237,0.6)}
.status{margin-top:24px;font-size:0.85rem;color:#666}
.status span{color:#4ade80}
</style></head>
<body><div class="card">
<h1>🍿 Mariflix</h1>
<p class="sub">Add-on privato per streaming torrent italiani</p>
<div class="sources">
  <span class="tag">🗃️ Colabrodo</span><span class="tag">🏴 Corsaro Nero</span>
  <span class="tag">🔗 SolidTorrents</span><span class="tag">🏴‍☠️ PirateBay</span>
  <span class="tag">🎬 YTS</span><span class="tag">📺 EZTV</span>
  <span class="tag">🔍 Prowlarr</span><span class="tag">🔎 Jackett</span>
</div>
<a class="btn" href="${installUrl}" target="_blank">📺 Installa su Stremio</a>
<div class="status">
  Real-Debrid: ${RD_TOKEN ? '<span>✅ Attivo</span>' : '❌ Non configurato'} &nbsp;|&nbsp;
  Torbox: ${TB_TOKEN ? '<span>✅ Attivo</span>' : '❌ Non configurato'}
  <br><br>DB Colabrodo: ${db ? '<span>✅ Caricato</span>' : '⏳ In caricamento...'}
</div>
</div></body></html>`);
});

// ============================================
//  DATABASE — Colabrodo Viola (SQLite in-memory)
// ============================================
async function initDatabase() {
    console.log('📦 Downloading Colabrodo Viola database...');
    const SQL = await initSqlJs();
    try {
        const res = await fetch(COLABRODO_DB_URL, { timeout: 30000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.buffer();

        console.log('📂 Extracting database...');
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const jsonlEntry = entries.find(e =>
            e.entryName.endsWith('.jsonl') || e.entryName.endsWith('.json') || e.entryName.endsWith('.txt')
        );
        if (!jsonlEntry) throw new Error('No data file found in archive');

        const raw = jsonlEntry.getData().toString('utf8');
        const lines = raw.split('\n').filter(l => l.trim());
        console.log(`📊 Parsing ${lines.length} torrents...`);

        db = new SQL.Database();
        db.run(`
            CREATE TABLE torrents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                info_hash TEXT,
                size INTEGER DEFAULT 0,
                category TEXT DEFAULT '',
                seeders INTEGER DEFAULT 0
            )
        `);
        db.run('CREATE INDEX idx_torrents_name ON torrents(name COLLATE NOCASE)');
        db.run('CREATE INDEX idx_torrents_hash ON torrents(info_hash)');

        const insertStmt = db.prepare(
            'INSERT INTO torrents (name, info_hash, size, category, seeders) VALUES (?, ?, ?, ?, ?)'
        );

        let count = 0;
        db.run('BEGIN TRANSACTION');
        for (const line of lines) {
            try {
                const item = JSON.parse(line);
                insertStmt.bind([
                    item.name || item.title || '',
                    (item.hash || item.info_hash || item.infohash || '').toLowerCase(),
                    item.size || item.length || 0,
                    item.cat || item.category || item.type || '',
                    item.seeders || item.seeds || 0
                ]);
                insertStmt.step();
                insertStmt.reset();
                count++;
            } catch (_) { /* skip malformed lines */ }
        }
        db.run('COMMIT');
        insertStmt.free();

        console.log(`✅ Loaded ${count} Italian torrents into memory database`);
    } catch (err) {
        console.error('⚠️  Failed to load Colabrodo DB:', err.message);
        console.log('ℹ️  Addon continues without local database — other sources still active');
        db = new SQL.Database();
        db.run('CREATE TABLE torrents (id INTEGER PRIMARY KEY, name TEXT, info_hash TEXT, size INTEGER DEFAULT 0, category TEXT DEFAULT \'\', seeders INTEGER DEFAULT 0)');
    }
}

// ============================================
//  CINEMETA — Resolve IMDb ID → Title
// ============================================
const metaCache = new Map();

async function getMeta(type, imdbId) {
    const key = `${type}:${imdbId}`;
    if (metaCache.has(key)) return metaCache.get(key);
    try {
        const r = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, { timeout: 5000 });
        if (!r.ok) return null;
        const data = await r.json();
        metaCache.set(key, data.meta);
        return data.meta;
    } catch (e) {
        console.error('Cinemeta error:', e.message);
        return null;
    }
}

// ============================================
//  UTILITY FUNCTIONS — Advanced Release Parsing
//  (Aligned to AIOStreams Tamtaro config v2.6.1)
// ============================================

// --- Resolution detection (order from AIOStreams preferredResolutions) ---
function parseResolution(name) {
    const n = (name || '').toUpperCase();
    if (n.includes('2160P') || n.includes('4K') || n.includes('UHD')) return '2160p';
    if (n.includes('1440P') || n.includes('2K')) return '1440p';
    if (n.includes('1080P') || n.includes('FHD')) return '1080p';
    if (n.includes('720P')) return '720p';
    if (n.includes('576P')) return '576p';
    if (n.includes('480P')) return '480p';
    if (n.includes('360P')) return '360p';
    return 'Unknown';
}
const RESOLUTION_SCORES = { '2160p': 9, '1440p': 8, '1080p': 7, '720p': 6, '576p': 5, '480p': 4, '360p': 3, '240p': 2, '144p': 1, 'Unknown': 0 };

// --- Source quality detection (order from AIOStreams preferredQualities) ---
function parseSourceQuality(name) {
    const n = (name || '').toUpperCase();
    if (/\bREMUX\b/.test(n) && /\bBLU.?RAY\b/.test(n)) return 'REMUX';
    if (/\bREMUX\b/.test(n)) return 'REMUX';
    if (/\bBLU.?RAY\b/.test(n) || /\bBDRIP\b/.test(n) || /\bBRRIP\b/.test(n)) return 'BluRay';
    if (/\bWEB.?DL\b/.test(n)) return 'WEB-DL';
    if (/\bWEB.?RIP\b/.test(n)) return 'WEBRip';
    if (/\bHDRIP\b/.test(n)) return 'HDRip';
    if (/\bDVDRIP\b/.test(n)) return 'DVDRip';
    if (/\bHDTV\b/.test(n)) return 'HDTV';
    if (/\bSCR\b/.test(n) || /\bSCREENER\b/.test(n)) return 'SCR';
    if (/\bTS\b/.test(n) || /\bTELESYNC\b/.test(n)) return 'TS';
    if (/\bCAM\b/.test(n) || /\bHDCAM\b/.test(n)) return 'CAM';
    return 'Unknown';
}
const SOURCE_QUALITY_SCORES = { 'REMUX': 11, 'BluRay': 10, 'WEB-DL': 9, 'WEBRip': 8, 'HDRip': 7, 'DVDRip': 6, 'HDTV': 5, 'SCR': 4, 'TS': 3, 'CAM': 2, 'Unknown': 1 };

// --- Codec detection (order from AIOStreams preferredEncodes) ---
function parseCodec(name) {
    const n = (name || '').toUpperCase();
    if (/\bAV1\b/.test(n)) return 'AV1';
    if (/\bHEVC\b/.test(n) || /\bX265\b/.test(n) || /\bH\.?265\b/.test(n)) return 'HEVC';
    if (/\bAVC\b/.test(n) || /\bX264\b/.test(n) || /\bH\.?264\b/.test(n)) return 'AVC';
    if (/\bXVID\b/.test(n)) return 'XviD';
    if (/\bDIVX\b/.test(n)) return 'DivX';
    return '';
}
const CODEC_SCORES = { 'AV1': 6, 'HEVC': 5, 'AVC': 4, 'XviD': 2, 'DivX': 1, '': 0 };

// --- HDR / Visual tags (order from AIOStreams preferredVisualTags) ---
function parseVisualTags(name) {
    const n = (name || '').toUpperCase();
    const tags = [];
    if (/\bDOLBY.?VISION\b/.test(n) || /\bDV\b/.test(n) || /\bDoVi\b/i.test(name)) {
        if (/\bHDR10\+/.test(n)) tags.push('HDR+DV');
        else if (/\bHDR/.test(n)) tags.push('HDR+DV');
        else tags.push('DV');
    }
    if (/\bHDR10\+/.test(n) && !tags.some(t => t.includes('DV'))) tags.push('HDR10+');
    else if (/\bHDR10\b/.test(n) && !tags.some(t => t.includes('DV'))) tags.push('HDR10');
    else if (/\bHDR\b/.test(n) && !tags.some(t => t.includes('DV') || t.includes('HDR'))) tags.push('HDR');
    if (/\bHLG\b/.test(n)) tags.push('HLG');
    if (/\b10.?BIT\b/.test(n)) tags.push('10bit');
    if (/\bIMAX\b/.test(n)) tags.push('IMAX');
    return tags;
}
const VISUAL_SCORES = { 'HDR+DV': 9, 'DV': 8, 'HDR10+': 7, 'HDR10': 6, 'HDR': 5, 'HLG': 4, '10bit': 3, 'IMAX': 2 };

// --- Audio tags (order from AIOStreams preferredAudioTags) ---
function parseAudioTags(name) {
    const n = (name || '').toUpperCase();
    const tags = [];
    if (/\bATMOS\b/.test(n)) tags.push('Atmos');
    if (/\bDTS.?X\b/.test(n)) tags.push('DTS:X');
    if (/\bTRUEHD\b/.test(n) || /\bTRUE.?HD\b/.test(n)) tags.push('TrueHD');
    if (/\bDTS.?HD.?MA\b/.test(n)) tags.push('DTS-HD MA');
    if (/\bFLAC\b/.test(n)) tags.push('FLAC');
    if (/\bDTS.?HD\b/.test(n) && !tags.includes('DTS-HD MA')) tags.push('DTS-HD');
    if (/\bDTS\b/.test(n) && !tags.some(t => t.startsWith('DTS'))) tags.push('DTS');
    if (/\bDD\+|\bDDP|\bE.?AC.?3\b/.test(n)) tags.push('DD+');
    if (/\bDD[^P+]|\bAC.?3\b|\bDOLBY.?DIGITAL\b/.test(n) && !tags.includes('DD+')) tags.push('DD');
    if (/\bOPUS\b/.test(n)) tags.push('OPUS');
    if (/\bAAC\b/.test(n)) tags.push('AAC');
    return tags;
}
const AUDIO_SCORES = { 'Atmos': 12, 'DTS:X': 11, 'TrueHD': 10, 'DTS-HD MA': 9, 'FLAC': 8, 'DTS-HD': 7, 'DTS': 6, 'DD+': 5, 'DD': 4, 'OPUS': 3, 'AAC': 2 };

// --- 3D exclusion (from AIOStreams excludedVisualTags) ---
function is3D(name) {
    const n = (name || '').toUpperCase();
    return /\b3D\b/.test(n) || /\bH.?OU\b/.test(n) || /\bH.?SBS\b/.test(n);
}

// --- Italian language detection (from AIOStreams requiredLanguages) ---
function isItalian(name) {
    const n = (name || '').toUpperCase();
    return /\bITA(LIAN[OA]?)?\b/.test(n) || /\bITA\b/.test(n) ||
           n.includes('ITALIAN') || n.includes('SUB.ITA') || n.includes('SUBITA') ||
           /\bMULTI\b/.test(n) || /\bDUAL\b/.test(n) || /\bDUBBED\b/.test(n) ||
           n.includes('[ITA]') || n.includes('(ITA)') ||
           /[\.\-\s]ITA[\.\-\s]/.test(n);
}

// --- Comprehensive scoring function (mirrors AIOStreams sort order) ---
function computeScore(torrent, isCached) {
    const name = torrent.name || '';
    let score = 0;

    // 1. Cached (highest priority, from AIOStreams global sort)
    if (isCached) score += 100000;

    // 2. Resolution
    const res = parseResolution(name);
    score += (RESOLUTION_SCORES[res] || 0) * 1000;

    // 3. Source quality
    const srcQ = parseSourceQuality(name);
    score += (SOURCE_QUALITY_SCORES[srcQ] || 0) * 100;

    // 4. Visual tags (best one)
    const vis = parseVisualTags(name);
    const bestVis = Math.max(0, ...vis.map(t => VISUAL_SCORES[t] || 0));
    score += bestVis * 30;

    // 5. Audio tags (best one)
    const aud = parseAudioTags(name);
    const bestAud = Math.max(0, ...aud.map(t => AUDIO_SCORES[t] || 0));
    score += bestAud * 10;

    // 6. Codec
    const codec = parseCodec(name);
    score += (CODEC_SCORES[codec] || 0) * 5;

    // 7. Seeders (tiebreaker)
    score += Math.min(torrent.seeders || 0, 999);

    return { score, resolution: res, sourceQuality: srcQ, codec, visualTags: vis, audioTags: aud };
}

// --- Build rich description line for Stremio ---
function buildStreamTitle(torrent, parsed, provider, isCached) {
    const parts = [];

    // Line 1: torrent name
    // Line 2: technical info
    const techParts = [
        parsed.resolution !== 'Unknown' ? `📌 ${parsed.resolution}` : '',
        parsed.sourceQuality !== 'Unknown' ? `〈${parsed.sourceQuality}〉` : '',
        parsed.codec ? `▣ ${parsed.codec}` : '',
    ].filter(Boolean);

    const visParts = parsed.visualTags.length > 0 ? `✦ ${parsed.visualTags.join(' · ')}` : '';
    const audParts = parsed.audioTags.length > 0 ? `♬ ${parsed.audioTags.join(' · ')}` : '';

    const size = formatSize(torrent.size);
    const metaParts = [
        size ? `💾 ${size}` : '',
        torrent.seeders > 0 ? `🌱 ${torrent.seeders}` : '',
    ].filter(Boolean);

    const cacheLabel = isCached ? '⚡ Cached' : '⏳ Download';
    const provLabel = provider === 'rd' ? 'RD' : 'TB';

    return [
        torrent.name,
        [techParts.join(' | '), visParts, audParts].filter(Boolean).join('  '),
        [metaParts.join(' | '), `${torrent.source} | ${provLabel} ${cacheLabel}`].filter(Boolean).join(' | '),
    ].join('\n');
}

function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function parseSizeText(text) {
    if (!text) return 0;
    const m = text.match(/([\d.]+)\s*(TB|GB|MB|KB)/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = m[2].toUpperCase();
    const mult = { TB: 1024 ** 4, GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024 };
    return Math.round(n * (mult[u] || 0));
}

function cleanHash(h) { return (h || '').toLowerCase().replace(/[^a-f0-9]/g, ''); }

const VIDEO_EXTS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.ts'];
function isVideoFile(name) {
    return VIDEO_EXTS.some(ext => (name || '').toLowerCase().endsWith(ext));
}

// ============================================
//  SOURCE 1: Colabrodo Viola (Local SQLite)
// ============================================
function searchColabrodo(query) {
    if (!db) return [];
    try {
        const words = query.split(/\s+/).filter(w => w.length > 1);
        if (words.length === 0) return [];
        const where = words.map(() => `name LIKE '%' || ? || '%'`).join(' AND ');
        const sql = `SELECT name, info_hash, size, category, seeders FROM torrents WHERE ${where} ORDER BY seeders DESC LIMIT 50`;
        const stmt = db.prepare(sql);
        stmt.bind(words);
        const results = [];
        while (stmt.step()) {
            const r = stmt.getAsObject();
            const hash = cleanHash(r.info_hash);
            if (hash.length === 40) {
                results.push({ name: r.name, infoHash: hash, size: r.size, source: '🗃️ Colabrodo', seeders: r.seeders || 0 });
            }
        }
        stmt.free();
        return results;
    } catch (e) {
        console.error('Colabrodo error:', e.message);
        return [];
    }
}

// ============================================
//  SOURCE 2: Il Corsaro Nero (Scraper)
// ============================================
const CORSARO_DOMAINS = ['ilcorsaronero.link', 'ilcorsaronero.info', 'ilcorsaronero.xyz'];

async function searchCorsaroNero(query) {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    for (const domain of CORSARO_DOMAINS) {
        try {
            const url = `https://${domain}/search?q=${encodeURIComponent(query)}`;
            const r = await fetch(url, { timeout: 8000, headers: { 'User-Agent': UA } });
            if (!r.ok) continue;
            const $ = cheerio.load(await r.text());
            const results = [];

            $('table tr, .result-item, .search-result, .table-row').each((_, el) => {
                const $el = $(el);
                const name = ($el.find('a.tab, .title a, td a').first().text() || '').trim();
                let hash = '';
                const magnet = $el.find('a[href^="magnet:"]').attr('href') || '';
                const m = magnet.match(/btih:([a-fA-F0-9]{40})/i);
                if (m) hash = m[1].toLowerCase();
                const sizeText = $el.find('.size, td:nth-child(3), td:nth-child(2)').text();
                if (name && hash) {
                    results.push({ name, infoHash: hash, size: parseSizeText(sizeText), source: '🏴 Corsaro Nero', seeders: 0 });
                }
            });
            if (results.length > 0) return results;
        } catch (_) { /* try next domain */ }
    }
    return [];
}

// ============================================
//  SOURCE 3: SolidTorrents API (replaces ext.to which is Cloudflare-blocked)
// ============================================
async function searchSolidTorrents(query) {
    try {
        const url = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(query)}&sort=seeders&category=video`;
        const r = await fetch(url, {
            timeout: 8000,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        });
        if (!r.ok) return [];
        const data = await r.json();
        if (!data.results || !Array.isArray(data.results)) return [];

        return data.results
            .filter(t => t.infohash && isItalian(t.title || ''))
            .map(t => ({
                name: t.title || '',
                infoHash: (t.infohash || '').toLowerCase(),
                size: t.size || 0,
                source: '🔗 SolidTorrents',
                seeders: t.swarm?.seeders || 0
            }))
            .filter(r => r.infoHash.length === 40)
            .slice(0, 30);
    } catch (e) {
        console.error('SolidTorrents error:', e.message);
        return [];
    }
}

// ============================================
//  SOURCE 4: Apibay / The Pirate Bay (API)
// ============================================
async function searchApibay(query) {
    try {
        const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=`;
        const r = await fetch(url, { timeout: 8000 });
        if (!r.ok) return [];
        const data = await r.json();
        if (!Array.isArray(data)) return [];
        return data
            .filter(t => t.id !== '0' && t.info_hash !== '0000000000000000000000000000000000000000')
            .filter(t => isItalian(t.name))
            .map(t => ({
                name: t.name,
                infoHash: (t.info_hash || '').toLowerCase(),
                size: parseInt(t.size) || 0,
                source: '🏴‍☠️ PirateBay',
                seeders: parseInt(t.seeders) || 0
            }))
            .slice(0, 30);
    } catch (e) {
        console.error('Apibay error:', e.message);
        return [];
    }
}

// ============================================
//  SOURCE 5: YTS (API — Movies only)
// ============================================
async function searchYTS(imdbId) {
    try {
        const url = `https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}&limit=20`;
        const r = await fetch(url, { timeout: 8000 });
        if (!r.ok) return [];
        const data = await r.json();
        if (!data.data?.movies) return [];
        const results = [];
        for (const movie of data.data.movies) {
            for (const t of (movie.torrents || [])) {
                const hash = (t.hash || '').toLowerCase();
                if (hash) {
                    results.push({
                        name: `${movie.title_long} [${t.quality}] [${t.type}]`,
                        infoHash: hash,
                        size: t.size_bytes || 0,
                        source: '🎬 YTS',
                        seeders: t.seeds || 0
                    });
                }
            }
        }
        return results;
    } catch (e) {
        console.error('YTS error:', e.message);
        return [];
    }
}

// ============================================
//  SOURCE 6: EZTV (API — Series only)
// ============================================
async function searchEZTV(imdbId, season, episode) {
    try {
        const numId = imdbId.replace('tt', '');
        const url = `https://eztvx.to/api/get-torrents?imdb_id=${numId}&limit=50`;
        const r = await fetch(url, { timeout: 8000 });
        if (!r.ok) return [];
        const data = await r.json();
        if (!data.torrents) return [];
        return data.torrents
            .filter(t => {
                if (season && episode) return t.season == season && t.episode == episode;
                return true;
            })
            .filter(t => isItalian(t.title || t.filename || ''))
            .map(t => ({
                name: t.title || t.filename,
                infoHash: (t.hash || '').toLowerCase(),
                size: t.size_bytes || 0,
                source: '📺 EZTV',
                seeders: t.seeds || 0
            }))
            .filter(r => r.infoHash.length === 40);
    } catch (e) {
        console.error('EZTV error:', e.message);
        return [];
    }
}

// ============================================
//  SOURCE 7a: Prowlarr (Optional)
// ============================================
async function searchProwlarr(query) {
    if (!PROWLARR_URL || !PROWLARR_API_KEY) return [];
    try {
        const url = `${PROWLARR_URL}/api/v1/search?query=${encodeURIComponent(query)}&type=search`;
        const r = await fetch(url, { timeout: 10000, headers: { 'X-Api-Key': PROWLARR_API_KEY } });
        if (!r.ok) return [];
        return (await r.json())
            .filter(t => (t.magnetUrl || t.infoHash) && isItalian(t.title || ''))
            .map(t => {
                let hash = t.infoHash || '';
                if (!hash && t.magnetUrl) { const m = t.magnetUrl.match(/btih:([a-fA-F0-9]{40})/i); if (m) hash = m[1]; }
                return { name: t.title, infoHash: hash.toLowerCase(), size: t.size || 0, source: '🔍 Prowlarr', seeders: t.seeders || 0 };
            })
            .filter(r => r.infoHash.length === 40)
            .slice(0, 30);
    } catch (e) { console.error('Prowlarr error:', e.message); return []; }
}

// ============================================
//  SOURCE 7b: Jackett (Optional)
// ============================================
async function searchJackett(query) {
    if (!JACKETT_URL || !JACKETT_API_KEY) return [];
    try {
        const url = `${JACKETT_URL}/api/v2.0/indexers/all/results?apikey=${JACKETT_API_KEY}&Query=${encodeURIComponent(query)}`;
        const r = await fetch(url, { timeout: 10000 });
        if (!r.ok) return [];
        return ((await r.json()).Results || [])
            .filter(t => isItalian(t.Title || ''))
            .map(t => {
                let hash = '';
                if (t.MagnetUri) { const m = t.MagnetUri.match(/btih:([a-fA-F0-9]{40})/i); if (m) hash = m[1]; }
                return { name: t.Title, infoHash: hash.toLowerCase(), size: t.Size || 0, source: '🔎 Jackett', seeders: t.Seeders || 0 };
            })
            .filter(r => r.infoHash.length === 40)
            .slice(0, 30);
    } catch (e) { console.error('Jackett error:', e.message); return []; }
}

// ============================================
//  DEBRID CACHE CHECK — Real-Debrid
// ============================================
async function checkRDCache(hashes) {
    if (!RD_TOKEN || hashes.length === 0) return {};
    try {
        // RD supports up to ~100 hashes per request
        const chunks = [];
        for (let i = 0; i < hashes.length; i += 50) chunks.push(hashes.slice(i, i + 50));
        const cached = {};
        for (const chunk of chunks) {
            const url = `https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${chunk.join('/')}`;
            const r = await fetch(url, { headers: { 'Authorization': `Bearer ${RD_TOKEN}` }, timeout: 8000 });
            if (!r.ok) continue;
            const data = await r.json();
            for (const [hash, info] of Object.entries(data)) {
                if (info && info.rd && info.rd.length > 0) {
                    cached[hash.toLowerCase()] = true;
                }
            }
        }
        return cached;
    } catch (e) {
        console.error('RD cache check error:', e.message);
        return {};
    }
}

// ============================================
//  DEBRID CACHE CHECK — Torbox
// ============================================
async function checkTBCache(hashes) {
    if (!TB_TOKEN || hashes.length === 0) return {};
    try {
        const chunks = [];
        for (let i = 0; i < hashes.length; i += 50) chunks.push(hashes.slice(i, i + 50));
        const cached = {};
        for (const chunk of chunks) {
            const url = `https://api.torbox.app/v1/api/torrents/checkcached?hash=${chunk.join(',')}&format=object&list_files=false`;
            const r = await fetch(url, { headers: { 'Authorization': `Bearer ${TB_TOKEN}` }, timeout: 8000 });
            if (!r.ok) continue;
            const data = await r.json();
            if (data.success && data.data) {
                for (const [hash, val] of Object.entries(data.data)) {
                    if (val) cached[hash.toLowerCase()] = true;
                }
            }
        }
        return cached;
    } catch (e) {
        console.error('TB cache check error:', e.message);
        return {};
    }
}

// ============================================
//  RESOLVE — Real-Debrid
// ============================================
async function resolveRD(infoHash, season, episode) {
    const headers = { 'Authorization': `Bearer ${RD_TOKEN}` };
    const magnet = `magnet:?xt=urn:btih:${infoHash}`;

    // 1. Add magnet
    const addRes = await fetch('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `magnet=${encodeURIComponent(magnet)}`
    });
    if (!addRes.ok) throw new Error(`RD addMagnet failed: ${addRes.status}`);
    const { id } = await addRes.json();

    // 2. Get torrent info to find files
    let info = await (await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${id}`, { headers })).json();

    // 3. Select the right file(s)
    let fileId = 'all';
    if (info.files && info.files.length > 0) {
        const videoFiles = info.files.filter(f => isVideoFile(f.path));
        if (season && episode && videoFiles.length > 1) {
            // Try to match episode pattern like S01E01
            const epPattern = new RegExp(`S0?${season}E0?${episode}`, 'i');
            const epFile = videoFiles.find(f => epPattern.test(f.path));
            if (epFile) fileId = String(epFile.id);
            else fileId = String(videoFiles.sort((a, b) => b.bytes - a.bytes)[0].id);
        } else if (videoFiles.length > 0) {
            // Pick largest video file
            fileId = String(videoFiles.sort((a, b) => b.bytes - a.bytes)[0].id);
        }
    }

    await fetch(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${id}`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `files=${fileId}`
    });

    // 4. Wait for links (poll up to 15 seconds)
    let streamLink = null;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1500));
        info = await (await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${id}`, { headers })).json();
        if (info.links && info.links.length > 0) {
            // Unrestrict the first link
            const unRes = await fetch('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
                method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `link=${encodeURIComponent(info.links[0])}`
            });
            if (unRes.ok) {
                const unData = await unRes.json();
                streamLink = unData.download;
            }
            break;
        }
    }
    return streamLink;
}

// ============================================
//  RESOLVE — Torbox
// ============================================
async function resolveTB(infoHash, season, episode) {
    const headers = { 'Authorization': `Bearer ${TB_TOKEN}` };
    const magnet = `magnet:?xt=urn:btih:${infoHash}`;

    // 1. Create torrent (add magnet)
    const body = new URLSearchParams({ magnet, seed: '3', allow_zip: 'false' });
    const addRes = await fetch('https://api.torbox.app/v1/api/torrents/createtorrent', {
        method: 'POST', headers, body
    });
    if (!addRes.ok) {
        const errText = await addRes.text();
        console.error('TB createtorrent error:', errText);
        throw new Error(`TB createtorrent failed: ${addRes.status}`);
    }
    const addData = await addRes.json();
    const torrentId = addData.data?.torrent_id;
    if (!torrentId) throw new Error('TB: no torrent_id returned');

    // 2. Wait for files and pick the right one
    let fileId = null;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const listRes = await fetch(`https://api.torbox.app/v1/api/torrents/mylist?bypass_cache=true&id=${torrentId}`, { headers });
        if (!listRes.ok) continue;
        const listData = await listRes.json();
        const torrent = listData.data;
        if (!torrent || !torrent.files || torrent.files.length === 0) continue;

        const videoFiles = torrent.files.filter(f => isVideoFile(f.name || f.short_name || ''));
        if (videoFiles.length === 0) continue;

        if (season && episode && videoFiles.length > 1) {
            const epPattern = new RegExp(`S0?${season}E0?${episode}`, 'i');
            const epFile = videoFiles.find(f => epPattern.test(f.name || f.short_name || ''));
            fileId = epFile ? epFile.id : videoFiles.sort((a, b) => b.size - a.size)[0].id;
        } else {
            fileId = videoFiles.sort((a, b) => b.size - a.size)[0].id;
        }
        break;
    }

    if (fileId === null) throw new Error('TB: no video files found');

    // 3. Request download link
    const dlRes = await fetch(
        `https://api.torbox.app/v1/api/torrents/requestdl?torrent_id=${torrentId}&file_id=${fileId}&zip_link=false`,
        { headers }
    );
    if (!dlRes.ok) throw new Error(`TB requestdl failed: ${dlRes.status}`);
    const dlData = await dlRes.json();
    return dlData.data;
}

// ============================================
//  RESOLVE ENDPOINT (302 redirect to stream)
// ============================================
app.get('/resolve/:provider/:infoHash', async (req, res) => {
    const { provider, infoHash } = req.params;
    const season = req.query.s || '';
    const episode = req.query.e || '';

    console.log(`🔗 Resolving ${provider.toUpperCase()} | ${infoHash.substring(0, 8)}... | S${season}E${episode}`);

    try {
        let streamUrl = null;
        if (provider === 'rd' && RD_TOKEN) {
            streamUrl = await resolveRD(infoHash, season, episode);
        } else if (provider === 'tb' && TB_TOKEN) {
            streamUrl = await resolveTB(infoHash, season, episode);
        }

        if (streamUrl) {
            console.log('✅ Resolved — redirecting to stream');
            return res.redirect(302, streamUrl);
        }
        res.status(500).json({ error: 'Failed to resolve stream link' });
    } catch (e) {
        console.error('Resolve error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================
//  STREAM ENDPOINT — The main Stremio route
// ============================================
app.get('/stream/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    const addonUrl = getAddonUrl(req);

    // Parse ID: tt1234567 for movies, tt1234567:1:2 for series (season:episode)
    const parts = id.split(':');
    const imdbId = parts[0];
    const season = parts[1] || '';
    const episode = parts[2] || '';

    console.log(`\n🔍 Stream request: ${type} | ${imdbId} ${season ? `S${season}E${episode}` : ''}`);

    // Get movie/series title from Cinemeta
    const meta = await getMeta(type, imdbId);
    const title = meta?.name || meta?.title || imdbId;
    console.log(`📝 Title: "${title}"`);

    // Build search queries
    const searchQuery = season && episode
        ? `${title} S${season.padStart(2, '0')}E${episode.padStart(2, '0')}`
        : title;
    const searchQueryIta = `${searchQuery} ITA`;

    // 🚀 Search ALL sources in parallel
    const sourcePromises = [
        // Colabrodo (sync but wrapped in promise)
        Promise.resolve(searchColabrodo(title)),
        Promise.resolve(searchColabrodo(searchQueryIta)),
        // Live scrapers
        searchCorsaroNero(searchQueryIta),
        searchSolidTorrents(searchQuery),
        searchSolidTorrents(searchQueryIta),
        searchApibay(searchQueryIta),
        searchApibay(searchQuery),
        // Specialized APIs
        type === 'movie' ? searchYTS(imdbId) : Promise.resolve([]),
        type === 'series' ? searchEZTV(imdbId, season, episode) : Promise.resolve([]),
        // Optional indexers
        searchProwlarr(searchQueryIta),
        searchJackett(searchQueryIta),
    ];

    const sourceResults = await Promise.allSettled(sourcePromises);
    let allResults = [];
    for (const r of sourceResults) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            allResults.push(...r.value);
        }
    }

    // Deduplicate by info_hash
    const seen = new Set();
    allResults = allResults.filter(r => {
        if (seen.has(r.infoHash)) return false;
        seen.add(r.infoHash);
        return true;
    });

    console.log(`📊 Found ${allResults.length} unique torrents from all sources`);

    if (allResults.length === 0) {
        return res.json({ streams: [] });
    }

    // Check debrid cache for all hashes
    const hashes = allResults.map(r => r.infoHash);
    const [rdCache, tbCache] = await Promise.all([
        checkRDCache(hashes),
        checkTBCache(hashes),
    ]);

    // Filter out 3D (excluded in AIOStreams config)
    allResults = allResults.filter(r => !is3D(r.name));

    // Build stream objects with advanced scoring
    const streams = [];
    for (const torrent of allResults) {
        const isRDCached = rdCache[torrent.infoHash];
        const isTBCached = tbCache[torrent.infoHash];

        // Add RD stream if configured
        if (RD_TOKEN) {
            const parsed = computeScore(torrent, isRDCached);
            streams.push({
                name: `Mariflix 🇮🇹`,
                title: buildStreamTitle(torrent, parsed, 'rd', isRDCached),
                url: `${addonUrl}/resolve/rd/${torrent.infoHash}?s=${season}&e=${episode}`,
                behaviorHints: { notWebReady: false, bingeGroup: `mariflix-rd-${torrent.infoHash}` },
                _sortScore: parsed.score,
            });
        }

        // Add TB stream if configured
        if (TB_TOKEN) {
            const parsed = computeScore(torrent, isTBCached);
            streams.push({
                name: `Mariflix 🇮🇹`,
                title: buildStreamTitle(torrent, parsed, 'tb', isTBCached),
                url: `${addonUrl}/resolve/tb/${torrent.infoHash}?s=${season}&e=${episode}`,
                behaviorHints: { notWebReady: false, bingeGroup: `mariflix-tb-${torrent.infoHash}` },
                _sortScore: parsed.score,
            });
        }
    }

    // Sort: cached → resolution → quality → visual → audio → codec → seeders
    streams.sort((a, b) => b._sortScore - a._sortScore);

    // Remove internal sort score before sending
    const cleanStreams = streams.map(({ _sortScore, ...rest }) => rest);

    console.log(`✅ Returning ${cleanStreams.length} streams`);
    res.json({ streams: cleanStreams });
});

// ============================================
//  STARTUP
// ============================================
async function start() {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║       🍿 MARIFLIX — Stremio Addon            ║');
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  Server:     http://localhost:${PORT}            ║`);
        console.log(`║  Manifest:   http://localhost:${PORT}/manifest.json`);
        console.log(`║  Real-Debrid: ${RD_TOKEN ? '✅ Configured' : '❌ Missing'}                   ║`);
        console.log(`║  Torbox:      ${TB_TOKEN ? '✅ Configured' : '❌ Missing'}                   ║`);
        console.log(`║  Prowlarr:    ${PROWLARR_URL ? '✅ Configured' : '⬜ Optional'}                   ║`);
        console.log(`║  Jackett:     ${JACKETT_URL ? '✅ Configured' : '⬜ Optional'}                   ║`);
        console.log('╚══════════════════════════════════════════════╝');
        console.log('');
        console.log('📺 Aggiungi a Stremio → http://localhost:' + PORT + '/manifest.json');
        console.log('');
    });
}

start();
