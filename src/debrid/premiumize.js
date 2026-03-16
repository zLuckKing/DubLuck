// src/debrid/premiumize.js
const axios = require('axios');

const PM_BASE = 'https://www.premiumize.me/api';

async function resolve(apiKey, magnet) {
  try {
    // Check if already cached
    const cacheRes = await axios.post(`${PM_BASE}/cache/check`, null, {
      params: { apikey: apiKey, items: [magnet] }
    });

    const isCached = cacheRes.data?.response?.[0];

    if (isCached) {
      // Directly transfer
      const directRes = await axios.post(`${PM_BASE}/transfer/directdl`, null, {
        params: { apikey: apiKey, src: magnet }
      });

      const content = directRes.data?.content;
      if (content && content.length > 0) {
        // Get biggest video file
        const video = content
          .filter(f => f.link && /\.(mkv|mp4|avi|mov)$/i.test(f.path || ''))
          .sort((a, b) => (b.size || 0) - (a.size || 0))[0];

        return video?.link || content[0]?.link || null;
      }
    }

    return null;
  } catch (err) {
    console.error('[Premiumize] Error:', err.message);
    return null;
  }
}

async function isValid(apiKey) {
  try {
    const res = await axios.get(`${PM_BASE}/account/info`, {
      params: { apikey: apiKey }
    });
    return res.data?.status === 'success';
  } catch {
    return false;
  }
}

module.exports = { resolve, isValid };
