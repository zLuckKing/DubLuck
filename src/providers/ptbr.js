const axios = require('axios');

const BRAZUCA_BASE = 'https://torrentio.strem.fun/brazuca';

function detectQuality(title = '') {
  const t = title.toLowerCase();
  if (t.includes('2160') || t.includes('4k') || t.includes('uhd')) return '4K';
  if (t.includes('1080')) return '1080p';
  if (t.includes('720')) return '720p';
  if (t.includes('480')) return '480p';
  return 'SD';
}

const QUALITY_RANK = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, 'SD': 1 };

async function getPtBrStreams(type, id, qualityFilter = []) {
  console.log(`[DubLuck] Buscando ${type}/${id} no Torrentio Brazuca`);

  try {
    const url = `${BRAZUCA_BASE}/stream/${type}/${id}.json`;
    const res = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'DubLuck/1.0' },
    });

    let streams = (res.data?.streams || [])
      .filter(s => s.infoHash)
      .map(s => {
        const title = s.title || s.name || '';
        const quality = detectQuality(title);
        return {
          title,
          infoHash: s.infoHash,
          fileIdx: s.fileIdx,
          magnet: null,
          quality,
          size: '',
          seeds: 0,
          source: s.name || 'Brazuca',
        };
      });

    if (qualityFilter?.length > 0 && qualityFilter.length < 5) {
      const f = streams.filter(s => qualityFilter.includes(s.quality));
      if (f.length > 0) streams = f;
    }

    streams.sort((a, b) =>
      (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0)
    );

    console.log(`[DubLuck] ✓ ${streams.length} streams encontrados`);
    return streams;

  } catch (err) {
    console.error('[DubLuck] Erro Brazuca:', err.message);
    return [];
  }
}

module.exports = { getPtBrStreams, detectQuality };
