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

app.get('/', (req, res) => res.redirect('/configure'));
app.get('/configure', (req, res) => res.sendFile(path.join(__dirname, '../public/configure.html')));

app.get('/validate', async (req, res) => {
  const { service, apiKey } = req.query;
  if (!service || !apiKey) return res.json({ valid: false });
  res.json({ valid: await validateKey(service, apiKey) });
});

app.get('/:config/manifest.json', (req, res) => {
  const config = decodeConfig(req.params.config);
  res.json({
    id: 'br.dubluck.stremio',
    version: '2.3.0',
    name: '🍀 DubLuck',
    description: `Filmes e séries dublados em PT-BR com suporte a ${config.service !== 'none' ? config.service : 'Torrent direto'}.`,
    logo: 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f340.png',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: false },
  });
});

app.get('/manifest.json', (req, res) => res.redirect('/configure'));

app.get('/:config/stream/:type/:id.json', async (req, res) => {
  const { config: configEncoded, type, id } = req.params;
  const config = decodeConfig(configEncoded);
  console.log(`\n[DubLuck] ▶ ${type}/${id} | debrid=${config.service}`);

  try {
    const rawStreams = await getPtBrStreams(type, id, config.qualities);
    if (!rawStreams || rawStreams.length === 0) return res.json({ streams: [] });

    if (config.service === 'none' || !config.apiKey) {
      return res.json({
        streams: rawStreams.filter(s => s.infoHash || s.magnet).slice(0, 10).map(s => ({
          name: `🍀 DubLuck\n${s.source} · ${s.quality}`,
          title: formatTitle(s),
          infoHash: s.infoHash,
          behaviorHints: { notWebReady: true },
        }))
      });
    }

    const serviceTag = { realdebrid: 'RD', alldebrid: 'AD', premiumize: 'PM', debridlink: 'DL' }[config.service] || 'DB';
    const resolved = await Promise.allSettled(
      rawStreams.slice(0, 6).map(async stream => {
        const magnet = stream.magnet || (stream.infoHash ? buildMagnet(stream.infoHash, stream.title) : null);
        if (!magnet) return null;
        const url = await resolveDebrid(config.service, config.apiKey, magnet);
        if (!url) return null;
        return {
          name: `🍀 DubLuck\n${serviceTag} · ${stream.quality}`,
          title: formatTitle(stream),
          url,
          behaviorHints: { notWebReady: false },
        };
      })
    );

    res.json({ streams: resolved.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value) });
  } catch (err) {
    console.error('[DubLuck] Erro:', err.message);
    res.json({ streams: [] });
  }
});

function buildMagnet(infoHash, name = '') {
  const tr = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://p4p.arenabg.com:1337',
  ].map(t => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${tr}`;
}

function formatTitle(stream) {
  const parts = [stream.title];
  const meta = [];
  if (stream.size) meta.push(`💾 ${stream.size}`);
  if (stream.seeds) meta.push(`🌱 ${stream.seeds}`);
  if (meta.length) parts.push(meta.join(' '));
  return parts.filter(Boolean).join('\n');
}

app.listen(PORT, () => console.log(`🍀 DubLuck v2.3 rodando na porta ${PORT}`));
module.exports = app;
```

**Ctrl+S** para salvar! Depois manda os 3 comandos no terminal:
```
git add .
```
```
git commit -m "DubLuck v2.3 - mais fontes e logo corrigida"
```
```
git push origin HEAD:main --force