// src/config.js
// Codifica e decodifica a configuração na URL do addon
// Exemplo: /eyJzZXJ2aWNlIjoicmVhbGRlYnJpZCIsImFwaUtleSI6Inh4eCJ9/manifest.json

const DEFAULT_CONFIG = {
  service: 'none',    // 'realdebrid' | 'alldebrid' | 'premiumize' | 'debridlink' | 'none'
  apiKey: '',
  qualities: ['4K', '1080p', '720p', '480p', 'SD'],  // all by default
};

function encodeConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  return Buffer.from(JSON.stringify(merged)).toString('base64url');
}

function decodeConfig(encoded) {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

module.exports = { encodeConfig, decodeConfig, DEFAULT_CONFIG };
