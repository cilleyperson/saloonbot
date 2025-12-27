const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('predefined-settings-repo');

/**
 * List of available predefined commands
 */
const PREDEFINED_COMMANDS = ['advice', 'ball', 'botcommands', 'dadjoke', 'define', 'horoscope', 'randomfact', 'rps', 'rpsstats', 'trivia', 'triviastats'];

/**
 * Valid chat scope types
 */
const CHAT_SCOPES = ['all', 'selected'];

/**
 * Special value for the channel's own chat
 */
const OWN_CHAT = '__own__';

/**
 * Get or create settings for a predefined command
 * @param {number} channelId - Channel ID
 * @param {string} commandName - Command name (e.g., 'ball', 'define', 'rps')
 * @returns {Object} Settings object
 */
function getSettings(channelId, commandName) {
  if (!PREDEFINED_COMMANDS.includes(commandName)) {
    throw new Error(`Invalid predefined command: ${commandName}`);
  }

  const db = getDb();

  let settings = db.prepare(`
    SELECT * FROM predefined_command_settings
    WHERE channel_id = ? AND command_name = ?
  `).get(channelId, commandName);

  if (!settings) {
    // Create default settings
    const result = db.prepare(`
      INSERT INTO predefined_command_settings (channel_id, command_name, is_enabled, chat_scope, cooldown_seconds)
      VALUES (?, ?, 0, 'all', 5)
    `).run(channelId, commandName);

    settings = findById(result.lastInsertRowid);
    logger.debug(`Created default settings for ${commandName} in channel ${channelId}`);
  } else {
    settings.is_enabled = Boolean(settings.is_enabled);
    settings.selected_chats = getChatScopes(settings.id);
  }

  return settings;
}

/**
 * Find settings by ID
 * @param {number} id - Settings ID
 * @returns {Object|null} Settings or null
 */
function findById(id) {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM predefined_command_settings WHERE id = ?').get(id);
  if (settings) {
    settings.is_enabled = Boolean(settings.is_enabled);
    settings.selected_chats = getChatScopes(settings.id);
  }
  return settings;
}

/**
 * Get all predefined command settings for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object[]} Array of settings objects
 */
function findByChannel(channelId) {
  const db = getDb();

  // Ensure all predefined commands have settings entries
  for (const commandName of PREDEFINED_COMMANDS) {
    getSettings(channelId, commandName);
  }

  const settings = db.prepare(`
    SELECT * FROM predefined_command_settings
    WHERE channel_id = ?
    ORDER BY command_name
  `).all(channelId);

  return settings.map(s => ({
    ...s,
    is_enabled: Boolean(s.is_enabled),
    selected_chats: getChatScopes(s.id)
  }));
}

/**
 * Update settings
 * @param {number} id - Settings ID
 * @param {Object} data - Data to update
 * @returns {Object|null} Updated settings or null
 */
function update(id, data) {
  const db = getDb();

  const allowedFields = ['is_enabled', 'chat_scope', 'cooldown_seconds'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (key === 'chat_scope' && !CHAT_SCOPES.includes(value)) {
        throw new Error(`Invalid chat scope: ${value}`);
      }
      if (key === 'is_enabled') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
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

    const sql = `UPDATE predefined_command_settings SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);
  }

  // Update chat scopes if provided
  if (data.chatScopes !== undefined) {
    setChatScopes(id, data.chatScopes);
  }

  logger.debug(`Updated predefined command settings ${id}`, { data });
  return findById(id);
}

/**
 * Toggle enabled status
 * @param {number} id - Settings ID
 * @returns {Object|null} Updated settings or null
 */
function toggleEnabled(id) {
  const db = getDb();
  db.prepare(`
    UPDATE predefined_command_settings
    SET is_enabled = NOT is_enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const settings = findById(id);
  if (settings) {
    logger.debug(`Toggled predefined command ${id} to ${settings.is_enabled ? 'enabled' : 'disabled'}`);
  }
  return settings;
}

/**
 * Get chat scopes for a settings entry
 * @param {number} settingId - Settings ID
 * @returns {string[]} Array of chat names
 */
function getChatScopes(settingId) {
  const db = getDb();
  const rows = db.prepare('SELECT chat_name FROM predefined_command_chat_scopes WHERE setting_id = ?').all(settingId);
  return rows.map(r => r.chat_name);
}

/**
 * Set chat scopes for a settings entry
 * @param {number} settingId - Settings ID
 * @param {string[]} chatNames - Array of chat names
 */
function setChatScopes(settingId, chatNames) {
  const db = getDb();

  // Delete existing scopes
  db.prepare('DELETE FROM predefined_command_chat_scopes WHERE setting_id = ?').run(settingId);

  // Insert new scopes
  if (chatNames && chatNames.length > 0) {
    const stmt = db.prepare('INSERT INTO predefined_command_chat_scopes (setting_id, chat_name) VALUES (?, ?)');
    for (const chatName of chatNames) {
      stmt.run(settingId, chatName.toLowerCase());
    }
  }
}

/**
 * Check if a predefined command is enabled for a specific chat
 * @param {Object} settings - Settings object (with chat_scope and selected_chats)
 * @param {string} chatName - The chat where the command was used
 * @param {string} ownerUsername - The username of the channel that owns the settings
 * @returns {boolean}
 */
function isEnabledForChat(settings, chatName, ownerUsername) {
  if (!settings || !settings.is_enabled) {
    return false;
  }

  // If scope is 'all', it works everywhere
  if (settings.chat_scope === 'all') {
    return true;
  }

  // For 'selected' scope, check if the chat is in the selected list
  const normalizedChatName = chatName.toLowerCase();
  const normalizedOwner = ownerUsername.toLowerCase();

  // Check if it's the owner's own chat
  if (normalizedChatName === normalizedOwner && settings.selected_chats.includes(OWN_CHAT)) {
    return true;
  }

  // Check if this specific chat is selected
  return settings.selected_chats.includes(normalizedChatName);
}

/**
 * Get command description for display
 * @param {string} commandName - Command name
 * @returns {Object} Command info
 */
function getCommandInfo(commandName) {
  const info = {
    advice: {
      name: 'advice',
      displayName: 'Random Advice',
      trigger: '!advice',
      description: 'Get a random piece of advice',
      emoji: '💡'
    },
    ball: {
      name: 'ball',
      displayName: 'Magic 8 Ball',
      trigger: '!ball',
      description: 'Get a random Magic 8 Ball response to your question',
      emoji: '🎱'
    },
    botcommands: {
      name: 'botcommands',
      displayName: 'Bot Commands',
      trigger: '!botcommands',
      description: 'List all bot commands available in this chat',
      emoji: '📋'
    },
    dadjoke: {
      name: 'dadjoke',
      displayName: 'Dad Joke',
      trigger: '!dadjoke',
      description: 'Get a random dad joke',
      emoji: '👨'
    },
    define: {
      name: 'define',
      displayName: 'Dictionary',
      trigger: '!define <word>',
      description: 'Look up word definitions using dictionary API or custom definitions',
      emoji: '📖'
    },
    horoscope: {
      name: 'horoscope',
      displayName: 'Daily Horoscope',
      trigger: '!horoscope <sign>',
      description: 'Get your daily horoscope reading for any zodiac sign',
      emoji: '🔮'
    },
    randomfact: {
      name: 'randomfact',
      displayName: 'Random Fact',
      trigger: '!randomfact',
      description: 'Get a random useless but interesting fact',
      emoji: '🧠'
    },
    rps: {
      name: 'rps',
      displayName: 'Rock Paper Scissors',
      trigger: '!rps <rock|paper|scissors>',
      description: 'Play rock paper scissors against the bot',
      emoji: '🎮'
    },
    rpsstats: {
      name: 'rpsstats',
      displayName: 'RPS Stats',
      trigger: '!rpsstats',
      description: 'View your rock paper scissors statistics',
      emoji: '📊'
    },
    trivia: {
      name: 'trivia',
      displayName: 'Trivia Game',
      trigger: '!trivia',
      description: 'Start a trivia question - first correct answer wins!',
      emoji: '🎯'
    },
    triviastats: {
      name: 'triviastats',
      displayName: 'Trivia Stats',
      trigger: '!triviastats',
      description: 'View your trivia game statistics',
      emoji: '📊'
    }
  };

  return info[commandName] || null;
}

module.exports = {
  PREDEFINED_COMMANDS,
  CHAT_SCOPES,
  OWN_CHAT,
  getSettings,
  findById,
  findByChannel,
  update,
  toggleEnabled,
  getChatScopes,
  setChatScopes,
  isEnabledForChat,
  getCommandInfo
};
