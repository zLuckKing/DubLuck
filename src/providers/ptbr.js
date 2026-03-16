// src/providers/ptbr.js
// Busca torrents PT-BR diretamente nos sites brasileiros
// via a API do torrent-indexer (github.com/felipemarinho97/torrent-indexer)
// API pública: https://torrent-indexer.darklyn.org

const axios = require('axios');

const INDEXER_BASE = 'https://torrent-indexer.darklyn.org';
const OMDB_BASE = 'https://www.omdbapi.com';

// Todos os indexers PT-BR disponíveis
const PT_BR_INDEXERS = [
  { id: 'bludv',              name: 'BluDV' },
  { id: 'comando_torrents',   name: 'Comando' },
  { id: 'torrent-dos-filmes', name: 'TorrentFilmes' },
  { id: 'filme_torrent',      name: 'FilmeTorrent' },
  { id: 'rede_torrent',       name: 'RedeTorrent' },
  { id: 'vaca_torrent',       name: 'VacaTorrent' },
  { id: 'starck-filmes',      name: 'StarckFilmes' },
];

// Detecta qualidade pelo título
function detectQuality(title = '') {
  const t = title.toLowerCase();
  if (t.includes('2160') || t.includes('4k') || t.includes('uhd')) return '4K';
  if (t.includes('1080')) return '1080p';
  if (t.includes('720')) return '720p';
  if (t.includes('480')) return '480p';
  return 'SD';
}

const QUALITY_RANK = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, 'SD': 1 };

// Busca o título em PT-BR pelo IMDB ID via OMDB (sem chave, apenas título)
async function getTitleFromImdb(imdbId) {
  try {
    // OMDB sem API key retorna info básica com título
    const res = await axios.get(`${OMDB_BASE}/`, {
      params: { i: imdbId, plot: 'short' },
      timeout: 5000,
    });
    if (res.data?.Title) {
      return {
        title: res.data.Title,
        titlePt: res.data.Title, // fallback
        year: res.data.Year?.substring(0, 4) || '',
        type: res.data.Type || 'movie',
      };
    }
  } catch {}

  // Fallback: buscar título via Cinemeta (API do Stremio)
  try {
    const type = imdbId.startsWith('tt') ? 'movie' : 'movie';
    const res = await axios.get(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`, {
      timeout: 5000,
    });
    const meta = res.data?.meta;
    if (meta?.name) {
      return {
        title: meta.name,
        titlePt: meta.name,
        year: meta.year?.toString() || '',
        type: 'movie',
      };
    }
  } catch {}

  return null;
}

// Busca título para série via Cinemeta
async function getSeriesTitleFromImdb(imdbId) {
  try {
    const res = await axios.get(`https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`, {
      timeout: 5000,
    });
    const meta = res.data?.meta;
    if (meta?.name) {
      return {
        title: meta.name,
        year: meta.year?.toString() || '',
        type: 'series',
      };
    }
  } catch {}
  return null;
}

// Normaliza título para busca: remove acentos, artigos, caracteres especiais
function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|o|a|os|as|de|do|da|dos|das|um|uma)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Busca em um indexer específico pelo título
async function searchIndexer(indexer, query, year = '') {
  try {
    const q = year ? `${query} ${year}` : query;
    const res = await axios.get(`${INDEXER_BASE}/indexers/${indexer.id}`, {
      params: {
        q,
        audio: 'por,brazilian',
        filter_results: 'true',
        limit: 10,
        sortBy: 'seed_count',
        sortDirection: 'desc',
      },
      timeout: 10000,
      headers: { 'User-Agent': 'DubLuck/2.0' },
    });

    return (res.data?.results || [])
      .filter(r => r.magnet_link || r.info_hash)
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

// Verifica se um resultado bate com o título buscado
function matchesTitle(resultTitle, searchTitle) {
  const norm1 = normalizeTitle(resultTitle);
  const norm2 = normalizeTitle(searchTitle);
  // Verifica se pelo menos 60% das palavras do título buscado estão no resultado
  const words = norm2.split(' ').filter(w => w.length > 2);
  if (words.length === 0) return true;
  const matches = words.filter(w => norm1.includes(w));
  return matches.length / words.length >= 0.6;
}

/**
 * Função principal: busca torrents PT-BR pelo IMDB ID
 * Para séries: id = "tt1234567:1:1" (imdbId:temporada:episodio)
 */
async function getPtBrStreams(type, id, qualityFilter = []) {
  const imdbId = id.split(':')[0];
  const isSeries = type === 'series' && id.includes(':');
  const season = isSeries ? parseInt(id.split(':')[1]) : null;
  const episode = isSeries ? parseInt(id.split(':')[2]) : null;

  console.log(`[DubLuck] Buscando ${type} ${imdbId}${isSeries ? ` S${season}E${episode}` : ''}`);

  // 1. Buscar o título real pelo IMDB ID
  let titleInfo = null;
  if (isSeries) {
    titleInfo = await getSeriesTitleFromImdb(imdbId);
  } else {
    titleInfo = await getTitleFromImdb(imdbId);
  }

  if (!titleInfo) {
    console.warn(`[DubLuck] Não foi possível obter título para ${imdbId}`);
    return [];
  }

  console.log(`[DubLuck] Título: "${titleInfo.title}" (${titleInfo.year})`);

  // 2. Para séries, adicionar S01E01 na query
  let query = titleInfo.title;
  if (isSeries && season && episode) {
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    query = `${titleInfo.title} S${s}E${e}`;
  }

  // 3. Buscar em todos os indexers simultaneamente
  const searches = PT_BR_INDEXERS.map(idx =>
    searchIndexer(idx, query, isSeries ? '' : titleInfo.year)
  );

  const allResults = await Promise.allSettled(searches);
  let streams = [];

  for (const result of allResults) {
    if (result.status === 'fulfilled') {
      streams.push(...result.value);
    }
  }

  // 4. Filtrar resultados que realmente batem com o título
  streams = streams.filter(s => matchesTitle(s.title, titleInfo.title));

  // 5. Para séries, filtrar por temporada/episódio
  if (isSeries && season && episode) {
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    const filtered = streams.filter(r => {
      const t = r.title.toLowerCase();
      return t.includes(`s${s}e${e}`) || t.includes(`${s}x${e}`);
    });
    if (filtered.length > 0) streams = filtered;
  }

  // 6. Remover duplicatas
  const seen = new Set();
  streams = streams.filter(s => {
    const key = s.infoHash || s.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 7. Filtrar por qualidade
  if (qualityFilter && qualityFilter.length > 0 && qualityFilter.length < 5) {
    const filtered = streams.filter(s => qualityFilter.includes(s.quality));
    if (filtered.length > 0) streams = filtered;
  }

  // 8. Ordenar: qualidade desc, seeds desc
  streams.sort((a, b) => {
    const qDiff = (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
    if (qDiff !== 0) return qDiff;
    return (b.seeds || 0) - (a.seeds || 0);
  });

  console.log(`[DubLuck] ✓ ${streams.length} streams válidos para "${titleInfo.title}"`);
  return streams;
}

module.exports = { getPtBrStreams, detectQuality };
