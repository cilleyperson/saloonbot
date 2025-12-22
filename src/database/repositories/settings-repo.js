const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('settings-repo');

/**
 * Default settings for new channels
 */
const DEFAULT_SETTINGS = {
  raid_shoutout_enabled: 1,
  raid_shoutout_template: 'Thanks for the raid, @{raider}! Check them out at https://twitch.tv/{raider}',
  sub_notification_enabled: 1,
  sub_notification_template: 'Thank you for subscribing, @{subscriber}!',
  resub_notification_template: 'Thank you for resubscribing for {months} months, @{subscriber}!',
  gift_sub_notification_template: 'Thank you {gifter} for gifting a sub to {subscriber}!'
};

/**
 * Create default settings for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object} Created settings
 */
function createDefaultSettings(channelId) {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO channel_settings (
      channel_id,
      raid_shoutout_enabled,
      raid_shoutout_template,
      sub_notification_enabled,
      sub_notification_template,
      resub_notification_template,
      gift_sub_notification_template
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    channelId,
    DEFAULT_SETTINGS.raid_shoutout_enabled,
    DEFAULT_SETTINGS.raid_shoutout_template,
    DEFAULT_SETTINGS.sub_notification_enabled,
    DEFAULT_SETTINGS.sub_notification_template,
    DEFAULT_SETTINGS.resub_notification_template,
    DEFAULT_SETTINGS.gift_sub_notification_template
  );

  logger.info(`Created default settings for channel ${channelId}`);
  return getSettings(channelId);
}

/**
 * Get settings for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Settings or null
 */
function getSettings(channelId) {
  const db = getDb();
  let settings = db.prepare('SELECT * FROM channel_settings WHERE channel_id = ?').get(channelId);

  // Create default settings if none exist
  if (!settings) {
    settings = createDefaultSettings(channelId);
  }

  // Convert integer booleans to actual booleans for convenience
  if (settings) {
    settings.raid_shoutout_enabled = Boolean(settings.raid_shoutout_enabled);
    settings.sub_notification_enabled = Boolean(settings.sub_notification_enabled);
  }

  return settings;
}

/**
 * Update settings for a channel
 * @param {number} channelId - Channel ID
 * @param {Object} data - Settings to update
 * @returns {Object|null} Updated settings or null
 */
function updateSettings(channelId, data) {
  const db = getDb();

  // Ensure settings exist
  getSettings(channelId);

  const allowedFields = [
    'raid_shoutout_enabled',
    'raid_shoutout_template',
    'sub_notification_enabled',
    'sub_notification_template',
    'resub_notification_template',
    'gift_sub_notification_template'
  ];

  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      // Convert booleans to integers for SQLite
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
  }

  if (updates.length === 0) return getSettings(channelId);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(channelId);

  const sql = `UPDATE channel_settings SET ${updates.join(', ')} WHERE channel_id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated settings for channel ${channelId}`, { data });
  return getSettings(channelId);
}

/**
 * Reset settings to defaults for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object} Reset settings
 */
function resetSettings(channelId) {
  const db = getDb();

  db.prepare('DELETE FROM channel_settings WHERE channel_id = ?').run(channelId);
  logger.info(`Reset settings for channel ${channelId}`);

  return createDefaultSettings(channelId);
}

/**
 * Get the default settings object
 * @returns {Object} Default settings
 */
function getDefaults() {
  return { ...DEFAULT_SETTINGS };
}

module.exports = {
  createDefaultSettings,
  getSettings,
  updateSettings,
  resetSettings,
  getDefaults,
  DEFAULT_SETTINGS
};
