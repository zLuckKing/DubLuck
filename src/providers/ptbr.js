const axios = require('axios');

const INDEXER_BASE = 'https://torrent-indexer.darklyn.org';

const PT_BR_INDEXERS = [
  { id: 'bludv', name: 'BluDV' },
  { id: 'comando_torrents', name: 'Comando' },
  { id: 'torrent-dos-filmes', name: 'TorrentFilmes' },
  { id: 'filme_torrent', name: 'FilmeTorrent' },
  { id: 'rede_torrent', name: 'RedeTorrent' },
  { id: 'vaca_torrent', name: 'VacaTorrent' },
  { id: 'starck-filmes', name: 'StarckFilmes' },
];

function detectQuality(title = '') {
  const t = title.toLowerCase();
  if (t.includes('2160') || t.includes('4k') || t.includes('uhd')) return '4K';
  if (t.includes('1080')) return '1080p';
  if (t.includes('720')) return '720p';
  if (t.includes('480')) return '480p';
  return 'SD';
}

const QUALITY_RANK = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, 'SD': 1 };

async function getMovieMeta(imdbId, type) {
  try {
    const metaType = type === 'series' ? 'series' : 'movie';
    const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${imdbId}.json`, { timeout: 6000 });
    const meta = res.data?.meta;
    if (meta?.name) {
      return { title: meta.name, year: meta.year?.toString()?.substring(0, 4) || '' };
    }
  } catch {}
  return null;
}

async function searchIndexer(indexer, query, year) {
  try {
    const res = await axios.get(`${INDEXER_BASE}/indexers/${indexer.id}`, {
      params: { q: query, audio: 'por,brazilian', filter_results: 'true', limit: 15, sortBy: 'seed_count', sortDirection: 'desc' },
      timeout: 10000,
      headers: { 'User-Agent': 'DubLuck/2.2' },
    });

    return (res.data?.results || [])
      .filter(r => r.magnet_link || r.info_hash)
      .filter(r => {
        // Filtro por ano: se o ano está no título do torrent, deve bater com o ano do filme
        if (!year) return true;
        const t = r.title || '';
        const yearMatch = t.match(/\b(19|20)\d{2}\b/g);
        if (!yearMatch) return true; // sem ano no título, aceita
        return yearMatch.includes(year); // só aceita se o ano bater
      })
      .map(r => ({
        title: r.title || '',
        magnet: r.magnet_link || null,
        infoHash: r.info_hash || null,
        quality: detectQuality(r.title || ''),
        size: r.size || '',
        seeds: r.seed_count || 0,
        source: indexer.name,
      }));
  } catch (err) {
    console.warn(`[${indexer.name}] Falhou: ${err.message}`);
    return [];
  }
}

async function getPtBrStreams(type, id, qualityFilter = []) {
  const imdbId = id.split(':')[0];
  const isSeries = type === 'series' && id.includes(':');
  const season = isSeries ? parseInt(id.split(':')[1]) : null;
  const episode = isSeries ? parseInt(id.split(':')[2]) : null;

  const meta = await getMovieMeta(imdbId, type);
  if (!meta) { console.warn(`[DubLuck] Sem meta para ${imdbId}`); return []; }

  console.log(`[DubLuck] "${meta.title}" (${meta.year}) ${isSeries ? `S${season}E${episode}` : ''}`);

  let query = meta.title;
  if (isSeries && season && episode) {
    query += ` S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`;
  }

  const results = await Promise.allSettled(
    PT_BR_INDEXERS.map(idx => searchIndexer(idx, query, meta.year))
  );

  let streams = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

  // Séries: filtrar por S01E01
  if (isSeries && season && episode) {
    const s = String(season).padStart(2,'0');
    const e = String(episode).padStart(2,'0');
    const filtered = streams.filter(r => r.title.toLowerCase().includes(`s${s}e${e}`));
    if (filtered.length > 0) streams = filtered;
  }

  // Remover duplicatas
  const seen = new Set();
  streams = streams.filter(s => {
    const key = s.infoHash || s.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filtrar qualidade
  if (qualityFilter?.length > 0 && qualityFilter.length < 5) {
    const f = streams.filter(s => qualityFilter.includes(s.quality));
    if (f.length > 0) streams = f;
  }

  // Ordenar
  streams.sort((a, b) => {
    const qDiff = (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
    return qDiff !== 0 ? qDiff : (b.seeds || 0) - (a.seeds || 0);
  });

  console.log(`[DubLuck] ✓ ${streams.length} streams para "${meta.title}"`);
  return streams;
}

module.exports = { getPtBrStreams, detectQuality };
