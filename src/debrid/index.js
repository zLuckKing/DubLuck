// src/debrid/index.js

const realDebrid = require('./realdebrid');
const allDebrid = require('./alldebrid');
const premiumize = require('./premiumize');
const debridLink = require('./debridlink');

const SERVICES = {
  realdebrid: realDebrid,
  alldebrid: allDebrid,
  premiumize: premiumize,
  debridlink: debridLink,
};

/**
 * Resolve a magnet link via the configured debrid service.
 * @param {string} service - Service name key
 * @param {string} apiKey  - API key for that service
 * @param {string} magnet  - Magnet URI
 * @returns {Promise<string|null>} Direct HTTP stream URL or null
 */
async function resolveDebrid(service, apiKey, magnet) {
  const svc = SERVICES[service];
  if (!svc) {
    console.warn(`[Debrid] Unknown service: ${service}`);
    return null;
  }
  return svc.resolve(apiKey, magnet);
}

/**
 * Validate an API key for a given service.
 */
async function validateKey(service, apiKey) {
  const svc = SERVICES[service];
  if (!svc) return false;
  return svc.isValid(apiKey);
}

module.exports = { resolveDebrid, validateKey, SERVICES };
