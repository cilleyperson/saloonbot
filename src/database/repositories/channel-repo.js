const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('channel-repo');

/**
 * Create a new channel
 * @param {string} twitchId - Twitch user ID
 * @param {string} username - Twitch username
 * @param {string} displayName - Display name
 * @returns {Object} Created channel
 */
function create(twitchId, username, displayName = null) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO channels (twitch_id, twitch_username, display_name)
    VALUES (?, ?, ?)
  `);

  const result = stmt.run(twitchId, username.toLowerCase(), displayName || username);
  logger.info(`Created channel: ${username}`, { id: result.lastInsertRowid, twitchId });

  return findById(result.lastInsertRowid);
}

/**
 * Find channel by internal ID
 * @param {number} id - Internal channel ID
 * @returns {Object|null} Channel or null
 */
function findById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
}

/**
 * Find channel by Twitch ID
 * @param {string} twitchId - Twitch user ID
 * @returns {Object|null} Channel or null
 */
function findByTwitchId(twitchId) {
  const db = getDb();
  return db.prepare('SELECT * FROM channels WHERE twitch_id = ?').get(twitchId);
}

/**
 * Find channel by username
 * @param {string} username - Twitch username
 * @returns {Object|null} Channel or null
 */
function findByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM channels WHERE twitch_username = ?').get(username.toLowerCase());
}

/**
 * Find all active channels
 * @returns {Object[]} Array of active channels
 */
function findAllActive() {
  const db = getDb();
  return db.prepare('SELECT * FROM channels WHERE is_active = 1 ORDER BY twitch_username').all();
}

/**
 * Find all channels (including inactive)
 * @returns {Object[]} Array of all channels
 */
function findAll() {
  const db = getDb();
  return db.prepare('SELECT * FROM channels ORDER BY twitch_username').all();
}

/**
 * Update a channel
 * @param {number} id - Channel ID
 * @param {Object} data - Data to update
 * @returns {Object|null} Updated channel or null
 */
function update(id, data) {
  const db = getDb();
  const allowedFields = ['twitch_username', 'display_name', 'is_active'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return findById(id);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const sql = `UPDATE channels SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated channel ${id}`, { data });
  return findById(id);
}

/**
 * Deactivate a channel (soft delete)
 * @param {number} id - Channel ID
 * @returns {boolean} Success
 */
function deactivate(id) {
  const db = getDb();
  const result = db.prepare('UPDATE channels SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  logger.info(`Deactivated channel ${id}`);
  return result.changes > 0;
}

/**
 * Activate a channel
 * @param {number} id - Channel ID
 * @returns {boolean} Success
 */
function activate(id) {
  const db = getDb();
  const result = db.prepare('UPDATE channels SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  logger.info(`Activated channel ${id}`);
  return result.changes > 0;
}

/**
 * Delete a channel permanently
 * @param {number} id - Channel ID
 * @returns {boolean} Success
 */
function remove(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  logger.info(`Deleted channel ${id}`);
  return result.changes > 0;
}

/**
 * Get channel count
 * @param {boolean} activeOnly - Count only active channels
 * @returns {number} Channel count
 */
function count(activeOnly = true) {
  const db = getDb();
  const sql = activeOnly
    ? 'SELECT COUNT(*) as count FROM channels WHERE is_active = 1'
    : 'SELECT COUNT(*) as count FROM channels';
  return db.prepare(sql).get().count;
}

module.exports = {
  create,
  findById,
  findByTwitchId,
  findByUsername,
  findAllActive,
  findAll,
  update,
  deactivate,
  activate,
  remove,
  count
};
