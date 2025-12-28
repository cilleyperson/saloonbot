/**
 * Stream Status Service
 * Checks if Twitch streams are live using the Twitch API
 */

const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('stream-status');

/**
 * Extract username from Twitch URL
 * @param {string} url - Twitch URL (e.g., https://twitch.tv/username)
 * @returns {string|null} Username or null if invalid
 */
function extractUsernameFromUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);

    // Handle twitch.tv URLs
    if (parsed.hostname === 'twitch.tv' || parsed.hostname === 'www.twitch.tv') {
      // Path should be /username or /username/something
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        return pathParts[0].toLowerCase();
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * StreamStatusService class
 * Uses Twitch API to check stream live status
 */
class StreamStatusService {
  /**
   * Create a new StreamStatusService
   * @param {ApiClient} apiClient - Twurple ApiClient instance
   */
  constructor(apiClient) {
    this.apiClient = apiClient;
    this._cache = new Map(); // username -> { isLive, checkedAt, streamData }
    this._cacheTTL = 30000; // 30 second cache to avoid rate limits
  }

  /**
   * Check if a stream is live
   * @param {string} usernameOrUrl - Twitch username or channel URL
   * @returns {Promise<{isLive: boolean, streamData: Object|null, error: string|null}>}
   */
  async isStreamLive(usernameOrUrl) {
    // Extract username if URL provided
    let username = usernameOrUrl;
    if (usernameOrUrl.includes('twitch.tv')) {
      username = extractUsernameFromUrl(usernameOrUrl);
      if (!username) {
        return { isLive: false, streamData: null, error: 'Invalid Twitch URL' };
      }
    }

    username = username.toLowerCase();

    // Check cache first
    const cached = this._cache.get(username);
    if (cached && (Date.now() - cached.checkedAt) < this._cacheTTL) {
      logger.debug('Using cached stream status', { username, isLive: cached.isLive });
      return { isLive: cached.isLive, streamData: cached.streamData, error: null };
    }

    try {
      // Get user first to verify they exist
      const user = await this.apiClient.users.getUserByName(username);
      if (!user) {
        logger.warn('User not found on Twitch', { username });
        return { isLive: false, streamData: null, error: 'User not found' };
      }

      // Check stream status
      const stream = await this.apiClient.streams.getStreamByUserId(user.id);

      const isLive = stream !== null;
      const streamData = stream ? {
        id: stream.id,
        userId: stream.userId,
        userName: stream.userName,
        gameName: stream.gameName,
        title: stream.title,
        viewerCount: stream.viewers,
        startDate: stream.startDate,
        thumbnailUrl: stream.thumbnailUrl,
        isMature: stream.isMature
      } : null;

      // Update cache
      this._cache.set(username, {
        isLive,
        streamData,
        checkedAt: Date.now()
      });

      logger.debug('Stream status checked', { username, isLive });
      return { isLive, streamData, error: null };

    } catch (error) {
      logger.error('Error checking stream status', { username, error: error.message });

      // Return cached value if available on error
      if (cached) {
        logger.debug('Using stale cache on error', { username });
        return { isLive: cached.isLive, streamData: cached.streamData, error: null };
      }

      return { isLive: false, streamData: null, error: error.message };
    }
  }

  /**
   * Check multiple streams at once
   * @param {string[]} usernamesOrUrls - Array of usernames or URLs
   * @returns {Promise<Map<string, {isLive: boolean, streamData: Object|null}>>}
   */
  async checkMultipleStreams(usernamesOrUrls) {
    const results = new Map();

    // Extract usernames
    const usernames = usernamesOrUrls.map(u => {
      if (u.includes('twitch.tv')) {
        return extractUsernameFromUrl(u);
      }
      return u?.toLowerCase();
    }).filter(Boolean);

    if (usernames.length === 0) {
      return results;
    }

    try {
      // Get all users at once
      const users = await this.apiClient.users.getUsersByNames(usernames);
      const userIds = users.map(u => u.id);

      if (userIds.length === 0) {
        return results;
      }

      // Get all live streams for these users
      const streams = await this.apiClient.streams.getStreamsByUserIds(userIds);
      const liveUserIds = new Set(streams.map(s => s.userId));

      // Build results
      for (const user of users) {
        const isLive = liveUserIds.has(user.id);
        const stream = streams.find(s => s.userId === user.id);

        const streamData = stream ? {
          id: stream.id,
          userId: stream.userId,
          userName: stream.userName,
          gameName: stream.gameName,
          title: stream.title,
          viewerCount: stream.viewers,
          startDate: stream.startDate
        } : null;

        results.set(user.name.toLowerCase(), { isLive, streamData });

        // Update cache
        this._cache.set(user.name.toLowerCase(), {
          isLive,
          streamData,
          checkedAt: Date.now()
        });
      }

      logger.debug('Checked multiple streams', {
        count: usernames.length,
        liveCount: streams.length
      });

    } catch (error) {
      logger.error('Error checking multiple streams', { error: error.message });
    }

    return results;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this._cache.clear();
    logger.debug('Stream status cache cleared');
  }

  /**
   * Set cache TTL
   * @param {number} ttlMs - Cache TTL in milliseconds
   */
  setCacheTTL(ttlMs) {
    this._cacheTTL = ttlMs;
  }
}

module.exports = {
  StreamStatusService,
  extractUsernameFromUrl
};
