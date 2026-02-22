const { RefreshingAuthProvider } = require('@twurple/auth');
const config = require('../config');
const authRepo = require('../database/repositories/auth-repo');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('auth-manager');

/**
 * Manages authentication for the bot and multiple channels using a single
 * multi-user RefreshingAuthProvider.
 *
 * This architecture enables EventSub to find tokens for any registered user
 * by their Twitch ID, which is required for channel-specific subscriptions.
 */
const PROACTIVE_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const RETRY_BASE_DELAY_MS = 5000; // 5 seconds
const MAX_RETRY_ATTEMPTS = 3;

class AuthManager {
  constructor() {
    this.authProvider = null;          // Single multi-user provider
    this.botTwitchId = null;           // Bot's Twitch user ID
    this.botUsername = null;           // Bot's Twitch username
    this.channelTwitchIds = new Set(); // Track registered channel Twitch IDs
    this.initialized = false;
    this._proactiveRefreshInterval = null;
    this._pendingRetries = new Map();  // Track in-flight retries by userId
  }

  /**
   * Initialize the auth manager
   * Creates a single auth provider and loads all tokens
   */
  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing auth manager with multi-user provider');

    // Create single multi-user auth provider
    this.authProvider = new RefreshingAuthProvider({
      clientId: config.twitch.clientId,
      clientSecret: config.twitch.clientSecret
    });

    // Set up refresh callback for all users
    this.authProvider.onRefresh((userId, newTokenData) => {
      this._handleTokenRefresh(userId, newTokenData);
    });

    // Set up refresh failure handler to recover from transient errors
    this.authProvider.onRefreshFailure((userId, error) => {
      this._handleRefreshFailure(userId, error);
    });

    // Load bot token
    await this._loadBotAuth();

    // Load all channel tokens
    await this._loadAllChannelAuths();

    // Start proactive token refresh interval
    this._startProactiveRefresh();

    this.initialized = true;
    logger.info(`Auth manager initialized with ${this.channelTwitchIds.size} channel tokens`);
  }

  /**
   * Shutdown the auth manager - clear intervals and pending retries
   */
  shutdown() {
    if (this._proactiveRefreshInterval) {
      clearInterval(this._proactiveRefreshInterval);
      this._proactiveRefreshInterval = null;
    }

    // Clear any pending retry timeouts
    for (const [userId, timeoutId] of this._pendingRetries) {
      clearTimeout(timeoutId);
    }
    this._pendingRetries.clear();

    logger.info('Auth manager shut down');
  }

  /**
   * Load bot authentication from database
   */
  async _loadBotAuth() {
    const botAuth = authRepo.getBotAuthWithTwitchId();

    if (!botAuth) {
      logger.warn('No bot authentication found. Please authenticate the bot via /auth/bot');
      return false;
    }

    if (botAuth.twitch_user_id) {
      this.botTwitchId = botAuth.twitch_user_id;
      this.botUsername = botAuth.bot_username;

      // Scopes are already parsed as array by auth-repo
      const scopeArray = Array.isArray(botAuth.scopes) ? botAuth.scopes : [];

      const tokenInfo = this._computeTokenExpiry(botAuth.expires_at, botAuth.updated_at);

      this.authProvider.addUser(botAuth.twitch_user_id, {
        accessToken: botAuth.access_token,
        refreshToken: botAuth.refresh_token,
        scope: scopeArray,
        expiresIn: tokenInfo.expiresIn,
        obtainmentTimestamp: tokenInfo.obtainmentTimestamp
      }, ['chat']); // Bot needs chat intents

      logger.info(`Loaded bot token for ${botAuth.bot_username} (Twitch ID: ${botAuth.twitch_user_id})`, { scopes: scopeArray });
      return true;
    } else {
      // Legacy bot auth without Twitch ID
      logger.warn('Bot auth exists but missing Twitch ID - please re-authorize via /auth/bot');
      return false;
    }
  }

  /**
   * Load all channel authentications from database
   */
  async _loadAllChannelAuths() {
    const channelAuths = authRepo.getAllChannelAuthsWithTwitchId();

    for (const auth of channelAuths) {
      // Use stored twitch_user_id, fallback to channel's twitch_id
      const twitchId = auth.twitch_user_id || auth.channel_twitch_id;

      if (!twitchId) {
        logger.warn(`Channel ${auth.channel_id} has no Twitch ID - skipping token registration`);
        continue;
      }

      // Update database if we used fallback
      if (!auth.twitch_user_id && auth.channel_twitch_id) {
        authRepo.updateChannelTwitchId(auth.channel_id, auth.channel_twitch_id);
        logger.debug(`Backfilled twitch_user_id for channel ${auth.channel_id}`);
      }

      try {
        const tokenInfo = this._computeTokenExpiry(auth.expires_at, auth.updated_at);

        this.authProvider.addUser(twitchId, {
          accessToken: auth.access_token,
          refreshToken: auth.refresh_token,
          scope: auth.scopes ? auth.scopes.split(' ') : [],
          expiresIn: tokenInfo.expiresIn,
          obtainmentTimestamp: tokenInfo.obtainmentTimestamp
        }, ['channel']); // Channels don't need chat intents

        this.channelTwitchIds.add(twitchId);
        logger.debug(`Loaded channel token for Twitch ID ${twitchId}`);
      } catch (error) {
        logger.error(`Failed to load auth for channel ${auth.channel_id}`, { error: error.message });
      }
    }

    logger.info(`Loaded ${this.channelTwitchIds.size} channel tokens`);
  }

  /**
   * Handle token refresh (save to DB)
   * @param {string} userId - Twitch user ID
   * @param {Object} newTokenData - New token data
   */
  async _handleTokenRefresh(userId, newTokenData) {
    logger.debug(`Token refreshed for user ${userId}`);

    const expiresAt = newTokenData.expiresIn
      ? new Date(Date.now() + newTokenData.expiresIn * 1000).toISOString()
      : null;

    if (userId === this.botTwitchId) {
      authRepo.updateBotAuth({
        accessToken: newTokenData.accessToken,
        refreshToken: newTokenData.refreshToken,
        expiresAt
      });
      logger.debug('Bot token updated in database');
    } else {
      authRepo.updateChannelAuthByTwitchId(userId, {
        accessToken: newTokenData.accessToken,
        refreshToken: newTokenData.refreshToken,
        expiresAt
      });
      logger.debug(`Channel token updated in database for Twitch user ${userId}`);
    }
  }

  /**
   * Compute expiresIn and obtainmentTimestamp from stored DB values.
   * Falls back to expiresIn: 0 (forces refresh) if expires_at is unavailable.
   * @param {string|null} expiresAt - ISO timestamp of token expiry
   * @param {string|null} updatedAt - ISO timestamp of last token update
   * @returns {{ expiresIn: number, obtainmentTimestamp: number }}
   */
  _computeTokenExpiry(expiresAt, updatedAt) {
    if (!expiresAt) {
      return { expiresIn: 0, obtainmentTimestamp: Date.now() };
    }

    const expiresAtMs = new Date(expiresAt).getTime();
    const obtainmentTimestamp = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    const expiresIn = Math.max(0, Math.floor((expiresAtMs - obtainmentTimestamp) / 1000));

    return { expiresIn, obtainmentTimestamp };
  }

  /**
   * Handle a token refresh failure by scheduling retries with exponential backoff.
   * @param {string} userId - Twitch user ID whose refresh failed
   * @param {Error} error - The refresh error
   */
  _handleRefreshFailure(userId, error) {
    logger.warn(`Token refresh failed for user ${userId}`, { error: error.message });

    // Don't stack retries for the same user
    if (this._pendingRetries.has(userId)) {
      logger.debug(`Retry already pending for user ${userId}, skipping`);
      return;
    }

    this._scheduleRetry(userId, 1);
  }

  /**
   * Schedule a retry attempt for a failed token refresh.
   * @param {string} userId - Twitch user ID
   * @param {number} attempt - Current attempt number (1-based)
   */
  _scheduleRetry(userId, attempt) {
    if (attempt > MAX_RETRY_ATTEMPTS) {
      logger.error(`All ${MAX_RETRY_ATTEMPTS} token refresh retries exhausted for user ${userId}. Manual re-authentication required.`);
      this._pendingRetries.delete(userId);
      return;
    }

    const delay = RETRY_BASE_DELAY_MS * Math.pow(3, attempt - 1); // 5s, 15s, 45s
    logger.info(`Scheduling token refresh retry ${attempt}/${MAX_RETRY_ATTEMPTS} for user ${userId} in ${delay / 1000}s`);

    const timeoutId = setTimeout(async () => {
      try {
        // Verify user is still registered (may have been removed during wait)
        const isRegistered = userId === this.botTwitchId || this.channelTwitchIds.has(userId);
        if (!isRegistered) {
          logger.debug(`User ${userId} no longer registered, cancelling retry`);
          this._pendingRetries.delete(userId);
          return;
        }

        // Reload token from DB and re-add to provider (clears cached failure)
        await this._reAddUserFromDb(userId);

        // Force a fresh refresh attempt
        await this.authProvider.refreshAccessTokenForUser(userId);

        logger.info(`Token refresh retry succeeded for user ${userId} on attempt ${attempt}`);
        this._pendingRetries.delete(userId);
      } catch (retryError) {
        logger.warn(`Token refresh retry ${attempt}/${MAX_RETRY_ATTEMPTS} failed for user ${userId}`, { error: retryError.message });
        this._pendingRetries.delete(userId);
        this._scheduleRetry(userId, attempt + 1);
      }
    }, delay);

    this._pendingRetries.set(userId, timeoutId);
  }

  /**
   * Re-add a user to the auth provider from the database, clearing any cached failure state.
   * @param {string} userId - Twitch user ID
   */
  async _reAddUserFromDb(userId) {
    if (userId === this.botTwitchId) {
      const botAuth = authRepo.getBotAuthWithTwitchId();
      if (!botAuth) {
        throw new Error('Bot auth not found in database');
      }

      const scopeArray = Array.isArray(botAuth.scopes) ? botAuth.scopes : [];
      const tokenInfo = this._computeTokenExpiry(botAuth.expires_at, botAuth.updated_at);

      this.authProvider.addUser(userId, {
        accessToken: botAuth.access_token,
        refreshToken: botAuth.refresh_token,
        scope: scopeArray,
        expiresIn: tokenInfo.expiresIn,
        obtainmentTimestamp: tokenInfo.obtainmentTimestamp
      }, ['chat']);

      logger.debug(`Re-added bot user ${userId} to auth provider from database`);
    } else {
      const channelAuths = authRepo.getAllChannelAuthsWithTwitchId();
      const auth = channelAuths.find(a => (a.twitch_user_id || a.channel_twitch_id) === userId);

      if (!auth) {
        throw new Error(`Channel auth not found for Twitch user ${userId}`);
      }

      const tokenInfo = this._computeTokenExpiry(auth.expires_at, auth.updated_at);

      this.authProvider.addUser(userId, {
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token,
        scope: auth.scopes ? auth.scopes.split(' ') : [],
        expiresIn: tokenInfo.expiresIn,
        obtainmentTimestamp: tokenInfo.obtainmentTimestamp
      }, ['channel']);

      logger.debug(`Re-added channel user ${userId} to auth provider from database`);
    }
  }

  /**
   * Start the proactive token refresh interval.
   * Refreshes all registered user tokens every 3 hours to keep them fresh.
   */
  _startProactiveRefresh() {
    this._proactiveRefreshInterval = setInterval(async () => {
      logger.info('Starting proactive token refresh cycle');

      const userIds = [this.botTwitchId, ...this.channelTwitchIds].filter(Boolean);
      let successCount = 0;
      let failCount = 0;

      for (const userId of userIds) {
        try {
          await this.authProvider.refreshAccessTokenForUser(userId);
          successCount++;
        } catch (error) {
          failCount++;
          logger.warn(`Proactive refresh failed for user ${userId}`, { error: error.message });
          // onRefreshFailure handler will take care of retries
        }
      }

      logger.info(`Proactive token refresh completed: ${successCount} succeeded, ${failCount} failed out of ${userIds.length} users`);
    }, PROACTIVE_REFRESH_INTERVAL_MS);

    // Don't prevent process exit
    if (this._proactiveRefreshInterval.unref) {
      this._proactiveRefreshInterval.unref();
    }

    logger.debug('Proactive token refresh interval started (every 3 hours)');
  }

  /**
   * Get the single auth provider (used by BotCore)
   * @returns {RefreshingAuthProvider}
   */
  getAuthProvider() {
    return this.authProvider;
  }

  /**
   * Get bot auth provider (alias for backward compatibility)
   * @returns {RefreshingAuthProvider}
   * @deprecated Use getAuthProvider() instead
   */
  getBotAuthProvider() {
    return this.authProvider;
  }

  /**
   * Check if bot is authenticated
   * @returns {boolean}
   */
  isBotAuthenticated() {
    return this.botTwitchId !== null;
  }

  /**
   * Get bot's Twitch user ID
   * @returns {string|null}
   */
  getBotTwitchId() {
    return this.botTwitchId;
  }

  /**
   * Get bot's username
   * @returns {string|null}
   */
  getBotUsername() {
    return this.botUsername;
  }

  /**
   * Check if a channel has a registered token
   * @param {string} twitchId - Twitch user ID
   * @returns {boolean}
   */
  hasChannelToken(twitchId) {
    return this.channelTwitchIds.has(twitchId);
  }

  /**
   * Check if channel is authenticated (by channel ID)
   * @param {number} channelId - Channel database ID
   * @returns {boolean}
   */
  isChannelAuthenticated(channelId) {
    const twitchId = authRepo.getChannelTwitchId(channelId);
    return twitchId ? this.channelTwitchIds.has(twitchId) : false;
  }

  /**
   * Save bot authentication with Twitch ID
   * @param {Object} tokenData - Token data from OAuth
   * @param {string} twitchId - Bot's Twitch user ID
   * @param {string} botUsername - Bot's Twitch username
   */
  async saveBotAuth(tokenData, twitchId, botUsername) {
    const { accessToken, refreshToken, scope } = tokenData;
    const scopeArray = Array.isArray(scope) ? scope : (scope ? scope.split(' ') : []);

    // Save to database with Twitch ID
    authRepo.saveBotAuthWithTwitchId(twitchId, botUsername, accessToken, refreshToken, scopeArray.join(' '));

    // Add to auth provider
    this.authProvider.addUser(twitchId, {
      accessToken,
      refreshToken,
      scope: scopeArray,
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['chat']);

    this.botTwitchId = twitchId;
    this.botUsername = botUsername;

    logger.info(`Bot auth saved for ${botUsername} (Twitch ID: ${twitchId})`);
  }

  /**
   * Add channel authentication
   * @param {number} channelId - Channel database ID
   * @param {string} twitchId - Channel's Twitch user ID
   * @param {Object} tokenData - Token data
   */
  async addChannelAuth(channelId, twitchId, tokenData) {
    const { accessToken, refreshToken, scopes, expiresIn } = tokenData;
    const scopeArray = Array.isArray(scopes) ? scopes : (scopes ? scopes.split(' ') : []);

    // Save to database with Twitch ID
    authRepo.saveChannelAuth(channelId, twitchId, {
      accessToken,
      refreshToken,
      scopes: scopeArray.join(' '),
      expiresAt: expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null
    });

    // Add to auth provider
    this.authProvider.addUser(twitchId, {
      accessToken,
      refreshToken,
      scope: scopeArray,
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['channel']);

    this.channelTwitchIds.add(twitchId);

    logger.info(`Channel auth added for channel ${channelId} (Twitch ID: ${twitchId})`);
  }

  /**
   * Remove channel authentication
   * @param {number} channelId - Channel database ID
   */
  removeChannelAuth(channelId) {
    const twitchId = authRepo.getChannelTwitchId(channelId);
    authRepo.deleteChannelAuth(channelId);

    if (twitchId) {
      this.channelTwitchIds.delete(twitchId);
    }

    logger.info(`Removed auth for channel ${channelId}`);
  }

  /**
   * Get OAuth authorization URL for bot
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} Authorization URL
   */
  getBotAuthUrl(state) {
    const scopes = config.twitch.botScopes.join(' ');

    return `https://id.twitch.tv/oauth2/authorize?` +
      `client_id=${config.twitch.clientId}` +
      `&redirect_uri=${encodeURIComponent(config.twitch.callbackUrl)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${state}`;
  }

  /**
   * Get OAuth authorization URL for channel
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} Authorization URL
   */
  getChannelAuthUrl(state) {
    const scopes = config.twitch.channelScopes.join(' ');

    return `https://id.twitch.tv/oauth2/authorize?` +
      `client_id=${config.twitch.clientId}` +
      `&redirect_uri=${encodeURIComponent(config.twitch.callbackUrl)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${state}`;
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code
   * @param {string} redirectUri - Redirect URI used in auth request
   * @returns {Object} Token data
   */
  async exchangeCode(code, redirectUri) {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: config.twitch.clientId,
        client_secret: config.twitch.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope
    };
  }

  /**
   * Validate an access token
   * @param {string} accessToken - Token to validate
   * @returns {Object|null} Token info or null if invalid
   */
  async validateToken(accessToken) {
    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: {
        'Authorization': `OAuth ${accessToken}`
      }
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  /**
   * Get user info from access token
   * @param {string} accessToken - Access token
   * @returns {Object|null} User info or null
   */
  async getUserInfo(accessToken) {
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': config.twitch.clientId
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data[0] || null;
  }
}

// Export singleton instance
module.exports = new AuthManager();
