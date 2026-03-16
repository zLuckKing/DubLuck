// src/debrid/realdebrid.js
const axios = require('axios');

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';

async function resolve(apiKey, magnet) {
  try {
    // Step 1: Add magnet
    const addRes = await axios.post(
      `${RD_BASE}/torrents/addMagnet`,
      `magnet=${encodeURIComponent(magnet)}`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const torrentId = addRes.data.id;

    // Step 2: Select all files
    await axios.post(
      `${RD_BASE}/torrents/selectFiles/${torrentId}`,
      'files=all',
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Step 3: Get torrent info
    const infoRes = await axios.get(`${RD_BASE}/torrents/info/${torrentId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    const links = infoRes.data.links;
    if (!links || links.length === 0) return null;

    // Step 4: Unrestrict the first link (biggest video file)
    const unrestrictRes = await axios.post(
      `${RD_BASE}/unrestrict/link`,
      `link=${encodeURIComponent(links[0])}`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return unrestrictRes.data.download || null;
  } catch (err) {
    console.error('[RealDebrid] Error:', err.message);
    return null;
  }
}

async function isValid(apiKey) {
  try {
    await axios.get(`${RD_BASE}/user`, { headers: { Authorization: `Bearer ${apiKey}` } });
    return true;
  } catch {
    return false;
  }
}

module.exports = { resolve, isValid };
