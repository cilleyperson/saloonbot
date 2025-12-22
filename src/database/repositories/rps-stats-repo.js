const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('rps-stats-repo');

/**
 * Get or create stats for a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - Twitch user ID
 * @param {string} username - Twitch username
 * @returns {Object} Stats object
 */
function getStats(channelId, userId, username) {
  const db = getDb();

  let stats = db.prepare(`
    SELECT * FROM rps_user_stats
    WHERE channel_id = ? AND user_id = ?
  `).get(channelId, userId);

  if (!stats) {
    // Create new stats entry
    const result = db.prepare(`
      INSERT INTO rps_user_stats (channel_id, user_id, username)
      VALUES (?, ?, ?)
    `).run(channelId, userId, username);

    stats = findById(result.lastInsertRowid);
    logger.debug(`Created RPS stats for user ${username} in channel ${channelId}`);
  } else {
    // Update username in case it changed
    if (stats.username !== username) {
      db.prepare(`
        UPDATE rps_user_stats SET username = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(username, stats.id);
      stats.username = username;
    }
  }

  return stats;
}

/**
 * Find stats by ID
 * @param {number} id - Stats ID
 * @returns {Object|null} Stats or null
 */
function findById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM rps_user_stats WHERE id = ?').get(id);
}

/**
 * Record a win for a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - Twitch user ID
 * @param {string} username - Twitch username
 * @returns {Object} Updated stats
 */
function recordWin(channelId, userId, username) {
  const stats = getStats(channelId, userId, username);
  const db = getDb();

  const newStreak = stats.current_streak + 1;
  const bestStreak = Math.max(stats.best_streak, newStreak);

  db.prepare(`
    UPDATE rps_user_stats
    SET wins = wins + 1,
        total_games = total_games + 1,
        current_streak = ?,
        best_streak = ?,
        last_played_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newStreak, bestStreak, stats.id);

  logger.debug(`Recorded RPS win for ${username} (streak: ${newStreak})`);
  return findById(stats.id);
}

/**
 * Record a loss for a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - Twitch user ID
 * @param {string} username - Twitch username
 * @returns {Object} Updated stats
 */
function recordLoss(channelId, userId, username) {
  const stats = getStats(channelId, userId, username);
  const db = getDb();

  db.prepare(`
    UPDATE rps_user_stats
    SET losses = losses + 1,
        total_games = total_games + 1,
        current_streak = 0,
        last_played_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(stats.id);

  logger.debug(`Recorded RPS loss for ${username}`);
  return findById(stats.id);
}

/**
 * Record a tie for a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - Twitch user ID
 * @param {string} username - Twitch username
 * @returns {Object} Updated stats
 */
function recordTie(channelId, userId, username) {
  const stats = getStats(channelId, userId, username);
  const db = getDb();

  // Ties don't affect streak
  db.prepare(`
    UPDATE rps_user_stats
    SET ties = ties + 1,
        total_games = total_games + 1,
        last_played_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(stats.id);

  logger.debug(`Recorded RPS tie for ${username}`);
  return findById(stats.id);
}

/**
 * Get leaderboard for a channel
 * @param {number} channelId - Channel ID
 * @param {number} limit - Number of entries to return
 * @returns {Object[]} Array of stats ordered by wins
 */
function getLeaderboard(channelId, limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM rps_user_stats
    WHERE channel_id = ? AND total_games > 0
    ORDER BY wins DESC, total_games DESC
    LIMIT ?
  `).all(channelId, limit);
}

/**
 * Reset stats for a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - Twitch user ID
 * @returns {boolean} Success
 */
function resetStats(channelId, userId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE rps_user_stats
    SET wins = 0, losses = 0, ties = 0, total_games = 0,
        current_streak = 0, best_streak = 0, last_played_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE channel_id = ? AND user_id = ?
  `).run(channelId, userId);

  logger.info(`Reset RPS stats for user ${userId} in channel ${channelId}`);
  return result.changes > 0;
}

/**
 * Get all stats for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object[]} Array of stats
 */
function findByChannel(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM rps_user_stats
    WHERE channel_id = ?
    ORDER BY wins DESC
  `).all(channelId);
}

/**
 * Calculate win percentage
 * @param {Object} stats - Stats object
 * @returns {number} Win percentage (0-100)
 */
function calculateWinPercentage(stats) {
  if (!stats || stats.total_games === 0) {
    return 0;
  }
  return Math.round((stats.wins / stats.total_games) * 100);
}

/**
 * Get total games played for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Total games
 */
function getTotalGames(channelId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT SUM(total_games) as total FROM rps_user_stats WHERE channel_id = ?
  `).get(channelId);
  return result?.total || 0;
}

/**
 * Get unique player count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Player count
 */
function getPlayerCount(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT COUNT(*) as count FROM rps_user_stats
    WHERE channel_id = ? AND total_games > 0
  `).get(channelId).count;
}

module.exports = {
  getStats,
  findById,
  recordWin,
  recordLoss,
  recordTie,
  getLeaderboard,
  resetStats,
  findByChannel,
  calculateWinPercentage,
  getTotalGames,
  getPlayerCount
};
