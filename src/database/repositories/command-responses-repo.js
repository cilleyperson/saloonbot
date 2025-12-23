const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('command-responses-repo');

/**
 * Find all responses for a command
 * @param {number} commandId - Command ID
 * @param {boolean} enabledOnly - Only return enabled responses
 * @returns {Object[]} Array of responses
 */
function findByCommand(commandId, enabledOnly = false) {
  const db = getDb();
  let sql = 'SELECT * FROM command_responses WHERE command_id = ?';
  if (enabledOnly) {
    sql += ' AND is_enabled = 1';
  }
  sql += ' ORDER BY id';

  const responses = db.prepare(sql).all(commandId);
  return responses.map(r => ({
    ...r,
    is_enabled: Boolean(r.is_enabled)
  }));
}

/**
 * Find response by ID
 * @param {number} id - Response ID
 * @returns {Object|null} Response or null
 */
function findById(id) {
  const db = getDb();
  const response = db.prepare('SELECT * FROM command_responses WHERE id = ?').get(id);
  if (response) {
    response.is_enabled = Boolean(response.is_enabled);
  }
  return response;
}

/**
 * Create a new response for a command
 * @param {number} commandId - Command ID
 * @param {string} responseText - Response text
 * @param {Object} options - Additional options
 * @returns {Object} Created response
 */
function create(commandId, responseText, options = {}) {
  const db = getDb();

  const {
    weight = 1,
    isEnabled = true
  } = options;

  const result = db.prepare(`
    INSERT INTO command_responses (command_id, response_text, weight, is_enabled)
    VALUES (?, ?, ?, ?)
  `).run(commandId, responseText, weight, isEnabled ? 1 : 0);

  logger.info(`Created response for command ${commandId}`);
  return findById(result.lastInsertRowid);
}

/**
 * Create multiple responses for a command in a single transaction
 * @param {number} commandId - Command ID
 * @param {string[]} responsesText - Array of response texts
 * @param {Object} options - Additional options
 * @returns {number} Number of responses created
 */
function createBulk(commandId, responsesText, options = {}) {
  const db = getDb();

  const {
    weight = 1,
    isEnabled = true
  } = options;

  const insertStmt = db.prepare(`
    INSERT INTO command_responses (command_id, response_text, weight, is_enabled)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((responses) => {
    let count = 0;
    for (const responseText of responses) {
      if (responseText && responseText.trim().length > 0) {
        insertStmt.run(commandId, responseText.trim(), weight, isEnabled ? 1 : 0);
        count++;
      }
    }
    return count;
  });

  const insertedCount = insertMany(responsesText);
  logger.info(`Bulk created ${insertedCount} responses for command ${commandId}`);
  return insertedCount;
}

/**
 * Update a response
 * @param {number} id - Response ID
 * @param {Object} data - Data to update
 * @returns {Object|null} Updated response or null
 */
function update(id, data) {
  const db = getDb();

  const allowedFields = ['response_text', 'weight', 'is_enabled'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (key === 'is_enabled') {
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

  const sql = `UPDATE command_responses SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated response ${id}`, { data });
  return findById(id);
}

/**
 * Toggle response enabled status
 * @param {number} id - Response ID
 * @returns {Object|null} Updated response or null
 */
function toggleEnabled(id) {
  const db = getDb();
  db.prepare(`
    UPDATE command_responses
    SET is_enabled = NOT is_enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const response = findById(id);
  if (response) {
    logger.debug(`Toggled response ${id} to ${response.is_enabled ? 'enabled' : 'disabled'}`);
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
  const result = db.prepare('DELETE FROM command_responses WHERE id = ?').run(id);
  logger.info(`Deleted response ${id}`);
  return result.changes > 0;
}

/**
 * Get count of responses for a command
 * @param {number} commandId - Command ID
 * @returns {number} Response count
 */
function count(commandId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM command_responses WHERE command_id = ?').get(commandId).count;
}

/**
 * Get a random enabled response for a command
 * Uses weighted random selection if weights differ
 * @param {number} commandId - Command ID
 * @returns {Object|null} Random response or null
 */
function getRandomResponse(commandId) {
  const responses = findByCommand(commandId, true);

  if (responses.length === 0) {
    return null;
  }

  // Calculate total weight
  const totalWeight = responses.reduce((sum, r) => sum + r.weight, 0);

  // Pick a random weight
  let random = Math.random() * totalWeight;

  // Find the response that matches the random weight
  for (const response of responses) {
    random -= response.weight;
    if (random <= 0) {
      return response;
    }
  }

  // Fallback to last response (shouldn't happen)
  return responses[responses.length - 1];
}

/**
 * Get paginated responses for a command
 * @param {number} commandId - Command ID
 * @param {number} page - Page number (1-indexed)
 * @param {number} perPage - Items per page
 * @returns {Object} Paginated result with items, total, pages, page
 */
function findByCommandPaginated(commandId, page = 1, perPage = 10) {
  const db = getDb();

  const total = count(commandId);
  const totalPages = Math.ceil(total / perPage);
  const offset = (page - 1) * perPage;

  const responses = db.prepare(`
    SELECT * FROM command_responses
    WHERE command_id = ?
    ORDER BY id
    LIMIT ? OFFSET ?
  `).all(commandId, perPage, offset);

  return {
    items: responses.map(r => ({
      ...r,
      is_enabled: Boolean(r.is_enabled)
    })),
    total,
    pages: totalPages,
    page,
    perPage
  };
}

/**
 * Delete all responses for a command
 * @param {number} commandId - Command ID
 * @returns {number} Number of deleted responses
 */
function removeByCommand(commandId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM command_responses WHERE command_id = ?').run(commandId);
  logger.info(`Deleted all responses for command ${commandId}`);
  return result.changes;
}

module.exports = {
  findByCommand,
  findById,
  create,
  createBulk,
  update,
  toggleEnabled,
  remove,
  count,
  getRandomResponse,
  findByCommandPaginated,
  removeByCommand
};
