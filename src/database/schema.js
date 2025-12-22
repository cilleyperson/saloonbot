const { getDb } = require('./index');
const { createChildLogger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const logger = createChildLogger('schema');

/**
 * Execute SQL on the database
 * Note: This uses better-sqlite3's exec method which is safe for SQL execution
 * @param {string} sql - SQL to execute
 */
function runSQL(sql) {
  const db = getDb();
  // better-sqlite3 exec method for SQL - not child_process
  db['exec'](sql);
}

/**
 * Create all tables if they don't exist
 */
function createTables() {
  // Schema version table
  runSQL(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Channels table
  runSQL(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitch_id TEXT UNIQUE NOT NULL,
      twitch_username TEXT NOT NULL,
      display_name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Channel auth tokens
  runSQL(`
    CREATE TABLE IF NOT EXISTS channel_auth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      scopes TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id)
    )
  `);

  // Channel settings
  runSQL(`
    CREATE TABLE IF NOT EXISTS channel_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      raid_shoutout_enabled INTEGER DEFAULT 1,
      raid_shoutout_template TEXT DEFAULT 'Thanks for the raid, @{raider}! Check them out at https://twitch.tv/{raider}',
      sub_notification_enabled INTEGER DEFAULT 1,
      sub_notification_template TEXT DEFAULT 'Thank you for subscribing, @{subscriber}!',
      resub_notification_template TEXT DEFAULT 'Thank you for resubscribing for {months} months, @{subscriber}!',
      gift_sub_notification_template TEXT DEFAULT 'Thank you {gifter} for gifting a sub to {subscriber}!',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id)
    )
  `);

  // Custom commands
  runSQL(`
    CREATE TABLE IF NOT EXISTS custom_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      command_name TEXT NOT NULL,
      response TEXT NOT NULL,
      cooldown_seconds INTEGER DEFAULT 5,
      user_level TEXT DEFAULT 'everyone',
      is_enabled INTEGER DEFAULT 1,
      use_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id, command_name)
    )
  `);

  // Counter commands
  runSQL(`
    CREATE TABLE IF NOT EXISTS counter_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      counter_name TEXT NOT NULL,
      current_count INTEGER DEFAULT 0,
      response_template TEXT DEFAULT '{counter} count: {count}',
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id, counter_name)
    )
  `);

  // Bot auth (single row for the bot account)
  runSQL(`
    CREATE TABLE IF NOT EXISTS bot_auth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_username TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      scopes TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Channel chat memberships (channels that a connected channel wants to join)
  runSQL(`
    CREATE TABLE IF NOT EXISTS channel_chat_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      target_channel TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id, target_channel)
    )
  `);

  // Command chat scopes (which chats a command is enabled for)
  // chat_name can be '__own__' for the channel's own chat, or a target_channel name
  runSQL(`
    CREATE TABLE IF NOT EXISTS command_chat_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id INTEGER NOT NULL REFERENCES custom_commands(id) ON DELETE CASCADE,
      chat_name TEXT NOT NULL,
      UNIQUE(command_id, chat_name)
    )
  `);

  // Counter chat scopes (which chats a counter is enabled for)
  runSQL(`
    CREATE TABLE IF NOT EXISTS counter_chat_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      counter_id INTEGER NOT NULL REFERENCES counter_commands(id) ON DELETE CASCADE,
      chat_name TEXT NOT NULL,
      UNIQUE(counter_id, chat_name)
    )
  `);

  logger.info('Database tables created/verified');
}

/**
 * Create indexes for better query performance
 */
function createIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_channels_twitch_id ON channels(twitch_id)',
    'CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active)',
    'CREATE INDEX IF NOT EXISTS idx_custom_commands_channel ON custom_commands(channel_id)',
    'CREATE INDEX IF NOT EXISTS idx_custom_commands_name ON custom_commands(channel_id, command_name)',
    'CREATE INDEX IF NOT EXISTS idx_counter_commands_channel ON counter_commands(channel_id)',
    'CREATE INDEX IF NOT EXISTS idx_counter_commands_name ON counter_commands(channel_id, counter_name)',
    'CREATE INDEX IF NOT EXISTS idx_chat_memberships_channel ON channel_chat_memberships(channel_id)',
    'CREATE INDEX IF NOT EXISTS idx_chat_memberships_active ON channel_chat_memberships(channel_id, is_active)',
    'CREATE INDEX IF NOT EXISTS idx_command_chat_scopes_command ON command_chat_scopes(command_id)',
    'CREATE INDEX IF NOT EXISTS idx_counter_chat_scopes_counter ON counter_chat_scopes(counter_id)'
  ];

  for (const index of indexes) {
    runSQL(index);
  }

  logger.info('Database indexes created/verified');
}

/**
 * Get current schema version
 * @returns {number} Current schema version
 */
function getSchemaVersion() {
  const db = getDb();
  const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
  return row?.version || 0;
}

/**
 * Set schema version
 * @param {number} version - Schema version to set
 */
function setSchemaVersion(version) {
  const db = getDb();
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
}

/**
 * Run any pending migrations
 */
function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../migrations');

  if (!fs.existsSync(migrationsDir)) {
    logger.debug('No migrations directory found');
    return;
  }

  const currentVersion = getSchemaVersion();
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const match = file.match(/^(\d+)/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    if (version <= currentVersion) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    try {
      runSQL(sql);
      setSchemaVersion(version);
      logger.info(`Applied migration: ${file}`);
    } catch (error) {
      logger.error(`Failed to apply migration ${file}`, { error: error.message });
      throw error;
    }
  }
}

/**
 * Initialize the database schema
 */
function initializeSchema() {
  createTables();
  createIndexes();
  runMigrations();
}

module.exports = {
  createTables,
  createIndexes,
  getSchemaVersion,
  setSchemaVersion,
  runMigrations,
  initializeSchema
};
