const { createChildLogger } = require('../utils/logger');
const { fetchWithTimeout } = require('../utils/api-client');

const logger = createChildLogger('advice-api');

const API_URL = 'https://api.adviceslip.com/advice';

/**
 * Fetch random advice from adviceslip.com
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

    if (!data.slip || !data.slip.advice) {
      logger.warn('Advice API returned empty response');
      return null;
    }

    logger.debug('Fetched advice', { id: data.slip.id });
    return data.slip.advice;

  } catch (error) {
    logger.error('Advice API error', { error: error.message });
    throw error;
  }
}

module.exports = {
  fetchAdvice
};
