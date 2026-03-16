const axios = require('axios');

const INDEXER_BASE = 'https://torrent-indexer.darklyn.org';

const PT_BR_INDEXERS = [
  { id: 'bludv',              name: 'BluDV' },
  { id: 'comando_torrents',   name: 'Comando' },
  { id: 'torrent-dos-filmes', name: 'TorrentFilmes' },
  { id: 'filme_torrent',      name: 'FilmeTorrent' },
  { id: 'rede_torrent',       name: 'RedeTorrent' },
  { id: 'vaca_torrent',       name: 'VacaTorrent' },
  { id: 'starck-filmes',      name: 'StarckFilmes' },
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

// Busca nos 7 indexers brasileiros
async function searchIndexers(query, year) {
  const results = await Promise.allSettled(
    PT_BR_INDEXERS.map(async indexer => {
      try {
        const res = await axios.get(`${INDEXER_BASE}/indexers/${indexer.id}`, {
          params: { q: query, audio: 'por,brazilian', filter_results: 'true', limit: 15, sortBy: 'seed_count', sortDirection: 'desc' },
          timeout: 10000,
          headers: { 'User-Agent': 'DubLuck/2.3' },
        });
        return (res.data?.results || [])
          .filter(r => r.magnet_link || r.info_hash)
          .filter(r => {
            if (!year) return true;
            const t = r.title || '';
            const years = t.match(/\b(19|20)\d{2}\b/g);
            // Aceita se: sem ano no título, ou ano bate, ou é coleção (múltiplos anos)
            if (!years) return true;
            if (years.includes(year)) return true;
            if (years.length >= 2) return true; // coleção
            if (parseInt(years[0]) >= parseInt(year) - 1) return true; // ano próximo
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
          }));
      } catch (err) {
        console.warn(`[${indexer.name}] Falhou: ${err.message}`);
        return [];
      }
    })
  );
  return results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
}

// Busca direta no ApacheTorrent (scraping via API pública)
async function searchApache(query, year) {
  try {
    const q = year ? `${query} ${year}` : query;
    const res = await axios.get('https://apachetorrent.com/api/search', {
      params: { q, limit: 10 },
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return (res.data?.results || res.data?.torrents || [])
      .filter(r => r.magnet || r.magnet_link || r.info_hash)
      .map(r => ({
        title: r.title || r.name || '',
        magnet: r.magnet || r.magnet_link || null,
        infoHash: r.info_hash || null,
        quality: detectQuality(r.title || r.name || ''),
        size: r.size || '',
        seeds: r.seeders || r.seeds || 0,
        source: 'ApacheTorrent',
      }));
  } catch { return []; }
}

// Busca no YTS filtrando por áudio PT-BR (filmes com dual audio)
async function searchYTS(query, year, imdbId) {
  try {
    const params = { limit: 10, sort_by: 'seeds' };
    if (imdbId) params.query_term = imdbId;
    else params.query_term = year ? `${query} ${year}` : query;

    const res = await axios.get('https://yts.mx/api/v2/list_movies.json', {
      params,
      timeout: 8000,
      headers: { 'User-Agent': 'DubLuck/2.3' },
    });

    const movies = res.data?.data?.movies || [];
    const streams = [];

    for (const movie of movies) {
      // Só aceita se o título bate com o ano correto
      if (year && movie.year?.toString() !== year) continue;

      for (const torrent of (movie.torrents || [])) {
        // YTS não tem PT-BR, mas tem filmes com dual audio nas cópias
        // Só incluímos como fallback se não achou nada nos indexers BR
        const magnet = `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movie.title_long)}`;
        streams.push({
          title: `${movie.title_long} [${torrent.quality}] ⚠️ Pode ser sem dub`,
          magnet,
          infoHash: torrent.hash,
          quality: torrent.quality === '2160p' ? '4K' : torrent.quality,
          size: torrent.size || '',
          seeds: torrent.seeds || 0,
          source: 'YTS',
          isYts: true,
        });
      }
    }
    return streams;
  } catch { return []; }
}

// Tenta variações do título para aumentar chances de achar
function getTitleVariations(title, year) {
  const variations = [title];
  // Versão sem artigos iniciais
  const noArticle = title.replace(/^(The|A|An|O|A|Os|As)\s+/i, '');
  if (noArticle !== title) variations.push(noArticle);
  // Versão com ano
  if (year) variations.push(`${title} ${year}`);
  return [...new Set(variations)];
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

  // Busca em todas as variações do título em paralelo
  const variations = getTitleVariations(meta.title, null);
  const allSearches = [];

  for (const v of variations) {
    allSearches.push(searchIndexers(isSeries ? query : v, meta.year));
  }
  allSearches.push(searchApache(query, meta.year));

  const allResults = await Promise.allSettled(allSearches);
  let streams = allResults.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

  // Se não achou nada nos indexers BR, tenta YTS como fallback
  if (streams.length === 0 && !isSeries) {
    console.log(`[DubLuck] Sem resultados BR, tentando YTS como fallback...`);
    streams = await searchYTS(meta.title, meta.year, imdbId);
  }

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

  // Ordenar: PT-BR primeiro, depois qualidade, depois seeds
  streams.sort((a, b) => {
    // YTS vai pro final (pode não ter dub)
    if (a.isYts && !b.isYts) return 1;
    if (!a.isYts && b.isYts) return -1;
    const qDiff = (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
    return qDiff !== 0 ? qDiff : (b.seeds || 0) - (a.seeds || 0);
  });

  console.log(`[DubLuck] ✓ ${streams.length} streams para "${meta.title}"`);
  return streams;
}

module.exports = { getPtBrStreams, detectQuality };
