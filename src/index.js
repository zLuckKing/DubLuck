// src/index.js — DubLuck v2 (Independente)
const express = require('express');
const cors = require('cors');
const path = require('path');
const { resolveDebrid, validateKey } = require('./debrid');
const { getPtBrStreams } = require('./providers/ptbr');
const { decodeConfig } = require('./config');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 7000;

// ─────────────────────────────────────────────
// Rotas de navegação
// ─────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/configure'));

app.get('/configure', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/configure.html'));
});

// ─────────────────────────────────────────────
// Validar chave de API
// ─────────────────────────────────────────────
app.get('/validate', async (req, res) => {
  const { service, apiKey } = req.query;
  if (!service || !apiKey) return res.json({ valid: false });
  const valid = await validateKey(service, apiKey);
  res.json({ valid });
});

// ─────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────
app.get('/:config/manifest.json', (req, res) => {
  const config = decodeConfig(req.params.config);

  res.json({
    id: 'br.dubluck.stremio',
    version: '2.1.0',
    name: '🍀 DubLuck',
    description: `Filmes e séries dublados em PT-BR com suporte a ${config.service !== 'none' ? config.service : 'Torrent direto'}.`,
    logo: 'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/240/apple/354/four-leaf-clover_1f340.png',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  });
});

app.get('/manifest.json', (req, res) => res.redirect('/configure'));

// ─────────────────────────────────────────────
// Handler de streams
// ─────────────────────────────────────────────
app.get('/:config/stream/:type/:id.json', async (req, res) => {
  const { config: configEncoded, type, id } = req.params;
  const config = decodeConfig(configEncoded);

  console.log(`\n[DubLuck] ▶ ${type}/${id} | debrid=${config.service}`);

  try {
    // 1. Buscar torrents PT-BR nas fontes brasileiras
    const rawStreams = await getPtBrStreams(type, id, config.qualities);

    if (!rawStreams || rawStreams.length === 0) {
      console.log(`[DubLuck] ✗ Nenhum stream encontrado`);
      return res.json({ streams: [] });
    }

    // 2. Sem debrid: retorna magnets direto (Stremio baixa o torrent)
    if (config.service === 'none' || !config.apiKey) {
      const streams = rawStreams
        .filter(s => s.infoHash || s.magnet)
        .slice(0, 10)
        .map(s => ({
          name: `🍀 DubLuck\n${s.source} · ${s.quality}`,
          title: formatStreamTitle(s),
          infoHash: s.infoHash,
          behaviorHints: { notWebReady: true },
        }));
      console.log(`[DubLuck] ✓ Retornando ${streams.length} magnets diretos`);
      return res.json({ streams });
    }

    // 3. Com debrid: resolver cada magnet em URL direta
    const MAX_TO_RESOLVE = 6; // limite para evitar timeout
    const toResolve = rawStreams.slice(0, MAX_TO_RESOLVE);

    console.log(`[DubLuck] Resolvendo ${toResolve.length} magnets via ${config.service}...`);

    const resolvePromises = toResolve.map(async (stream) => {
      const magnet = stream.magnet || (stream.infoHash ? buildMagnet(stream.infoHash, stream.title) : null);
      if (!magnet) return null;

      const directUrl = await resolveDebrid(config.service, config.apiKey, magnet);
      if (!directUrl) return null;

      return {
        name: `🍀 DubLuck\n${config.service === 'realdebrid' ? 'RD' : config.service === 'alldebrid' ? 'AD' : config.service === 'premiumize' ? 'PM' : 'DL'} · ${stream.quality}`,
        title: formatStreamTitle(stream),
        url: directUrl,
        behaviorHints: { notWebReady: false },
      };
    });

    const settled = await Promise.allSettled(resolvePromises);
    const resolvedStreams = settled
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    console.log(`[DubLuck] ✓ ${resolvedStreams.length}/${toResolve.length} resolvidos com sucesso`);
    res.json({ streams: resolvedStreams });

  } catch (err) {
    console.error('[DubLuck] ✗ Erro:', err.message);
    res.json({ streams: [] });
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function buildMagnet(infoHash, name = '') {
  const trackers = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://p4p.arenabg.com:1337',
    'udp://tracker.leechers-paradise.org:6969',
  ].map(t => `&tr=${encodeURIComponent(t)}`).join('');

  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackers}`;
}

function formatStreamTitle(stream) {
  const parts = [];
  if (stream.title) parts.push(stream.title);
  const meta = [];
  if (stream.size) meta.push(`💾 ${stream.size}`);
  if (stream.seeds) meta.push(`🌱 ${stream.seeds}`);
  if (meta.length) parts.push(meta.join(' '));
  return parts.join('\n');
}

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🍀  DubLuck v2.0 — Modo Independente  ║
║                                          ║
║   Fontes: BluDV + Comando.la             ║
║   Configure: http://localhost:${PORT}      ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
