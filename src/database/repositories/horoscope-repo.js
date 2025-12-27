const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('horoscope-repo');

/**
 * Valid zodiac signs with their horoscope.com sign numbers
 */
const ZODIAC_SIGNS = {
  aries: 1,
  taurus: 2,
  gemini: 3,
  cancer: 4,
  leo: 5,
  virgo: 6,
  libra: 7,
  scorpio: 8,
  sagittarius: 9,
  capricorn: 10,
  aquarius: 11,
  pisces: 12
};

/**
 * Sign aliases for user-friendly input
 */
const SIGN_ALIASES = {
  // Full names
  aries: 'aries',
  taurus: 'taurus',
  gemini: 'gemini',
  cancer: 'cancer',
  leo: 'leo',
  virgo: 'virgo',
  libra: 'libra',
  scorpio: 'scorpio',
  sagittarius: 'sagittarius',
  capricorn: 'capricorn',
  aquarius: 'aquarius',
  pisces: 'pisces',
  // Common abbreviations
  ari: 'aries',
  tau: 'taurus',
  gem: 'gemini',
  can: 'cancer',
  vir: 'virgo',
  lib: 'libra',
  sco: 'scorpio',
  sag: 'sagittarius',
  cap: 'capricorn',
  aqu: 'aquarius',
  pis: 'pisces'
};

/**
 * Get the current date in ET (Eastern Time) as YYYY-MM-DD
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getCurrentDateET() {
  // Create a date in Eastern Time
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  const year = etDate.getFullYear();
  const month = String(etDate.getMonth() + 1).padStart(2, '0');
  const day = String(etDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Check if the cached horoscope is still valid (from today ET)
 * @param {string} cachedDate - The date string from the cache (YYYY-MM-DD)
 * @returns {boolean} True if cache is valid (from today)
 */
function isCacheValid(cachedDate) {
  const todayET = getCurrentDateET();
  return cachedDate === todayET;
}

/**
 * Normalize sign input to standard sign name
 * @param {string} input - User input for sign
 * @returns {string|null} Normalized sign name or null if invalid
 */
function normalizeSign(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const normalized = input.toLowerCase().trim();
  return SIGN_ALIASES[normalized] || null;
}

/**
 * Get sign number for horoscope.com URL
 * @param {string} sign - Normalized sign name
 * @returns {number|null} Sign number or null if invalid
 */
function getSignNumber(sign) {
  return ZODIAC_SIGNS[sign] || null;
}

/**
 * Get cached horoscope for a sign
 * @param {string} sign - Zodiac sign (normalized)
 * @returns {Object|null} Cached horoscope or null if not found/expired
 */
function getCached(sign) {
  const db = getDb();

  const cached = db.prepare(`
    SELECT * FROM horoscope_cache WHERE sign = ?
  `).get(sign);

  if (!cached) {
    logger.debug(`No cached horoscope for ${sign}`);
    return null;
  }

  // Check if cache is still valid (from today ET)
  if (!isCacheValid(cached.horoscope_date)) {
    logger.debug(`Cached horoscope for ${sign} is stale (${cached.horoscope_date})`);
    return null;
  }

  logger.debug(`Using cached horoscope for ${sign}`);
  return cached;
}

/**
 * Save or update horoscope in cache
 * @param {string} sign - Zodiac sign (normalized)
 * @param {string} horoscopeText - The horoscope text
 * @param {string} sourceUrl - URL where the horoscope was fetched from
 * @returns {Object} The saved/updated cache entry
 */
function saveToCache(sign, horoscopeText, sourceUrl = null) {
  const db = getDb();
  const todayET = getCurrentDateET();

  // Use INSERT OR REPLACE to handle both insert and update
  db.prepare(`
    INSERT INTO horoscope_cache (sign, horoscope_text, horoscope_date, source_url, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(sign) DO UPDATE SET
      horoscope_text = excluded.horoscope_text,
      horoscope_date = excluded.horoscope_date,
      source_url = excluded.source_url,
      updated_at = CURRENT_TIMESTAMP
  `).run(sign, horoscopeText, todayET, sourceUrl);

  logger.info(`Cached horoscope for ${sign} (date: ${todayET})`);

  return getCached(sign);
}

/**
 * Clear all cached horoscopes
 * @returns {number} Number of entries cleared
 */
function clearCache() {
  const db = getDb();
  const result = db.prepare('DELETE FROM horoscope_cache').run();
  logger.info(`Cleared ${result.changes} cached horoscopes`);
  return result.changes;
}

/**
 * Clear cached horoscope for a specific sign
 * @param {string} sign - Zodiac sign
 * @returns {boolean} Whether an entry was deleted
 */
function clearCacheForSign(sign) {
  const db = getDb();
  const result = db.prepare('DELETE FROM horoscope_cache WHERE sign = ?').run(sign);
  return result.changes > 0;
}

/**
 * Get all valid zodiac sign names
 * @returns {string[]} Array of valid sign names
 */
function getValidSigns() {
  return Object.keys(ZODIAC_SIGNS);
}

/**
 * Get emoji for zodiac sign
 * @param {string} sign - Zodiac sign
 * @returns {string} Emoji for the sign
 */
function getSignEmoji(sign) {
  const emojis = {
    aries: '♈',
    taurus: '♉',
    gemini: '♊',
    cancer: '♋',
    leo: '♌',
    virgo: '♍',
    libra: '♎',
    scorpio: '♏',
    sagittarius: '♐',
    capricorn: '♑',
    aquarius: '♒',
    pisces: '♓'
  };
  return emojis[sign] || '🔮';
}

module.exports = {
  ZODIAC_SIGNS,
  SIGN_ALIASES,
  getCurrentDateET,
  isCacheValid,
  normalizeSign,
  getSignNumber,
  getCached,
  saveToCache,
  clearCache,
  clearCacheForSign,
  getValidSigns,
  getSignEmoji
};
