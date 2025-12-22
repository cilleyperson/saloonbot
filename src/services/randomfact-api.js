const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('randomfact-api');

const API_URL = 'https://uselessfacts.jsph.pl/api/v2/facts/random';

/**
 * Fetch a random useless fact from uselessfacts.jsph.pl
 * @returns {string|null} Random fact text or null if failed
 */
async function fetchRandomFact() {
  try {
    const response = await fetch(`${API_URL}?language=en`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SaloonBot (https://github.com/twitch-saloonbot)'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.text) {
      logger.warn('Random fact API returned empty response');
      return null;
    }

    logger.debug('Fetched random fact', { id: data.id });
    return data.text;

  } catch (error) {
    logger.error('Random fact API error', { error: error.message });
    throw error;
  }
}

module.exports = {
  fetchRandomFact
};
