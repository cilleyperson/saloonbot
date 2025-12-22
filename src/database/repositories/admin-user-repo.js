const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

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

module.exports = {
  create,
  findByUsername,
  findById,
  updateLastLogin,
  incrementFailedAttempts,
  resetFailedAttempts,
  lockUser,
  isLocked
};
