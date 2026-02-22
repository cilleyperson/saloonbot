const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');
const { encrypt, decrypt, isEncrypted } = require('../../utils/crypto');
const config = require('../../config/index');

const logger = createChildLogger('auth-repo');

// ==================== Token Encryption Helpers ====================

/**
 * Encrypt a token if encryption key is available
 * @param {string} token - Token to encrypt
 * @returns {string} Encrypted token or original if no key
 */
function encryptToken(token) {
  if (!token) return token;

  const encryptionKey = config.security?.tokenEncryptionKey;
  if (!encryptionKey) {
    // No encryption key configured - return token as-is
    logger.debug('No encryption key configured, storing token in plaintext');
    return token;
  }

  try {
    return encrypt(token, encryptionKey);
  } catch (error) {
    logger.error('Failed to encrypt token:', error);
    throw new Error('Token encryption failed');
  }
}

/**
 * Decrypt a token if it's encrypted, otherwise return as-is
 * @param {string} token - Token to decrypt
 * @returns {string} Decrypted token or original
 */
function decryptToken(token) {
  if (!token) return token;

  const encryptionKey = config.security?.tokenEncryptionKey;
  if (!encryptionKey) {
    // No encryption key configured - return token as-is
    return token;
  }

  // Check if token is encrypted
  if (!isEncrypted(token)) {
    // Legacy unencrypted token - return as-is for backward compatibility
    logger.debug('Found unencrypted token (legacy data)');
    return token;
  }

  try {
    return decrypt(token, encryptionKey);
  } catch (error) {
    logger.error('Failed to decrypt token:', error);
    throw new Error('Token decryption failed');
  }
}

// ==================== Channel Auth ====================

/**
 * Save channel auth tokens with Twitch user ID
 * @param {number} channelId - Channel ID
 * @param {string} twitchUserId - Twitch user ID for token lookup
 * @param {Object} tokens - Token data
 * @returns {Object} Saved auth record
 */
function saveChannelAuth(channelId, twitchUserId, tokens) {
  const db = getDb();
  const { accessToken, refreshToken, scopes, expiresAt } = tokens;

  const scopesStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);

  const stmt = db.prepare(`
    INSERT INTO channel_auth (channel_id, twitch_user_id, access_token, refresh_token, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      twitch_user_id = excluded.twitch_user_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scopes = excluded.scopes,
      expires_at = excluded.expires_at,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(channelId, twitchUserId, encryptedAccessToken, encryptedRefreshToken, scopesStr, expiresAt || null);
  logger.info(`Saved channel auth for channel ${channelId} (Twitch ID: ${twitchUserId})`);

  return getChannelAuth(channelId);
}

/**
 * Get channel auth tokens
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Auth tokens or null
 */
function getChannelAuth(channelId) {
  const db = getDb();
  const auth = db.prepare('SELECT * FROM channel_auth WHERE channel_id = ?').get(channelId);

  if (auth) {
    // Decrypt tokens
    auth.access_token = decryptToken(auth.access_token);
    auth.refresh_token = decryptToken(auth.refresh_token);
    auth.scopes = auth.scopes ? auth.scopes.split(' ') : [];
  }

  return auth;
}

/**
 * Update channel auth tokens
 * @param {number} channelId - Channel ID
 * @param {Object} tokens - Token data to update
 * @returns {Object|null} Updated auth or null
 */
function updateChannelAuth(channelId, tokens) {
  const db = getDb();
  const { accessToken, refreshToken, expiresAt } = tokens;

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);

  const stmt = db.prepare(`
    UPDATE channel_auth
    SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE channel_id = ?
  `);

  stmt.run(encryptedAccessToken, encryptedRefreshToken, expiresAt || null, channelId);
  logger.debug(`Updated channel auth for channel ${channelId}`);

  return getChannelAuth(channelId);
}

/**
 * Delete channel auth
 * @param {number} channelId - Channel ID
 * @returns {boolean} Success
 */
function deleteChannelAuth(channelId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM channel_auth WHERE channel_id = ?').run(channelId);
  logger.info(`Deleted channel auth for channel ${channelId}`);
  return result.changes > 0;
}

/**
 * Get all channel auths with channel info
 * @returns {Object[]} Array of auth records with channel info
 */
function getAllChannelAuths() {
  const db = getDb();
  const auths = db.prepare(`
    SELECT ca.*, c.twitch_id, c.twitch_username, c.display_name, c.is_active
    FROM channel_auth ca
    JOIN channels c ON ca.channel_id = c.id
    WHERE c.is_active = 1
  `).all();

  return auths.map(auth => ({
    ...auth,
    // Decrypt tokens
    access_token: decryptToken(auth.access_token),
    refresh_token: decryptToken(auth.refresh_token),
    scopes: auth.scopes ? auth.scopes.split(' ') : []
  }));
}

/**
 * Get all channel auths with Twitch user IDs (for multi-user auth provider)
 * Falls back to channel's twitch_id if twitch_user_id is not set
 * @returns {Object[]} Array of auth records with Twitch user IDs
 */
function getAllChannelAuthsWithTwitchId() {
  const db = getDb();
  const auths = db.prepare(`
    SELECT
      ca.channel_id,
      ca.twitch_user_id,
      ca.access_token,
      ca.refresh_token,
      ca.scopes,
      ca.expires_at,
      ca.updated_at,
      c.twitch_id as channel_twitch_id
    FROM channel_auth ca
    LEFT JOIN channels c ON c.id = ca.channel_id
    WHERE c.is_active = 1
  `).all();

  return auths.map(auth => ({
    ...auth,
    // Decrypt tokens
    access_token: decryptToken(auth.access_token),
    refresh_token: decryptToken(auth.refresh_token)
  }));
}

/**
 * Get Twitch user ID for a channel auth
 * @param {number} channelId - Channel ID
 * @returns {string|null} Twitch user ID or null
 */
function getChannelTwitchId(channelId) {
  const db = getDb();
  const row = db.prepare('SELECT twitch_user_id FROM channel_auth WHERE channel_id = ?').get(channelId);
  return row?.twitch_user_id || null;
}

/**
 * Update Twitch user ID for a channel auth
 * @param {number} channelId - Channel ID
 * @param {string} twitchUserId - Twitch user ID
 */
function updateChannelTwitchId(channelId, twitchUserId) {
  const db = getDb();
  db.prepare(`
    UPDATE channel_auth SET twitch_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?
  `).run(twitchUserId, channelId);
  logger.debug(`Updated Twitch user ID for channel ${channelId} to ${twitchUserId}`);
}

/**
 * Update channel auth tokens by Twitch user ID
 * @param {string} twitchUserId - Twitch user ID
 * @param {Object} tokens - Token data to update
 * @returns {boolean} Whether any rows were updated
 */
function updateChannelAuthByTwitchId(twitchUserId, tokens) {
  const db = getDb();
  const { accessToken, refreshToken, expiresAt } = tokens;

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);

  const result = db.prepare(`
    UPDATE channel_auth
    SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE twitch_user_id = ?
  `).run(encryptedAccessToken, encryptedRefreshToken, expiresAt || null, twitchUserId);

  logger.debug(`Updated channel auth for Twitch user ${twitchUserId}`);
  return result.changes > 0;
}

// ==================== Bot Auth ====================

/**
 * Save bot auth tokens
 * @param {Object} tokens - Token data
 * @returns {Object} Saved auth record
 */
function saveBotAuth(tokens) {
  const db = getDb();
  const { botUsername, accessToken, refreshToken, scopes, expiresAt } = tokens;

  const scopesStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);

  // Delete existing bot auth and insert new
  db.prepare('DELETE FROM bot_auth').run();

  const stmt = db.prepare(`
    INSERT INTO bot_auth (bot_username, access_token, refresh_token, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(botUsername, encryptedAccessToken, encryptedRefreshToken, scopesStr, expiresAt || null);
  logger.info(`Saved bot auth for ${botUsername}`);

  return getBotAuth();
}

/**
 * Save bot auth tokens with Twitch user ID
 * @param {string} twitchUserId - Twitch user ID
 * @param {string} botUsername - Bot username
 * @param {string} accessToken - Access token
 * @param {string} refreshToken - Refresh token
 * @param {string} scopes - Space-separated scopes
 * @returns {Object} Saved auth record
 */
function saveBotAuthWithTwitchId(twitchUserId, botUsername, accessToken, refreshToken, scopes) {
  const db = getDb();

  const scopesStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);

  // Delete existing bot auth and insert new
  db.prepare('DELETE FROM bot_auth').run();

  const stmt = db.prepare(`
    INSERT INTO bot_auth (twitch_user_id, bot_username, access_token, refresh_token, scopes)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(twitchUserId, botUsername, encryptedAccessToken, encryptedRefreshToken, scopesStr);
  logger.info(`Saved bot auth for ${botUsername} (Twitch ID: ${twitchUserId})`);

  return getBotAuthWithTwitchId();
}

/**
 * Get bot auth with Twitch user ID
 * @returns {Object|null} Bot auth with Twitch ID or null
 */
function getBotAuthWithTwitchId() {
  const db = getDb();
  const auth = db.prepare(`
    SELECT twitch_user_id, bot_username, access_token, refresh_token, scopes, expires_at, updated_at
    FROM bot_auth ORDER BY id DESC LIMIT 1
  `).get();

  if (auth) {
    // Decrypt tokens
    auth.access_token = decryptToken(auth.access_token);
    auth.refresh_token = decryptToken(auth.refresh_token);
    auth.scopes = auth.scopes ? auth.scopes.split(' ') : [];
  }

  return auth;
}

/**
 * Get bot auth tokens
 * @returns {Object|null} Bot auth tokens or null
 */
function getBotAuth() {
  const db = getDb();
  const auth = db.prepare('SELECT * FROM bot_auth ORDER BY id DESC LIMIT 1').get();

  if (auth) {
    // Decrypt tokens
    auth.access_token = decryptToken(auth.access_token);
    auth.refresh_token = decryptToken(auth.refresh_token);
    auth.scopes = auth.scopes ? auth.scopes.split(' ') : [];
  }

  return auth;
}

/**
 * Update bot auth tokens
 * @param {Object} tokens - Token data to update
 * @returns {Object|null} Updated auth or null
 */
function updateBotAuth(tokens) {
  const db = getDb();
  const { accessToken, refreshToken, expiresAt } = tokens;

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);

  const stmt = db.prepare(`
    UPDATE bot_auth
    SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM bot_auth ORDER BY id DESC LIMIT 1)
  `);

  stmt.run(encryptedAccessToken, encryptedRefreshToken, expiresAt || null);
  logger.debug('Updated bot auth tokens');

  return getBotAuth();
}

/**
 * Delete bot auth
 * @returns {boolean} Success
 */
function deleteBotAuth() {
  const db = getDb();
  const result = db.prepare('DELETE FROM bot_auth').run();
  logger.info('Deleted bot auth');
  return result.changes > 0;
}

/**
 * Check if bot is authenticated
 * @returns {boolean}
 */
function isBotAuthenticated() {
  return getBotAuth() !== null;
}

module.exports = {
  // Channel auth
  saveChannelAuth,
  getChannelAuth,
  updateChannelAuth,
  deleteChannelAuth,
  getAllChannelAuths,
  // Channel auth - Twitch ID support
  getAllChannelAuthsWithTwitchId,
  getChannelTwitchId,
  updateChannelTwitchId,
  updateChannelAuthByTwitchId,
  // Bot auth
  saveBotAuth,
  getBotAuth,
  updateBotAuth,
  deleteBotAuth,
  isBotAuthenticated,
  // Bot auth - Twitch ID support
  saveBotAuthWithTwitchId,
  getBotAuthWithTwitchId
};
