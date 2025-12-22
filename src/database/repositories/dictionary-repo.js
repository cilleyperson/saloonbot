const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('dictionary-repo');

/**
 * Find custom definition by word for a channel
 * @param {number} channelId - Channel ID
 * @param {string} word - Word to look up
 * @returns {Object|null} Definition or null
 */
function findByWord(channelId, word) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM custom_definitions
    WHERE channel_id = ? AND word = ?
  `).get(channelId, word.toLowerCase());
}

/**
 * Get all custom definitions for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object[]} Array of definitions
 */
function findByChannel(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM custom_definitions
    WHERE channel_id = ?
    ORDER BY word
  `).all(channelId);
}

/**
 * Find definition by ID
 * @param {number} id - Definition ID
 * @returns {Object|null} Definition or null
 */
function findById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM custom_definitions WHERE id = ?').get(id);
}

/**
 * Create a new custom definition
 * @param {number} channelId - Channel ID
 * @param {string} word - Word to define
 * @param {string} definition - The definition
 * @param {string} partOfSpeech - Part of speech (optional)
 * @returns {Object} Created definition
 */
function create(channelId, word, definition, partOfSpeech = null) {
  const db = getDb();

  // Check if word already exists
  if (exists(channelId, word)) {
    throw new Error(`Definition for "${word}" already exists`);
  }

  const result = db.prepare(`
    INSERT INTO custom_definitions (channel_id, word, definition, part_of_speech)
    VALUES (?, ?, ?, ?)
  `).run(channelId, word.toLowerCase(), definition, partOfSpeech);

  logger.info(`Created custom definition for "${word}" in channel ${channelId}`);
  return findById(result.lastInsertRowid);
}

/**
 * Update a definition
 * @param {number} id - Definition ID
 * @param {Object} data - Data to update
 * @returns {Object|null} Updated definition or null
 */
function update(id, data) {
  const db = getDb();

  const allowedFields = ['word', 'definition', 'part_of_speech'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (key === 'word') {
        updates.push(`${key} = ?`);
        values.push(value.toLowerCase());
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  if (updates.length === 0) return findById(id);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const sql = `UPDATE custom_definitions SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated custom definition ${id}`, { data });
  return findById(id);
}

/**
 * Delete a definition
 * @param {number} id - Definition ID
 * @returns {boolean} Success
 */
function remove(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM custom_definitions WHERE id = ?').run(id);
  logger.info(`Deleted custom definition ${id}`);
  return result.changes > 0;
}

/**
 * Check if a custom definition exists
 * @param {number} channelId - Channel ID
 * @param {string} word - Word to check
 * @returns {boolean}
 */
function exists(channelId, word) {
  return findByWord(channelId, word) != null;
}

/**
 * Get count of custom definitions for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Count
 */
function count(channelId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM custom_definitions WHERE channel_id = ?').get(channelId).count;
}

module.exports = {
  findByWord,
  findByChannel,
  findById,
  create,
  update,
  remove,
  exists,
  count
};
