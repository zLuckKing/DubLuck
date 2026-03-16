const axios = require('axios');

const INDEXER_BASE = 'https://torrent-indexer.darklyn.org';
const BRAZUCA_BASE = 'https://94c8cb9f702d-brazuca-torrents.baby-beamup.club';

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
    const t = type === 'series' ? 'series' : 'movie';
    const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${t}/${imdbId}.json`, { timeout: 6000 });
    const meta = res.data?.meta;
    if (meta?.name) return { title: meta.name, year: meta.year?.toString()?.substring(0, 4) || '' };
  } catch {}
  return null;
}

// Busca no Brazuca Torrents pelo IMDB ID — precisão igual ao Torrentio!
async function searchBrazuca(type, id) {
  try {
    const url = `${BRAZUCA_BASE}/stream/${type}/${id}.json`;
    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'DubLuck/2.4' },
    });

    return (res.data?.streams || [])
      .filter(s => s.infoHash || s.url)
      .map(s => ({
        title: s.title || s.name || '',
        magnet: null,
        infoHash: s.infoHash || null,
        fileIdx: s.fileIdx,
        quality: detectQuality(s.title || s.name || ''),
        size: '',
        seeds: 0,
        source: '🇧🇷 Brazuca',
        isPtBr: true,
        isBrazuca: true,
      }));
  } catch (err) {
    console.warn('[Brazuca] Falhou:', err.message);
    return [];
  }
}

// Busca nos indexers BR por título (fallback)
async function searchIndexers(query, year) {
  const results = await Promise.allSettled(
    PT_BR_INDEXERS.map(async indexer => {
      try {
        const res = await axios.get(`${INDEXER_BASE}/indexers/${indexer.id}`, {
          params: {
            q: query,
            audio: 'por,brazilian',
            filter_results: 'true',
            limit: 10,
            sortBy: 'seed_count',
            sortDirection: 'desc',
          },
          timeout: 10000,
          headers: { 'User-Agent': 'DubLuck/2.4' },
        });
        return (res.data?.results || [])
          .filter(r => r.magnet_link || r.info_hash)
          .filter(r => {
            if (!year) return true;
            const years = (r.title || '').match(/\b(19|20)\d{2}\b/g);
            if (!years) return true;
            if (years.includes(year)) return true;
            if (years.length >= 2) return true;
            if (parseInt(years[0]) >= parseInt(year) - 1) return true;
            return false;
          })
          .map(r => ({
            title: r.title || '',
            magnet: r.magnet_link || null,
            infoHash: r.info_hash || null,
            quality: detectQuality(r.title || ''),
            size: r.size || '',
            seeds: r.seed_count || 0,
            source: indexer.name,
            isPtBr: true,
            isBrazuca: false,
          }));
      } catch { return []; }
    })
  );
  return results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
}

async function getPtBrStreams(type, id, qualityFilter = []) {
  const imdbId = id.split(':')[0];
  const isSeries = type === 'series' && id.includes(':');
  const season = isSeries ? parseInt(id.split(':')[1]) : null;
  const episode = isSeries ? parseInt(id.split(':')[2]) : null;

  const meta = await getMovieMeta(imdbId, type);
  if (!meta) {
    console.warn(`[DubLuck] Sem meta para ${imdbId}`);
    return [];
  }

  console.log(`[DubLuck] "${meta.title}" (${meta.year}) ${isSeries ? `S${season}E${episode}` : ''}`);

  // Busca em paralelo: Brazuca (preciso) + Indexers BR (fallback)
  const [brazucaResults, indexerResults] = await Promise.allSettled([
    searchBrazuca(type, id),
    searchIndexers(meta.title, meta.year),
  ]);

  let streams = [
    ...(brazucaResults.status === 'fulfilled' ? brazucaResults.value : []),
    ...(indexerResults.status === 'fulfilled' ? indexerResults.value : []),
  ];

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

  // Ordenar: Brazuca primeiro (mais preciso), depois qualidade e seeds
  streams.sort((a, b) => {
    if (a.isBrazuca && !b.isBrazuca) return -1;
    if (!a.isBrazuca && b.isBrazuca) return 1;
    const qDiff = (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
    return qDiff !== 0 ? qDiff : (b.seeds || 0) - (a.seeds || 0);
  });

  console.log(`[DubLuck] ✓ ${streams.length} streams | Brazuca:${streams.filter(s => s.isBrazuca).length} Indexers:${streams.filter(s => !s.isBrazuca).length}`);
  return streams;
}

module.exports = { getPtBrStreams, detectQuality };
