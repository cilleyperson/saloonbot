const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('command-repo');

/**
 * Valid user levels for commands
 */
const USER_LEVELS = ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster'];

/**
 * Valid chat scope types
 */
const CHAT_SCOPES = ['all', 'selected'];

/**
 * Valid response modes
 */
const RESPONSE_MODES = ['single', 'random'];

/**
 * Valid emoji positions
 */
const EMOJI_POSITIONS = ['start', 'end'];

/**
 * Special value for the channel's own chat
 */
const OWN_CHAT = '__own__';

/**
 * Create a new custom command
 * @param {number} channelId - Channel ID
 * @param {string} commandName - Command name (without !)
 * @param {string} response - Response message
 * @param {Object} options - Additional options
 * @returns {Object} Created command
 */
function create(channelId, commandName, response, options = {}) {
  const db = getDb();

  const {
    cooldownSeconds = 5,
    userLevel = 'everyone',
    isEnabled = true,
    chatScope = 'all',
    chatScopes = [],
    responseMode = 'single',
    emoji = null,
    emojiPosition = 'start'
  } = options;

  // Validate user level
  if (!USER_LEVELS.includes(userLevel)) {
    throw new Error(`Invalid user level: ${userLevel}`);
  }

  // Validate chat scope
  if (!CHAT_SCOPES.includes(chatScope)) {
    throw new Error(`Invalid chat scope: ${chatScope}`);
  }

  // Validate response mode
  if (!RESPONSE_MODES.includes(responseMode)) {
    throw new Error(`Invalid response mode: ${responseMode}`);
  }

  // Validate emoji position
  if (emojiPosition && !EMOJI_POSITIONS.includes(emojiPosition)) {
    throw new Error(`Invalid emoji position: ${emojiPosition}`);
  }

  const stmt = db.prepare(`
    INSERT INTO custom_commands (channel_id, command_name, response, cooldown_seconds, user_level, is_enabled, chat_scope, response_mode, emoji, emoji_position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    channelId,
    commandName.toLowerCase(),
    response,
    cooldownSeconds,
    userLevel,
    isEnabled ? 1 : 0,
    chatScope,
    responseMode,
    emoji || null,
    emojiPosition || 'start'
  );

  const commandId = result.lastInsertRowid;

  // If scope is 'selected', add the chat scopes
  if (chatScope === 'selected' && chatScopes.length > 0) {
    setChatScopes(commandId, chatScopes);
  }

  logger.info(`Created command !${commandName} for channel ${channelId}`);
  return findById(commandId);
}

/**
 * Find command by ID
 * @param {number} id - Command ID
 * @returns {Object|null} Command or null
 */
function findById(id) {
  const db = getDb();
  const cmd = db.prepare('SELECT * FROM custom_commands WHERE id = ?').get(id);
  if (cmd) {
    cmd.is_enabled = Boolean(cmd.is_enabled);
    cmd.chat_scope = cmd.chat_scope || 'all';
    cmd.response_mode = cmd.response_mode || 'single';
    cmd.emoji = cmd.emoji || null;
    cmd.emoji_position = cmd.emoji_position || 'start';
    cmd.selected_chats = getChatScopes(cmd.id);
  }
  return cmd;
}

/**
 * Find command by name for a channel
 * @param {number} channelId - Channel ID
 * @param {string} commandName - Command name
 * @returns {Object|null} Command or null
 */
function findByName(channelId, commandName) {
  const db = getDb();
  const cmd = db.prepare(`
    SELECT * FROM custom_commands
    WHERE channel_id = ? AND command_name = ?
  `).get(channelId, commandName.toLowerCase());

  if (cmd) {
    cmd.is_enabled = Boolean(cmd.is_enabled);
    cmd.chat_scope = cmd.chat_scope || 'all';
    cmd.response_mode = cmd.response_mode || 'single';
    cmd.emoji = cmd.emoji || null;
    cmd.emoji_position = cmd.emoji_position || 'start';
    cmd.selected_chats = getChatScopes(cmd.id);
  }
  return cmd;
}

/**
 * Find all commands for a channel
 * @param {number} channelId - Channel ID
 * @param {boolean} enabledOnly - Only return enabled commands
 * @returns {Object[]} Array of commands
 */
function findByChannel(channelId, enabledOnly = false) {
  const db = getDb();
  let sql = 'SELECT * FROM custom_commands WHERE channel_id = ?';
  if (enabledOnly) {
    sql += ' AND is_enabled = 1';
  }
  sql += ' ORDER BY command_name';

  const commands = db.prepare(sql).all(channelId);
  return commands.map(cmd => ({
    ...cmd,
    is_enabled: Boolean(cmd.is_enabled),
    chat_scope: cmd.chat_scope || 'all',
    response_mode: cmd.response_mode || 'single',
    emoji: cmd.emoji || null,
    emoji_position: cmd.emoji_position || 'start',
    selected_chats: getChatScopes(cmd.id)
  }));
}

/**
 * Update a command
 * @param {number} id - Command ID
 * @param {Object} data - Data to update
 * @returns {Object|null} Updated command or null
 */
function update(id, data) {
  const db = getDb();

  const allowedFields = ['command_name', 'response', 'cooldown_seconds', 'user_level', 'is_enabled', 'chat_scope', 'response_mode', 'emoji', 'emoji_position'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (key === 'user_level' && !USER_LEVELS.includes(value)) {
        throw new Error(`Invalid user level: ${value}`);
      }
      if (key === 'chat_scope' && !CHAT_SCOPES.includes(value)) {
        throw new Error(`Invalid chat scope: ${value}`);
      }
      if (key === 'response_mode' && !RESPONSE_MODES.includes(value)) {
        throw new Error(`Invalid response mode: ${value}`);
      }
      if (key === 'emoji_position' && value && !EMOJI_POSITIONS.includes(value)) {
        throw new Error(`Invalid emoji position: ${value}`);
      }
      if (key === 'command_name') {
        updates.push(`${key} = ?`);
        values.push(value.toLowerCase());
      } else if (key === 'is_enabled') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
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

    const sql = `UPDATE custom_commands SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);
  }

  // Update chat scopes if provided
  if (data.chatScopes !== undefined) {
    setChatScopes(id, data.chatScopes);
  }

  logger.debug(`Updated command ${id}`, { data });
  return findById(id);
}

/**
 * Toggle command enabled status
 * @param {number} id - Command ID
 * @returns {Object|null} Updated command or null
 */
function toggleEnabled(id) {
  const db = getDb();
  db.prepare(`
    UPDATE custom_commands
    SET is_enabled = NOT is_enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const cmd = findById(id);
  if (cmd) {
    logger.debug(`Toggled command ${id} to ${cmd.is_enabled ? 'enabled' : 'disabled'}`);
  }
  return cmd;
}

/**
 * Increment use count for a command
 * @param {number} id - Command ID
 */
function incrementUseCount(id) {
  const db = getDb();
  db.prepare('UPDATE custom_commands SET use_count = use_count + 1 WHERE id = ?').run(id);
}

/**
 * Delete a command
 * @param {number} id - Command ID
 * @returns {boolean} Success
 */
function remove(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM custom_commands WHERE id = ?').run(id);
  logger.info(`Deleted command ${id}`);
  return result.changes > 0;
}

/**
 * Get command count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Command count
 */
function count(channelId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM custom_commands WHERE channel_id = ?').get(channelId).count;
}

/**
 * Check if a command exists
 * @param {number} channelId - Channel ID
 * @param {string} commandName - Command name
 * @returns {boolean}
 */
function exists(channelId, commandName) {
  return findByName(channelId, commandName) != null;
}

/**
 * Get chat scopes for a command
 * @param {number} commandId - Command ID
 * @returns {string[]} Array of chat names
 */
function getChatScopes(commandId) {
  const db = getDb();
  const rows = db.prepare('SELECT chat_name FROM command_chat_scopes WHERE command_id = ?').all(commandId);
  return rows.map(r => r.chat_name);
}

/**
 * Set chat scopes for a command
 * @param {number} commandId - Command ID
 * @param {string[]} chatNames - Array of chat names
 */
function setChatScopes(commandId, chatNames) {
  const db = getDb();

  // Delete existing scopes
  db.prepare('DELETE FROM command_chat_scopes WHERE command_id = ?').run(commandId);

  // Insert new scopes
  if (chatNames && chatNames.length > 0) {
    const stmt = db.prepare('INSERT INTO command_chat_scopes (command_id, chat_name) VALUES (?, ?)');
    for (const chatName of chatNames) {
      stmt.run(commandId, chatName.toLowerCase());
    }
  }
}

/**
 * Check if a command is enabled for a specific chat
 * @param {Object} command - Command object (with chat_scope and selected_chats)
 * @param {string} chatName - The chat where the command was used
 * @param {string} ownerUsername - The username of the channel that owns the command
 * @returns {boolean}
 */
function isEnabledForChat(command, chatName, ownerUsername) {
  if (!command || !command.is_enabled) {
    return false;
  }

  // If scope is 'all', it works everywhere
  if (command.chat_scope === 'all') {
    return true;
  }

  // For 'selected' scope, check if the chat is in the selected list
  const normalizedChatName = chatName.toLowerCase();
  const normalizedOwner = ownerUsername.toLowerCase();

  // Check if it's the owner's own chat
  if (normalizedChatName === normalizedOwner && command.selected_chats.includes(OWN_CHAT)) {
    return true;
  }

  // Check if this specific chat is selected
  return command.selected_chats.includes(normalizedChatName);
}

module.exports = {
  USER_LEVELS,
  CHAT_SCOPES,
  RESPONSE_MODES,
  EMOJI_POSITIONS,
  OWN_CHAT,
  create,
  findById,
  findByName,
  findByChannel,
  update,
  toggleEnabled,
  incrementUseCount,
  remove,
  count,
  exists,
  getChatScopes,
  setChatScopes,
  isEnabledForChat
};
