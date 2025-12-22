/**
 * API client utility for external API calls with timeout support
 */

const { createChildLogger } = require('./logger');

const logger = createChildLogger('api-client');

/**
 * Default timeout for API requests (10 seconds)
 */
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Fetch with timeout support
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.warn('Request timed out', { url, timeoutMs });
      throw new Error('Request timed out');
    }
    // Don't leak internal paths in error messages
    logger.error('API request failed', { error: error.message });
    throw new Error('External API request failed');
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  fetchWithTimeout,
  DEFAULT_TIMEOUT_MS
};
