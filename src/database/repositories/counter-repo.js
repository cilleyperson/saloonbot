const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('counter-repo');

/**
 * Valid chat scope types
 */
const CHAT_SCOPES = ['all', 'selected'];

/**
 * Valid emoji positions
 */
const EMOJI_POSITIONS = ['start', 'end'];

/**
 * Special value for the channel's own chat
 */
const OWN_CHAT = '__own__';

/**
 * Create a new counter
 * @param {number} channelId - Channel ID
 * @param {string} counterName - Counter name
 * @param {Object} options - Additional options
 * @returns {Object} Created counter
 */
function create(channelId, counterName, options = {}) {
  const db = getDb();

  const {
    initialCount = 0,
    responseTemplate = '{counter} count: {count}',
    isEnabled = true,
    chatScope = 'all',
    chatScopes = [],
    emoji = null,
    emojiPosition = 'start'
  } = options;

  // Validate chat scope
  if (!CHAT_SCOPES.includes(chatScope)) {
    throw new Error(`Invalid chat scope: ${chatScope}`);
  }

  // Validate emoji position
  if (emojiPosition && !EMOJI_POSITIONS.includes(emojiPosition)) {
    throw new Error(`Invalid emoji position: ${emojiPosition}`);
  }

  const stmt = db.prepare(`
    INSERT INTO counter_commands (channel_id, counter_name, current_count, response_template, is_enabled, chat_scope, emoji, emoji_position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    channelId,
    counterName.toLowerCase(),
    initialCount,
    responseTemplate,
    isEnabled ? 1 : 0,
    chatScope,
    emoji || null,
    emojiPosition || 'start'
  );

  const counterId = result.lastInsertRowid;

  // If scope is 'selected', add the chat scopes
  if (chatScope === 'selected' && chatScopes.length > 0) {
    setChatScopes(counterId, chatScopes);
  }

  logger.info(`Created counter ${counterName}++ for channel ${channelId}`);
  return findById(counterId);
}

/**
 * Find counter by ID
 * @param {number} id - Counter ID
 * @returns {Object|null} Counter or null
 */
function findById(id) {
  const db = getDb();
  const counter = db.prepare('SELECT * FROM counter_commands WHERE id = ?').get(id);
  if (counter) {
    counter.is_enabled = Boolean(counter.is_enabled);
    counter.chat_scope = counter.chat_scope || 'all';
    counter.emoji = counter.emoji || null;
    counter.emoji_position = counter.emoji_position || 'start';
    counter.selected_chats = getChatScopes(counter.id);
  }
  return counter;
}

/**
 * Find counter by name for a channel
 * @param {number} channelId - Channel ID
 * @param {string} counterName - Counter name
 * @returns {Object|null} Counter or null
 */
function findByName(channelId, counterName) {
  const db = getDb();
  const counter = db.prepare(`
    SELECT * FROM counter_commands
    WHERE channel_id = ? AND counter_name = ?
  `).get(channelId, counterName.toLowerCase());

  if (counter) {
    counter.is_enabled = Boolean(counter.is_enabled);
    counter.chat_scope = counter.chat_scope || 'all';
    counter.emoji = counter.emoji || null;
    counter.emoji_position = counter.emoji_position || 'start';
    counter.selected_chats = getChatScopes(counter.id);
  }
  return counter;
}

/**
 * Find all counters for a channel
 * @param {number} channelId - Channel ID
 * @param {boolean} enabledOnly - Only return enabled counters
 * @returns {Object[]} Array of counters
 */
function findByChannel(channelId, enabledOnly = false) {
  const db = getDb();
  let sql = 'SELECT * FROM counter_commands WHERE channel_id = ?';
  if (enabledOnly) {
    sql += ' AND is_enabled = 1';
  }
  sql += ' ORDER BY counter_name';

  const counters = db.prepare(sql).all(channelId);
  return counters.map(counter => ({
    ...counter,
    is_enabled: Boolean(counter.is_enabled),
    chat_scope: counter.chat_scope || 'all',
    emoji: counter.emoji || null,
    emoji_position: counter.emoji_position || 'start',
    selected_chats: getChatScopes(counter.id)
  }));
}

/**
 * Increment a counter and return the new count
 * @param {number} id - Counter ID
 * @returns {number} New count value
 */
function increment(id) {
  const db = getDb();
  db.prepare(`
    UPDATE counter_commands
    SET current_count = current_count + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const counter = findById(id);
  if (counter) {
    logger.debug(`Incremented counter ${id} to ${counter.current_count}`);
    return counter.current_count;
  }
  return 0;
}

/**
 * Decrement a counter (minimum 0)
 * @param {number} id - Counter ID
 * @returns {number} New count value
 */
function decrement(id) {
  const db = getDb();
  db.prepare(`
    UPDATE counter_commands
    SET current_count = MAX(0, current_count - 1), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const counter = findById(id);
  return counter ? counter.current_count : 0;
}

/**
 * Reset a counter to 0 (or specified value)
 * @param {number} id - Counter ID
 * @param {number} value - Value to reset to (default 0)
 * @returns {Object|null} Updated counter or null
 */
function reset(id, value = 0) {
  const db = getDb();
  db.prepare(`
    UPDATE counter_commands
    SET current_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(value, id);

  logger.info(`Reset counter ${id} to ${value}`);
  return findById(id);
}

/**
 * Set counter to specific value
 * @param {number} id - Counter ID
 * @param {number} value - Value to set
 * @returns {Object|null} Updated counter or null
 */
function setCount(id, value) {
  return reset(id, value);
}

/**
 * Update a counter
 * @param {number} id - Counter ID
 * @param {Object} data - Data to update
 * @returns {Object|null} Updated counter or null
 */
function update(id, data) {
  const db = getDb();

  const allowedFields = ['counter_name', 'response_template', 'is_enabled', 'current_count', 'chat_scope', 'emoji', 'emoji_position'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (key === 'counter_name') {
        updates.push(`${key} = ?`);
        values.push(value.toLowerCase());
      } else if (key === 'is_enabled') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else if (key === 'chat_scope') {
        if (!CHAT_SCOPES.includes(value)) {
          throw new Error(`Invalid chat scope: ${value}`);
        }
        updates.push(`${key} = ?`);
        values.push(value);
      } else if (key === 'emoji_position') {
        if (value && !EMOJI_POSITIONS.includes(value)) {
          throw new Error(`Invalid emoji position: ${value}`);
        }
        updates.push(`${key} = ?`);
        values.push(value);
      } else if (key === 'emoji') {
        updates.push(`${key} = ?`);
        values.push(value || null);
      } else {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  if (updates.length === 0 && !data.chatScopes) return findById(id);

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE counter_commands SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);
  }

  // Update chat scopes if provided
  if (data.chatScopes !== undefined) {
    setChatScopes(id, data.chatScopes);
  }

  logger.debug(`Updated counter ${id}`, { data });
  return findById(id);
}

/**
 * Toggle counter enabled status
 * @param {number} id - Counter ID
 * @returns {Object|null} Updated counter or null
 */
function toggleEnabled(id) {
  const db = getDb();
  db.prepare(`
    UPDATE counter_commands
    SET is_enabled = NOT is_enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  return findById(id);
}

/**
 * Delete a counter
 * @param {number} id - Counter ID
 * @returns {boolean} Success
 */
function remove(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM counter_commands WHERE id = ?').run(id);
  logger.info(`Deleted counter ${id}`);
  return result.changes > 0;
}

/**
 * Get counter count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Counter count
 */
function count(channelId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM counter_commands WHERE channel_id = ?').get(channelId).count;
}

/**
 * Check if a counter exists
 * @param {number} channelId - Channel ID
 * @param {string} counterName - Counter name
 * @returns {boolean}
 */
function exists(channelId, counterName) {
  return findByName(channelId, counterName) != null;
}

/**
 * Get chat scopes for a counter
 * @param {number} counterId - Counter ID
 * @returns {string[]} Array of chat names
 */
function getChatScopes(counterId) {
  const db = getDb();
  const rows = db.prepare('SELECT chat_name FROM counter_chat_scopes WHERE counter_id = ?').all(counterId);
  return rows.map(r => r.chat_name);
}

/**
 * Set chat scopes for a counter
 * @param {number} counterId - Counter ID
 * @param {string[]} chatNames - Array of chat names
 */
function setChatScopes(counterId, chatNames) {
  const db = getDb();

  // Delete existing scopes
  db.prepare('DELETE FROM counter_chat_scopes WHERE counter_id = ?').run(counterId);

  // Insert new scopes
  if (chatNames && chatNames.length > 0) {
    const stmt = db.prepare('INSERT INTO counter_chat_scopes (counter_id, chat_name) VALUES (?, ?)');
    for (const chatName of chatNames) {
      stmt.run(counterId, chatName.toLowerCase());
    }
  }
}

/**
 * Check if a counter is enabled for a specific chat
 * @param {Object} counter - Counter object (with chat_scope and selected_chats)
 * @param {string} chatName - The chat where the counter was used
 * @param {string} ownerUsername - The username of the channel that owns the counter
 * @returns {boolean}
 */
function isEnabledForChat(counter, chatName, ownerUsername) {
  if (!counter || !counter.is_enabled) {
    return false;
  }

  // If scope is 'all', it works everywhere
  if (counter.chat_scope === 'all') {
    return true;
  }

  // For 'selected' scope, check if the chat is in the selected list
  const normalizedChatName = chatName.toLowerCase();
  const normalizedOwner = ownerUsername.toLowerCase();

  // Check if it's the owner's own chat
  if (normalizedChatName === normalizedOwner && counter.selected_chats.includes(OWN_CHAT)) {
    return true;
  }

  // Check if this specific chat is selected
  return counter.selected_chats.includes(normalizedChatName);
}

module.exports = {
  CHAT_SCOPES,
  EMOJI_POSITIONS,
  OWN_CHAT,
  create,
  findById,
  findByName,
  findByChannel,
  increment,
  decrement,
  reset,
  setCount,
  update,
  toggleEnabled,
  remove,
  count,
  exists,
  getChatScopes,
  setChatScopes,
  isEnabledForChat
};
