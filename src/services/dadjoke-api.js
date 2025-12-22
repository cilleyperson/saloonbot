const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('dadjoke-api');

const API_URL = 'https://icanhazdadjoke.com/';

/**
 * Fetch a random dad joke from icanhazdadjoke.com
 * @returns {string|null} Dad joke text or null if failed
 */
async function fetchDadJoke() {
  try {
    const response = await fetch(API_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SaloonBot (https://github.com/twitch-saloonbot)'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.joke) {
      logger.warn('Dad joke API returned empty response');
      return null;
    }

    logger.debug('Fetched dad joke', { id: data.id });
    return data.joke;

  } catch (error) {
    logger.error('Dad joke API error', { error: error.message });
    throw error;
  }
}

module.exports = {
  fetchDadJoke
};
