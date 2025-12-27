const he = require('he');
const { createChildLogger } = require('../utils/logger');
const { fetchWithTimeout } = require('../utils/api-client');
const horoscopeRepo = require('../database/repositories/horoscope-repo');

const logger = createChildLogger('horoscope-api');

/**
 * Base URL for horoscope.com daily horoscopes
 */
const BASE_URL = 'https://www.horoscope.com/us/horoscopes/general/horoscope-general-daily-today.aspx';

/**
 * Timeout for horoscope requests (15 seconds)
 */
const HOROSCOPE_TIMEOUT_MS = 15000;

/**
 * Extract horoscope text from HTML response
 * Looks for the pattern: <p><strong>DATE</strong> - HOROSCOPE TEXT</p>
 * @param {string} html - Raw HTML content
 * @returns {string|null} Extracted horoscope text or null
 */
function extractHoroscopeText(html) {
  // Security: Validate input
  if (!html || typeof html !== 'string') {
    return null;
  }

  // Limit the size of HTML we process to prevent DoS
  const maxLength = 500000; // 500KB should be plenty
  const truncatedHtml = html.slice(0, maxLength);

  // Pattern: <p><strong>DATE</strong> - HOROSCOPE TEXT</p>
  // The date format is like "Dec 27, 2025"
  // Using a regex that captures the horoscope text after the date pattern
  const regex = /<p>\s*<strong>[A-Za-z]{3}\s+\d{1,2},\s+\d{4}<\/strong>\s*-\s*(.*?)<\/p>/is;

  const match = truncatedHtml.match(regex);

  if (!match || !match[1]) {
    logger.warn('Could not extract horoscope text from HTML');
    return null;
  }

  // Clean up the extracted text
  let text = match[1]
    .trim()
    // Remove any remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Decode HTML entities using the 'he' library
  // This properly handles all named entities, numeric entities, and avoids double-decoding
  text = he.decode(text);

  // Validate extracted text length (should be reasonable)
  if (text.length < 20 || text.length > 2000) {
    logger.warn('Extracted horoscope text has unexpected length', { length: text.length });
    return null;
  }

  return text;
}

/**
 * Fetch horoscope from horoscope.com for a given sign
 * @param {string} sign - Normalized zodiac sign name
 * @returns {Promise<string|null>} Horoscope text or null if failed
 */
async function fetchFromWeb(sign) {
  const signNumber = horoscopeRepo.getSignNumber(sign);

  if (!signNumber) {
    logger.error('Invalid sign for fetching', { sign });
    return null;
  }

  // Construct URL with sign parameter
  // Security: sign is validated and signNumber is a known integer 1-12
  const url = `${BASE_URL}?sign=${signNumber}`;

  try {
    logger.debug('Fetching horoscope from web', { sign, url });

    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'SaloonBot/1.0 (Twitch Bot; https://github.com/twitch-saloonbot)'
      }
    }, HOROSCOPE_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const horoscopeText = extractHoroscopeText(html);

    if (!horoscopeText) {
      throw new Error('Failed to extract horoscope text from response');
    }

    logger.info('Successfully fetched horoscope from web', { sign });
    return horoscopeText;

  } catch (error) {
    logger.error('Failed to fetch horoscope from web', {
      sign,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get horoscope for a zodiac sign
 * Checks cache first, fetches from web if cache is stale
 * @param {string} signInput - User input for zodiac sign
 * @returns {Promise<Object>} Object with sign, text, and emoji
 */
async function getHoroscope(signInput) {
  // Normalize and validate the sign
  const sign = horoscopeRepo.normalizeSign(signInput);

  if (!sign) {
    const validSigns = horoscopeRepo.getValidSigns().join(', ');
    return {
      success: false,
      error: `Invalid zodiac sign. Valid signs are: ${validSigns}`
    };
  }

  // Check cache first
  const cached = horoscopeRepo.getCached(sign);

  if (cached) {
    logger.debug('Returning cached horoscope', { sign });
    return {
      success: true,
      sign: sign,
      text: cached.horoscope_text,
      emoji: horoscopeRepo.getSignEmoji(sign),
      fromCache: true
    };
  }

  // Cache miss or stale - fetch from web
  try {
    const horoscopeText = await fetchFromWeb(sign);

    if (!horoscopeText) {
      return {
        success: false,
        error: 'Could not retrieve horoscope. Please try again later.'
      };
    }

    // Save to cache
    const sourceUrl = `${BASE_URL}?sign=${horoscopeRepo.getSignNumber(sign)}`;
    horoscopeRepo.saveToCache(sign, horoscopeText, sourceUrl);

    return {
      success: true,
      sign: sign,
      text: horoscopeText,
      emoji: horoscopeRepo.getSignEmoji(sign),
      fromCache: false
    };

  } catch (error) {
    logger.error('Error getting horoscope', { sign, error: error.message });
    return {
      success: false,
      error: 'Horoscope service is temporarily unavailable. Please try again later.'
    };
  }
}

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format horoscope response for chat
 * @param {string} sign - Zodiac sign
 * @param {string} text - Horoscope text
 * @param {string} emoji - Sign emoji
 * @returns {string} Formatted response
 */
function formatResponse(sign, text, emoji) {
  return `${emoji} ${capitalize(sign)}: ${text}`;
}

module.exports = {
  getHoroscope,
  fetchFromWeb,
  extractHoroscopeText,
  formatResponse,
  capitalize,
  BASE_URL
};
