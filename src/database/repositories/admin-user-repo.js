const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/crypto');
const config = require('../../config');

const logger = createChildLogger('admin-user-repo');

/**
 * Create a new admin user
 * @param {string} username - Username for login
 * @param {string} passwordHash - Bcrypt password hash
 * @returns {Object} Created user
 */
function create(username, passwordHash) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO admin_users (username, password_hash)
    VALUES (?, ?)
  `);

  const result = stmt.run(username.toLowerCase(), passwordHash);
  logger.info(`Created admin user: ${username}`, { id: result.lastInsertRowid });

  return findById(result.lastInsertRowid);
}

/**
 * Find user by username
 * @param {string} username - Username
 * @returns {Object|null} User or null
 */
function findByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username.toLowerCase());
}

/**
 * Find user by ID
 * @param {number} id - User ID
 * @returns {Object|null} User or null
 */
function findById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
}

/**
 * Update last login timestamp to current time
 * @param {number} id - User ID
 * @returns {boolean} Success
 */
function updateLastLogin(id) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE admin_users
    SET last_login = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  logger.debug(`Updated last login for user ${id}`);
  return result.changes > 0;
}

/**
 * Increment failed login attempts by 1
 * @param {number} id - User ID
 * @returns {boolean} Success
 */
function incrementFailedAttempts(id) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE admin_users
    SET failed_attempts = failed_attempts + 1
    WHERE id = ?
  `).run(id);

  logger.debug(`Incremented failed attempts for user ${id}`);
  return result.changes > 0;
}

/**
 * Reset failed login attempts to 0
 * @param {number} id - User ID
 * @returns {boolean} Success
 */
function resetFailedAttempts(id) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE admin_users
    SET failed_attempts = 0
    WHERE id = ?
  `).run(id);

  logger.debug(`Reset failed attempts for user ${id}`);
  return result.changes > 0;
}

/**
 * Lock user account until specified time
 * @param {number} id - User ID
 * @param {Date} until - Lock until this date/time
 * @returns {boolean} Success
 */
function lockUser(id, until) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE admin_users
    SET locked_until = ?
    WHERE id = ?
  `).run(until.toISOString(), id);

  logger.info(`Locked user ${id} until ${until.toISOString()}`);
  return result.changes > 0;
}

/**
 * Check if a user is currently locked
 * @param {Object} user - User object with locked_until field
 * @returns {boolean} True if user is locked
 */
function isLocked(user) {
  if (!user || !user.locked_until) {
    return false;
  }

  const lockTime = new Date(user.locked_until);
  const now = new Date();

  return now < lockTime;
}

// ============================================
// Two-Factor Authentication (2FA) Methods
// ============================================

/**
 * Store TOTP secret for a user (encrypted)
 * This is called during 2FA setup before verification
 * @param {number} id - User ID
 * @param {string} secret - TOTP secret (base32 encoded)
 * @returns {boolean} Success
 */
function storeTotpSecret(id, secret) {
  const db = getDb();
  const encryptionKey = config.security?.tokenEncryptionKey;

  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required for 2FA');
  }

  const encryptedSecret = encrypt(secret, encryptionKey);

  const result = db.prepare(`
    UPDATE admin_users
    SET totp_secret = ?, totp_enabled = 0, totp_verified_at = NULL
    WHERE id = ?
  `).run(encryptedSecret, id);

  logger.info(`Stored TOTP secret for user ${id} (pending verification)`);
  return result.changes > 0;
}

/**
 * Get decrypted TOTP secret for a user
 * @param {number} id - User ID
 * @returns {string|null} Decrypted TOTP secret or null
 */
function getTotpSecret(id) {
  const db = getDb();
  const user = db.prepare('SELECT totp_secret FROM admin_users WHERE id = ?').get(id);

  if (!user || !user.totp_secret) {
    return null;
  }

  const encryptionKey = config.security?.tokenEncryptionKey;

  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required for 2FA');
  }

  try {
    return decrypt(user.totp_secret, encryptionKey);
  } catch (error) {
    logger.error(`Failed to decrypt TOTP secret for user ${id}`, { error: error.message });
    return null;
  }
}

/**
 * Enable 2FA after successful verification
 * @param {number} id - User ID
 * @returns {boolean} Success
 */
function enableTotp(id) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE admin_users
    SET totp_enabled = 1, totp_verified_at = CURRENT_TIMESTAMP
    WHERE id = ? AND totp_secret IS NOT NULL
  `).run(id);

  if (result.changes > 0) {
    logger.info(`2FA enabled for user ${id}`);
  }
  return result.changes > 0;
}

/**
 * Disable 2FA and clear TOTP secret
 * @param {number} id - User ID
 * @returns {boolean} Success
 */
function disableTotp(id) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE admin_users
    SET totp_enabled = 0, totp_secret = NULL, totp_verified_at = NULL, backup_codes = NULL
    WHERE id = ?
  `).run(id);

  if (result.changes > 0) {
    logger.info(`2FA disabled for user ${id}`);
  }
  return result.changes > 0;
}

/**
 * Check if user has 2FA enabled
 * @param {Object} user - User object
 * @returns {boolean} True if 2FA is enabled
 */
function hasTotpEnabled(user) {
  return !!(user && user.totp_enabled === 1 && user.totp_secret);
}

/**
 * Store backup codes (hashed) for a user
 * @param {number} id - User ID
 * @param {string[]} hashedCodes - Array of bcrypt-hashed backup codes
 * @returns {boolean} Success
 */
function storeBackupCodes(id, hashedCodes) {
  const db = getDb();
  const codesJson = JSON.stringify(hashedCodes);

  const result = db.prepare(`
    UPDATE admin_users
    SET backup_codes = ?
    WHERE id = ?
  `).run(codesJson, id);

  logger.info(`Stored ${hashedCodes.length} backup codes for user ${id}`);
  return result.changes > 0;
}

/**
 * Get backup codes (hashed) for a user
 * @param {number} id - User ID
 * @returns {string[]} Array of hashed backup codes
 */
function getBackupCodes(id) {
  const db = getDb();
  const user = db.prepare('SELECT backup_codes FROM admin_users WHERE id = ?').get(id);

  if (!user || !user.backup_codes) {
    return [];
  }

  try {
    return JSON.parse(user.backup_codes);
  } catch (error) {
    logger.error(`Failed to parse backup codes for user ${id}`, { error: error.message });
    return [];
  }
}

/**
 * Update backup codes (after one is used)
 * @param {number} id - User ID
 * @param {string[]} hashedCodes - Updated array of hashed backup codes
 * @returns {boolean} Success
 */
function updateBackupCodes(id, hashedCodes) {
  const db = getDb();
  const codesJson = JSON.stringify(hashedCodes);

  const result = db.prepare(`
    UPDATE admin_users
    SET backup_codes = ?
    WHERE id = ?
  `).run(codesJson, id);

  return result.changes > 0;
}

/**
 * Clear pending TOTP setup (if user cancels setup)
 * @param {number} id - User ID
 * @returns {boolean} Success
 */
function clearPendingTotp(id) {
  const db = getDb();

  // Only clear if not yet enabled
  const result = db.prepare(`
    UPDATE admin_users
    SET totp_secret = NULL
    WHERE id = ? AND totp_enabled = 0
  `).run(id);

  if (result.changes > 0) {
    logger.debug(`Cleared pending TOTP setup for user ${id}`);
  }
  return result.changes > 0;
}

module.exports = {
  create,
  findByUsername,
  findById,
  updateLastLogin,
  incrementFailedAttempts,
  resetFailedAttempts,
  lockUser,
  isLocked,
  // 2FA methods
  storeTotpSecret,
  getTotpSecret,
  enableTotp,
  disableTotp,
  hasTotpEnabled,
  storeBackupCodes,
  getBackupCodes,
  updateBackupCodes,
  clearPendingTotp
};
