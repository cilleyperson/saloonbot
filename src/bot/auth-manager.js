const { RefreshingAuthProvider } = require('@twurple/auth');
const config = require('../config');
const authRepo = require('../database/repositories/auth-repo');
const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('auth-manager');

/**
 * Manages authentication for the bot and multiple channels
 */
class AuthManager {
  constructor() {
    this.botAuthProvider = null;
    this.channelAuthProviders = new Map(); // channelId -> AuthProvider
    this.initialized = false;
  }

  /**
   * Initialize the auth manager
   * Loads existing tokens from database
   */
  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing auth manager');

    // Try to load bot auth
    await this.loadBotAuth();

    // Load all channel auths
    await this.loadAllChannelAuths();

    this.initialized = true;
    logger.info('Auth manager initialized');
  }

  /**
   * Load bot authentication from database
   */
  async loadBotAuth() {
    const botAuth = authRepo.getBotAuth();

    if (!botAuth) {
      logger.warn('No bot authentication found. Please authenticate the bot via /auth/bot');
      return false;
    }

    try {
      this.botAuthProvider = this.createAuthProvider(
        botAuth.access_token,
        botAuth.refresh_token,
        botAuth.scopes,
        async (userId, newTokenData) => {
          await this.onBotTokenRefresh(newTokenData);
        }
      );

      logger.info(`Bot auth loaded for: ${botAuth.bot_username}`);
      return true;
    } catch (error) {
      logger.error('Failed to load bot auth', { error: error.message });
      return false;
    }
  }

  /**
   * Load all channel authentications from database
   * Adds channel tokens to the bot's auth provider for EventSub support
   */
  async loadAllChannelAuths() {
    const channelAuths = authRepo.getAllChannelAuths();

    for (const auth of channelAuths) {
      try {
        await this.addChannelAuth(auth.channel_id, {
          accessToken: auth.access_token,
          refreshToken: auth.refresh_token,
          scopes: auth.scopes,
          twitchId: auth.twitch_id // Include Twitch ID for proper registration
        }, false); // Don't save to DB since we're loading from it
      } catch (error) {
        logger.error(`Failed to load auth for channel ${auth.channel_id}`, { error: error.message });
      }
    }

    logger.info(`Loaded ${this.channelAuthProviders.size} channel auth providers`);
  }

  /**
   * Create a RefreshingAuthProvider
   * @param {string} accessToken - Access token
   * @param {string} refreshToken - Refresh token
   * @param {string[]} scopes - Token scopes
   * @param {Function} onRefresh - Callback when token is refreshed
   * @returns {RefreshingAuthProvider}
   */
  createAuthProvider(accessToken, refreshToken, scopes, onRefresh) {
    const authProvider = new RefreshingAuthProvider({
      clientId: config.twitch.clientId,
      clientSecret: config.twitch.clientSecret
    });

    authProvider.onRefresh(onRefresh);

    // Add the user with initial token data
    authProvider.addUser('', {
      accessToken,
      refreshToken,
      scope: Array.isArray(scopes) ? scopes : scopes.split(' '),
      expiresIn: 0, // Will trigger refresh check
      obtainmentTimestamp: Date.now()
    }, ['chat']);

    return authProvider;
  }

  /**
   * Handle bot token refresh
   * @param {Object} newTokenData - New token data
   */
  async onBotTokenRefresh(newTokenData) {
    logger.debug('Bot token refreshed');

    authRepo.updateBotAuth({
      accessToken: newTokenData.accessToken,
      refreshToken: newTokenData.refreshToken,
      expiresAt: newTokenData.expiresIn
        ? new Date(Date.now() + newTokenData.expiresIn * 1000).toISOString()
        : null
    });
  }

  /**
   * Handle channel token refresh
   * @param {number} channelId - Channel ID
   * @param {Object} newTokenData - New token data
   */
  async onChannelTokenRefresh(channelId, newTokenData) {
    logger.debug(`Channel ${channelId} token refreshed`);

    authRepo.updateChannelAuth(channelId, {
      accessToken: newTokenData.accessToken,
      refreshToken: newTokenData.refreshToken,
      expiresAt: newTokenData.expiresIn
        ? new Date(Date.now() + newTokenData.expiresIn * 1000).toISOString()
        : null
    });
  }

  /**
   * Save bot authentication
   * @param {Object} tokenData - Token data from OAuth
   * @param {string} botUsername - Bot username
   */
  async saveBotAuth(tokenData, botUsername) {
    const { accessToken, refreshToken, scope } = tokenData;

    authRepo.saveBotAuth({
      botUsername,
      accessToken,
      refreshToken,
      scopes: scope,
      expiresAt: tokenData.expiresIn
        ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
        : null
    });

    // Create auth provider
    this.botAuthProvider = this.createAuthProvider(
      accessToken,
      refreshToken,
      scope,
      async (userId, newTokenData) => {
        await this.onBotTokenRefresh(newTokenData);
      }
    );

    logger.info(`Bot auth saved for: ${botUsername}`);
  }

  /**
   * Add channel authentication
   * @param {number} channelId - Channel ID
   * @param {Object} tokenData - Token data
   * @param {boolean} saveToDb - Whether to save to database
   */
  async addChannelAuth(channelId, tokenData, saveToDb = true) {
    const { accessToken, refreshToken, scopes, twitchId } = tokenData;

    if (saveToDb) {
      authRepo.saveChannelAuth(channelId, {
        accessToken,
        refreshToken,
        scopes: Array.isArray(scopes) ? scopes.join(' ') : scopes,
        expiresAt: tokenData.expiresIn
          ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
          : null
      });
    }

    // Create auth provider for this channel
    const authProvider = this.createAuthProvider(
      accessToken,
      refreshToken,
      scopes,
      async (userId, newTokenData) => {
        await this.onChannelTokenRefresh(channelId, newTokenData);
      }
    );

    this.channelAuthProviders.set(channelId, authProvider);

    // Also add the channel's token to the bot's auth provider for EventSub
    // EventSub subscriptions require the broadcaster's token to be accessible
    // Note: We don't specify 'chat' intent because channel tokens don't have chat scopes
    // The bot's own token is used for chat operations
    if (this.botAuthProvider && twitchId) {
      try {
        this.botAuthProvider.addUser(twitchId, {
          accessToken,
          refreshToken,
          scope: Array.isArray(scopes) ? scopes : scopes.split(' '),
          expiresIn: 0,
          obtainmentTimestamp: Date.now()
        }); // No intents specified - token used only for API calls (EventSub)

        logger.debug(`Added channel ${channelId} token to bot auth provider for EventSub (twitchId: ${twitchId})`);
      } catch (error) {
        logger.warn(`Failed to add channel ${channelId} to bot auth provider`, { error: error.message });
      }
    }

    logger.info(`Added auth for channel ${channelId}`);
  }

  /**
   * Remove channel authentication
   * @param {number} channelId - Channel ID
   * @param {string} twitchId - Twitch user ID (optional, for cleanup)
   */
  removeChannelAuth(channelId, twitchId = null) {
    authRepo.deleteChannelAuth(channelId);
    this.channelAuthProviders.delete(channelId);

    // Also remove from bot's auth provider if we have the twitch ID
    if (this.botAuthProvider && twitchId) {
      try {
        this.botAuthProvider.removeUser(twitchId);
        logger.debug(`Removed channel ${channelId} from bot auth provider`);
      } catch (error) {
        // Ignore errors - user might not be in the provider
      }
    }

    logger.info(`Removed auth for channel ${channelId}`);
  }

  /**
   * Get bot auth provider
   * @returns {RefreshingAuthProvider|null}
   */
  getBotAuthProvider() {
    return this.botAuthProvider;
  }

  /**
   * Get channel auth provider
   * @param {number} channelId - Channel ID
   * @returns {RefreshingAuthProvider|null}
   */
  getChannelAuthProvider(channelId) {
    return this.channelAuthProviders.get(channelId) || null;
  }

  /**
   * Check if bot is authenticated
   * @returns {boolean}
   */
  isBotAuthenticated() {
    return this.botAuthProvider !== null;
  }

  /**
   * Check if channel is authenticated
   * @param {number} channelId - Channel ID
   * @returns {boolean}
   */
  isChannelAuthenticated(channelId) {
    return this.channelAuthProviders.has(channelId);
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
