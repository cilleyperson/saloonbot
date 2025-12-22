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
 * Save channel auth tokens
 * @param {number} channelId - Channel ID
 * @param {Object} tokens - Token data
 * @returns {Object} Saved auth record
 */
function saveChannelAuth(channelId, tokens) {
  const db = getDb();
  const { accessToken, refreshToken, scopes, expiresAt } = tokens;

  const scopesStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);

  const stmt = db.prepare(`
    INSERT INTO channel_auth (channel_id, access_token, refresh_token, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scopes = excluded.scopes,
      expires_at = excluded.expires_at,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(channelId, encryptedAccessToken, encryptedRefreshToken, scopesStr, expiresAt || null);
  logger.info(`Saved channel auth for channel ${channelId}`);

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
  // Bot auth
  saveBotAuth,
  getBotAuth,
  updateBotAuth,
  deleteBotAuth,
  isBotAuthenticated
};
