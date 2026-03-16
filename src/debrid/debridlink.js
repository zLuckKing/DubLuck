// src/debrid/debridlink.js
const axios = require('axios');

const DL_BASE = 'https://debrid-link.com/api/v2';

async function resolve(apiKey, magnet) {
  try {
    // Add seedbox
    const addRes = await axios.post(
      `${DL_BASE}/seedbox/add`,
      { url: magnet, async: false },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const files = addRes.data?.value?.files;
    if (!files || files.length === 0) return null;

    // Get biggest video
    const video = files
      .filter(f => /\.(mkv|mp4|avi)$/i.test(f.name || ''))
      .sort((a, b) => (b.size || 0) - (a.size || 0))[0];

    return video?.downloadUrl || files[0]?.downloadUrl || null;
  } catch (err) {
    console.error('[DebridLink] Error:', err.message);
    return null;
  }
}

async function isValid(apiKey) {
  try {
    const res = await axios.get(`${DL_BASE}/account/infos`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    return res.data?.success === true;
  } catch {
    return false;
  }
}

module.exports = { resolve, isValid };
