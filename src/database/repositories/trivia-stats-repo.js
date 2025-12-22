const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('trivia-stats-repo');

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
    SELECT * FROM trivia_user_stats
    WHERE channel_id = ? AND user_id = ?
  `).get(channelId, userId);

  if (!stats) {
    // Create new stats entry
    const result = db.prepare(`
      INSERT INTO trivia_user_stats (channel_id, user_id, username)
      VALUES (?, ?, ?)
    `).run(channelId, userId, username);

    stats = findById(result.lastInsertRowid);
    logger.debug(`Created trivia stats for user ${username} in channel ${channelId}`);
  } else {
    // Update username in case it changed
    if (stats.username !== username) {
      db.prepare(`
        UPDATE trivia_user_stats SET username = ?, updated_at = CURRENT_TIMESTAMP
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
  return db.prepare('SELECT * FROM trivia_user_stats WHERE id = ?').get(id);
}

/**
 * Record a correct answer for a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - Twitch user ID
 * @param {string} username - Twitch username
 * @returns {Object} Updated stats
 */
function recordCorrect(channelId, userId, username) {
  const stats = getStats(channelId, userId, username);
  const db = getDb();

  const newStreak = stats.current_streak + 1;
  const bestStreak = Math.max(stats.best_streak, newStreak);

  db.prepare(`
    UPDATE trivia_user_stats
    SET correct_answers = correct_answers + 1,
        total_games = total_games + 1,
        current_streak = ?,
        best_streak = ?,
        last_played_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newStreak, bestStreak, stats.id);

  logger.debug(`Recorded trivia correct for ${username} (streak: ${newStreak})`);
  return findById(stats.id);
}

/**
 * Record an incorrect answer for a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - Twitch user ID
 * @param {string} username - Twitch username
 * @returns {Object} Updated stats
 */
function recordIncorrect(channelId, userId, username) {
  const stats = getStats(channelId, userId, username);
  const db = getDb();

  db.prepare(`
    UPDATE trivia_user_stats
    SET incorrect_answers = incorrect_answers + 1,
        total_games = total_games + 1,
        current_streak = 0,
        last_played_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(stats.id);

  logger.debug(`Recorded trivia incorrect for ${username}`);
  return findById(stats.id);
}

/**
 * Get leaderboard for a channel
 * @param {number} channelId - Channel ID
 * @param {number} limit - Number of entries to return
 * @returns {Object[]} Array of stats ordered by correct answers
 */
function getLeaderboard(channelId, limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM trivia_user_stats
    WHERE channel_id = ? AND total_games > 0
    ORDER BY correct_answers DESC, total_games DESC
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
    UPDATE trivia_user_stats
    SET correct_answers = 0, incorrect_answers = 0, total_games = 0,
        current_streak = 0, best_streak = 0, last_played_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE channel_id = ? AND user_id = ?
  `).run(channelId, userId);

  logger.info(`Reset trivia stats for user ${userId} in channel ${channelId}`);
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
    SELECT * FROM trivia_user_stats
    WHERE channel_id = ?
    ORDER BY correct_answers DESC
  `).all(channelId);
}

/**
 * Calculate accuracy percentage
 * @param {Object} stats - Stats object
 * @returns {number} Accuracy percentage (0-100)
 */
function calculateAccuracy(stats) {
  if (!stats || stats.total_games === 0) {
    return 0;
  }
  return Math.round((stats.correct_answers / stats.total_games) * 100);
}

/**
 * Get total games played for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Total games
 */
function getTotalGames(channelId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT SUM(total_games) as total FROM trivia_user_stats WHERE channel_id = ?
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
    SELECT COUNT(*) as count FROM trivia_user_stats
    WHERE channel_id = ? AND total_games > 0
  `).get(channelId).count;
}

module.exports = {
  getStats,
  findById,
  recordCorrect,
  recordIncorrect,
  getLeaderboard,
  resetStats,
  findByChannel,
  calculateAccuracy,
  getTotalGames,
  getPlayerCount
};
