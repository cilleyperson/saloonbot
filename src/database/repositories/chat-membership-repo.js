const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('chat-membership-repo');

/**
 * Create a new chat membership (channel joining another channel's chat)
 * @param {number} channelId - The owning channel's database ID
 * @param {string} targetChannel - The Twitch username of the channel to join
 * @returns {Object} Created membership
 */
function create(channelId, targetChannel) {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO channel_chat_memberships (channel_id, target_channel, is_active)
    VALUES (?, ?, 1)
  `);

  const result = stmt.run(channelId, targetChannel.toLowerCase());
  logger.info(`Created chat membership: channel ${channelId} -> ${targetChannel}`);

  return findById(result.lastInsertRowid);
}

/**
 * Find membership by ID
 * @param {number} id - Membership ID
 * @returns {Object|null}
 */
function findById(id) {
  const db = getDb();
  const membership = db.prepare('SELECT * FROM channel_chat_memberships WHERE id = ?').get(id);
  if (membership) {
    membership.is_active = Boolean(membership.is_active);
  }
  return membership;
}

/**
 * Find all memberships for a channel
 * @param {number} channelId - Channel ID
 * @param {boolean} activeOnly - Only return active memberships
 * @returns {Object[]}
 */
function findByChannel(channelId, activeOnly = false) {
  const db = getDb();
  let sql = 'SELECT * FROM channel_chat_memberships WHERE channel_id = ?';
  if (activeOnly) {
    sql += ' AND is_active = 1';
  }
  sql += ' ORDER BY target_channel';

  const memberships = db.prepare(sql).all(channelId);
  return memberships.map(m => ({
    ...m,
    is_active: Boolean(m.is_active)
  }));
}

/**
 * Find all active memberships across all channels
 * @returns {Object[]}
 */
function findAllActive() {
  const db = getDb();
  const memberships = db.prepare(`
    SELECT ccm.*, c.twitch_username as owner_username
    FROM channel_chat_memberships ccm
    JOIN channels c ON c.id = ccm.channel_id
    WHERE ccm.is_active = 1 AND c.is_active = 1
    ORDER BY ccm.target_channel
  `).all();

  return memberships.map(m => ({
    ...m,
    is_active: Boolean(m.is_active)
  }));
}

/**
 * Find membership by channel and target
 * @param {number} channelId - Channel ID
 * @param {string} targetChannel - Target channel username
 * @returns {Object|null}
 */
function findByChannelAndTarget(channelId, targetChannel) {
  const db = getDb();
  const membership = db.prepare(`
    SELECT * FROM channel_chat_memberships
    WHERE channel_id = ? AND target_channel = ?
  `).get(channelId, targetChannel.toLowerCase());

  if (membership) {
    membership.is_active = Boolean(membership.is_active);
  }
  return membership;
}

/**
 * Check if a membership exists
 * @param {number} channelId - Channel ID
 * @param {string} targetChannel - Target channel username
 * @returns {boolean}
 */
function exists(channelId, targetChannel) {
  return findByChannelAndTarget(channelId, targetChannel) != null;
}

/**
 * Update a membership
 * @param {number} id - Membership ID
 * @param {Object} data - Data to update
 * @returns {Object|null}
 */
function update(id, data) {
  const db = getDb();

  const allowedFields = ['target_channel', 'is_active'];
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      if (key === 'target_channel') {
        updates.push(`${key} = ?`);
        values.push(value.toLowerCase());
      } else if (key === 'is_active') {
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

  const sql = `UPDATE channel_chat_memberships SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  logger.debug(`Updated chat membership ${id}`, { data });
  return findById(id);
}

/**
 * Toggle membership active status
 * @param {number} id - Membership ID
 * @returns {Object|null}
 */
function toggleActive(id) {
  const db = getDb();
  db.prepare(`
    UPDATE channel_chat_memberships
    SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const membership = findById(id);
  if (membership) {
    logger.debug(`Toggled chat membership ${id} to ${membership.is_active ? 'active' : 'inactive'}`);
  }
  return membership;
}

/**
 * Delete a membership
 * @param {number} id - Membership ID
 * @returns {boolean}
 */
function remove(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM channel_chat_memberships WHERE id = ?').run(id);
  logger.info(`Deleted chat membership ${id}`);
  return result.changes > 0;
}

/**
 * Get membership count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number}
 */
function count(channelId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM channel_chat_memberships WHERE channel_id = ?').get(channelId).count;
}

/**
 * Get all unique target channels that need to be joined
 * @returns {string[]} Array of unique channel usernames
 */
function getAllActiveTargetChannels() {
  const db = getDb();
  const results = db.prepare(`
    SELECT DISTINCT ccm.target_channel
    FROM channel_chat_memberships ccm
    JOIN channels c ON c.id = ccm.channel_id
    WHERE ccm.is_active = 1 AND c.is_active = 1
    ORDER BY ccm.target_channel
  `).all();

  return results.map(r => r.target_channel);
}

module.exports = {
  create,
  findById,
  findByChannel,
  findAllActive,
  findByChannelAndTarget,
  exists,
  update,
  toggleActive,
  remove,
  count,
  getAllActiveTargetChannels
};
