const { createChildLogger } = require('../utils/logger');
const { fetchWithTimeout } = require('../utils/api-client');

const logger = createChildLogger('advice-api');

// Using ZenQuotes API - fast and reliable
// adviceslip.com was experiencing severe latency issues (25+ second TLS handshakes)
const API_URL = 'https://zenquotes.io/api/random';

/**
 * Fetch random advice/quote from zenquotes.io
 * @returns {string|null} Advice text or null if failed
 */
async function fetchAdvice() {
  try {
    const response = await fetchWithTimeout(API_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SaloonBot (https://github.com/twitch-saloonbot)'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // ZenQuotes returns an array with a single quote object
    // Format: [{ q: "quote text", a: "author", h: "html" }]
    if (!Array.isArray(data) || data.length === 0 || !data[0].q) {
      logger.warn('Advice API returned empty response');
      return null;
    }

    const quote = data[0];
    logger.debug('Fetched advice', { author: quote.a });

    // Return quote with author attribution
    return `${quote.q} — ${quote.a}`;

  } catch (error) {
    logger.error('Advice API error', { error: error.message });
    throw error;
  }
}

module.exports = {
  fetchAdvice
};
