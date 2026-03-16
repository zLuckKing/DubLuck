// src/debrid/alldebrid.js
const axios = require('axios');

const AD_BASE = 'https://api.alldebrid.com/v4';

async function resolve(apiKey, magnet) {
  try {
    // Upload magnet
    const uploadRes = await axios.get(`${AD_BASE}/magnet/upload`, {
      params: { agent: 'dubluck', apikey: apiKey, magnets: magnet }
    });

    const magnets = uploadRes.data?.data?.magnets;
    if (!magnets || magnets.length === 0) return null;

    const magnetId = magnets[0].id;
    if (!magnetId) return null;

    // Poll until ready (max 10s)
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await axios.get(`${AD_BASE}/magnet/status`, {
        params: { agent: 'dubluck', apikey: apiKey, id: magnetId }
      });

      const magnetInfo = statusRes.data?.data?.magnets;
      if (magnetInfo?.statusCode === 4) {
        // Ready - get links
        const links = magnetInfo.links;
        if (!links || links.length === 0) return null;

        const unrestrictRes = await axios.get(`${AD_BASE}/link/unlock`, {
          params: { agent: 'dubluck', apikey: apiKey, link: links[0].link }
        });

        return unrestrictRes.data?.data?.link || null;
      }
    }

    return null;
  } catch (err) {
    console.error('[AllDebrid] Error:', err.message);
    return null;
  }
}

async function isValid(apiKey) {
  try {
    const res = await axios.get(`${AD_BASE}/user`, {
      params: { agent: 'dubluck', apikey: apiKey }
    });
    return res.data?.status === 'success';
  } catch {
    return false;
  }
}

module.exports = { resolve, isValid };
