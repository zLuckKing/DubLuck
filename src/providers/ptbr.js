const axios = require('axios');

const INDEXER_BASE = 'https://torrent-indexer.darklyn.org';
const ORION_BASE = 'https://api.orionoid.com';

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

async function searchOrion(orionKey, imdbId, type, season, episode) {
  try {
    const params = {
      keyapp: 'DUBLUCK',
      keyuser: orionKey,
      mode: 'stream',
      action: 'retrieve',
      type: type === 'series' ? 'show' : 'movie',
      idimdb: imdbId.replace('tt', ''),
      limitcount: 5,
      sortvalue: 'best',
      streamtype: 'torrent',
      audiolanguage: 'pt',
    };
    if (type === 'series' && season && episode) {
      params.numberseason = season;
      params.numberepisode = episode;
    }

    const res = await axios.get(ORION_BASE, { params, timeout: 10000 });
    let streams = res.data?.data?.streams || [];

    if (streams.length === 0) {
      const res2 = await axios.get(ORION_BASE, {
        params: { ...params, audiolanguage: undefined },
        timeout: 10000,
      });
      streams = res2.data?.data?.streams || [];
    }

    return streams.map(s => {
      const video = s.video || {};
      const torrent = s.torrent || {};
      const file = s.file || {};
      const audio = s.audio || {};
      const langs = (audio.languages || []).join(',').toLowerCase();
      const isPtBr = langs.includes('pt') || langs.includes('por');
      const quality = video.quality === 'hd4k' ? '4K' :
                      video.quality === 'hd1080' ? '1080p' :
                      video.quality === 'hd720' ? '720p' : 'SD';
      return {
        title: file.name || '',
        magnet: torrent.magnet || null,
        infoHash: torrent.hash || null,
        quality,
        size: file.size ? `${(file.size / 1073741824).toFixed(1)} GB` : '',
        seeds: torrent.seeds || 0,
        source: isPtBr ? '🇧🇷 Orion PT-BR' : '🌐 Orion',
        isPtBr,
      };
    }).filter(s => s.magnet || s.infoHash);
  } catch (err) {
    console.warn('[Orion] Falhou:', err.message);
    return [];
  }
}

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
          headers: { 'User-Agent': 'DubLuck/1.0' },
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
          }));
      } catch { return []; }
    })
  );
  return results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
}

async function getPtBrStreams(type, id, qualityFilter = [], orionKey = null) {
  const imdbId = id.split(':')[0];
  const isSeries = type === 'series' && id.includes(':');
  const season = isSeries ? parseInt(id.split(':')[1]) : null;
  const episode = isSeries ? parseInt(id.split(':')[2]) : null;

  const meta = await getMovieMeta(imdbId, type);
  if (!meta) return [];

  console.log(`[DubLuck] "${meta.title}" (${meta.year}) | orion=${!!orionKey}`);

  const searches = [searchIndexers(meta.title, meta.year)];
  if (orionKey) searches.push(searchOrion(orionKey, imdbId, type, season, episode));

  const allResults = await Promise.allSettled(searches);
  let streams = allResults.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

  if (isSeries && season && episode) {
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    const filtered = streams.filter(r => r.title.toLowerCase().includes(`s${s}e${e}`));
    if (filtered.length > 0) streams = filtered;
  }

  const seen = new Set();
  streams = streams.filter(s => {
    const key = s.infoHash || s.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (qualityFilter?.length > 0 && qualityFilter.length < 5) {
    const f = streams.filter(s => qualityFilter.includes(s.quality));
    if (f.length > 0) streams = f;
  }

  streams.sort((a, b) => {
    const qDiff = (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
    return qDiff !== 0 ? qDiff : (b.seeds || 0) - (a.seeds || 0);
  });

  console.log(`[DubLuck] ✓ ${streams.length} streams`);
  return streams;
}

module.exports = { getPtBrStreams, detectQuality };
