const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('magic-8ball-repo');

/**
 * Valid response types
 */
const RESPONSE_TYPES = ['positive', 'neutral', 'negative'];

/**
 * Get all Magic 8 Ball responses
 * @param {boolean} activeOnly - Only return active responses
 * @returns {Object[]} Array of responses
 */
function findAll(activeOnly = false) {
  const db = getDb();
  let sql = 'SELECT * FROM magic_8ball_responses';
  if (activeOnly) {
    sql += ' WHERE is_active = 1';
  }
  sql += ' ORDER BY response_type, response_text';

  const responses = db.prepare(sql).all();
  return responses.map(r => ({
    ...r,
    is_active: Boolean(r.is_active)
  }));
}

/**
 * Find response by ID
 * @param {number} id - Response ID
 * @returns {Object|null} Response or null
 */
function findById(id) {
  const db = getDb();
  const response = db.prepare('SELECT * FROM magic_8ball_responses WHERE id = ?').get(id);
  if (response) {
    response.is_active = Boolean(response.is_active);
  }
  return response;
}

/**
 * Get a random active response
 * @returns {Object|null} Random response or null if none available
 */
function getRandomResponse() {
  const db = getDb();
  const response = db.prepare(`
    SELECT * FROM magic_8ball_responses
    WHERE is_active = 1
    ORDER BY RANDOM()
    LIMIT 1
  `).get();

  if (response) {
    response.is_active = Boolean(response.is_active);
  }
  return response;
}

/**
 * Create a new response
 * @param {string} responseText - The response text
 * @param {string} responseType - Response type (positive, neutral, negative)
 * @returns {Object} Created response
 */
function create(responseText, responseType = 'neutral') {
  if (!RESPONSE_TYPES.includes(responseType)) {
    throw new Error(`Invalid response type: ${responseType}`);
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO magic_8ball_responses (response_text, response_type, is_active)
    VALUES (?, ?, 1)
  `).run(responseText, responseType);

  logger.info(`Created Magic 8 Ball response: "${responseText}"`);
  return findById(result.lastInsertRowid);
}

/**
 * Update a response
 * @param {number} id - Response ID
 * @param {Object} data - Data to update
 * @returns {Object|null} Updated response or null
 */
function update(id, data) {
  const db = getDb();

  const allowedFields = ['response_text', 'response_type', 'is_active'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (key === 'response_type' && !RESPONSE_TYPES.includes(value)) {
        throw new Error(`Invalid response type: ${value}`);
      }
      if (key === 'is_active') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  if (updates.length === 0) return findById(id);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const sql = `UPDATE magic_8ball_responses SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated Magic 8 Ball response ${id}`, { data });
  return findById(id);
}

/**
 * Toggle active status
 * @param {number} id - Response ID
 * @returns {Object|null} Updated response or null
 */
function toggleActive(id) {
  const db = getDb();
  db.prepare(`
    UPDATE magic_8ball_responses
    SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const response = findById(id);
  if (response) {
    logger.debug(`Toggled Magic 8 Ball response ${id} to ${response.is_active ? 'active' : 'inactive'}`);
  }
  return response;
}

/**
 * Delete a response
 * @param {number} id - Response ID
 * @returns {boolean} Success
 */
function remove(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM magic_8ball_responses WHERE id = ?').run(id);
  logger.info(`Deleted Magic 8 Ball response ${id}`);
  return result.changes > 0;
}

/**
 * Get count of responses
 * @param {boolean} activeOnly - Only count active responses
 * @returns {number} Count
 */
function count(activeOnly = false) {
  const db = getDb();
  let sql = 'SELECT COUNT(*) as count FROM magic_8ball_responses';
  if (activeOnly) {
    sql += ' WHERE is_active = 1';
  }
  return db.prepare(sql).get().count;
}

/**
 * Get counts by response type
 * @returns {Object} Counts by type
 */
function countByType() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT response_type, COUNT(*) as count
    FROM magic_8ball_responses
    WHERE is_active = 1
    GROUP BY response_type
  `).all();

  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const row of rows) {
    counts[row.response_type] = row.count;
  }
  return counts;
}

module.exports = {
  RESPONSE_TYPES,
  findAll,
  findById,
  getRandomResponse,
  create,
  update,
  toggleActive,
  remove,
  count,
  countByType
};
