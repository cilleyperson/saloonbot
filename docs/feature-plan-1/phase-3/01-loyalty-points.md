# Task 01: Loyalty Points System

## Task ID
`P3-T01`

## Prerequisites
- Phase 2 completed
- Understanding of viewer tracking patterns

## Objective
Implement a loyalty points system that rewards viewers for watching and chatting, with customizable currency names, earning rates, and management commands.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `frontend-mobile-development:frontend-developer`

## Security Requirements
- Validate all point amounts as positive integers
- Prevent integer overflow (max 2^53 - 1)
- Rate limit point transfers and checks
- Transaction logging for audit trail
- Verify channel ownership on all operations
- Use parameterized queries only
- Prevent race conditions in point transfers

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/011_loyalty.sql`:

```sql
-- Migration: 011_loyalty.sql
-- Description: Loyalty points system

CREATE TABLE IF NOT EXISTS loyalty_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL UNIQUE,
  is_enabled INTEGER DEFAULT 0,
  currency_name TEXT DEFAULT 'points',
  currency_name_plural TEXT DEFAULT 'points',
  points_per_interval INTEGER DEFAULT 10,
  interval_minutes INTEGER DEFAULT 5,
  subscriber_multiplier REAL DEFAULT 1.5,
  active_bonus INTEGER DEFAULT 0,
  enable_offline INTEGER DEFAULT 0,
  min_watchtime_minutes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  watch_time_minutes INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  is_subscriber INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE(channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  reason TEXT,
  related_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_points_channel ON user_points(channel_id);
CREATE INDEX IF NOT EXISTS idx_user_points_user ON user_points(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_leaderboard ON user_points(channel_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_point_transactions_channel ON point_transactions(channel_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user ON point_transactions(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_date ON point_transactions(created_at);
```

### Step 2: Create Loyalty Repository

Create `src/database/repositories/loyalty-repo.js`:

```javascript
/**
 * Loyalty Repository
 * Data access layer for loyalty points system
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('loyalty-repo');

// Maximum safe integer for points
const MAX_POINTS = Number.MAX_SAFE_INTEGER;

// ============================================
// Settings Functions
// ============================================

/**
 * Get loyalty settings for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Settings or null
 */
function getSettings(channelId) {
  const db = getDb();
  return db.prepare('SELECT * FROM loyalty_settings WHERE channel_id = ?').get(channelId);
}

/**
 * Create or update loyalty settings
 * @param {number} channelId - Channel ID
 * @param {Object} settings - Settings object
 */
function upsertSettings(channelId, settings) {
  const db = getDb();
  const existing = getSettings(channelId);

  if (existing) {
    db.prepare(`
      UPDATE loyalty_settings SET
        is_enabled = ?,
        currency_name = ?,
        currency_name_plural = ?,
        points_per_interval = ?,
        interval_minutes = ?,
        subscriber_multiplier = ?,
        active_bonus = ?,
        enable_offline = ?,
        min_watchtime_minutes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE channel_id = ?
    `).run(
      settings.isEnabled ? 1 : 0,
      settings.currencyName || 'points',
      settings.currencyNamePlural || 'points',
      settings.pointsPerInterval || 10,
      settings.intervalMinutes || 5,
      settings.subscriberMultiplier || 1.5,
      settings.activeBonus || 0,
      settings.enableOffline ? 1 : 0,
      settings.minWatchtimeMinutes || 0,
      channelId
    );
  } else {
    db.prepare(`
      INSERT INTO loyalty_settings (
        channel_id, is_enabled, currency_name, currency_name_plural,
        points_per_interval, interval_minutes, subscriber_multiplier,
        active_bonus, enable_offline, min_watchtime_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      channelId,
      settings.isEnabled ? 1 : 0,
      settings.currencyName || 'points',
      settings.currencyNamePlural || 'points',
      settings.pointsPerInterval || 10,
      settings.intervalMinutes || 5,
      settings.subscriberMultiplier || 1.5,
      settings.activeBonus || 0,
      settings.enableOffline ? 1 : 0,
      settings.minWatchtimeMinutes || 0
    );
  }
}

// ============================================
// User Points Functions
// ============================================

/**
 * Get user points record
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {Object|undefined} User record or undefined
 */
function getUserPoints(channelId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM user_points
    WHERE channel_id = ? AND user_id = ?
  `).get(channelId, userId);
}

/**
 * Get or create user points record
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @returns {Object} User record
 */
function getOrCreateUser(channelId, userId, username) {
  const db = getDb();
  let user = getUserPoints(channelId, userId);

  if (!user) {
    db.prepare(`
      INSERT INTO user_points (channel_id, user_id, username)
      VALUES (?, ?, ?)
    `).run(channelId, userId, username);
    user = getUserPoints(channelId, userId);
  } else if (user.username !== username) {
    // Update username if changed
    db.prepare(`
      UPDATE user_points SET username = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(username, user.id);
    user.username = username;
  }

  return user;
}

/**
 * Get leaderboard for a channel
 * @param {number} channelId - Channel ID
 * @param {number} limit - Max results
 * @returns {Array} Top users
 */
function getLeaderboard(channelId, limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM user_points
    WHERE channel_id = ? AND points > 0
    ORDER BY points DESC
    LIMIT ?
  `).all(channelId, limit);
}

/**
 * Get user rank on leaderboard
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {number|null} Rank or null if not found
 */
function getUserRank(channelId, userId) {
  const db = getDb();
  const user = getUserPoints(channelId, userId);
  if (!user) return null;

  const result = db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM user_points
    WHERE channel_id = ? AND points > ?
  `).get(channelId, user.points);

  return result.rank;
}

/**
 * Add points to a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {number} amount - Points to add
 * @param {string} transactionType - Type of transaction
 * @param {string} reason - Reason for transaction
 * @returns {Object} Updated user record
 */
function addPoints(channelId, userId, username, amount, transactionType, reason = null) {
  const db = getDb();

  return db.transaction(() => {
    const user = getOrCreateUser(channelId, userId, username);
    const newBalance = Math.min(user.points + amount, MAX_POINTS);

    db.prepare(`
      UPDATE user_points
      SET points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newBalance, user.id);

    // Log transaction
    db.prepare(`
      INSERT INTO point_transactions (channel_id, user_id, username, amount, balance_after, transaction_type, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(channelId, userId, username, amount, newBalance, transactionType, reason);

    return { ...user, points: newBalance };
  })();
}

/**
 * Remove points from a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {number} amount - Points to remove
 * @param {string} transactionType - Type of transaction
 * @param {string} reason - Reason for transaction
 * @returns {Object|null} Updated user record or null if insufficient
 */
function removePoints(channelId, userId, username, amount, transactionType, reason = null) {
  const db = getDb();

  return db.transaction(() => {
    const user = getOrCreateUser(channelId, userId, username);

    if (user.points < amount) {
      return null; // Insufficient points
    }

    const newBalance = user.points - amount;

    db.prepare(`
      UPDATE user_points
      SET points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newBalance, user.id);

    // Log transaction
    db.prepare(`
      INSERT INTO point_transactions (channel_id, user_id, username, amount, balance_after, transaction_type, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(channelId, userId, username, -amount, newBalance, transactionType, reason);

    return { ...user, points: newBalance };
  })();
}

/**
 * Transfer points between users
 * @param {number} channelId - Channel ID
 * @param {Object} fromUser - From user (id, username)
 * @param {Object} toUser - To user (id, username)
 * @param {number} amount - Points to transfer
 * @returns {Object|null} Result or null if insufficient
 */
function transferPoints(channelId, fromUser, toUser, amount) {
  const db = getDb();

  return db.transaction(() => {
    const sender = getOrCreateUser(channelId, fromUser.id, fromUser.username);

    if (sender.points < amount) {
      return null;
    }

    const receiver = getOrCreateUser(channelId, toUser.id, toUser.username);

    const senderNewBalance = sender.points - amount;
    const receiverNewBalance = Math.min(receiver.points + amount, MAX_POINTS);

    // Update sender
    db.prepare(`
      UPDATE user_points
      SET points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(senderNewBalance, sender.id);

    // Update receiver
    db.prepare(`
      UPDATE user_points
      SET points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(receiverNewBalance, receiver.id);

    // Log transactions
    db.prepare(`
      INSERT INTO point_transactions (channel_id, user_id, username, amount, balance_after, transaction_type, reason, related_user_id)
      VALUES (?, ?, ?, ?, ?, 'transfer_out', 'Transfer to ' || ?, ?)
    `).run(channelId, fromUser.id, fromUser.username, -amount, senderNewBalance, toUser.username, toUser.id);

    db.prepare(`
      INSERT INTO point_transactions (channel_id, user_id, username, amount, balance_after, transaction_type, reason, related_user_id)
      VALUES (?, ?, ?, ?, ?, 'transfer_in', 'Transfer from ' || ?, ?)
    `).run(channelId, toUser.id, toUser.username, amount, receiverNewBalance, fromUser.username, fromUser.id);

    return {
      sender: { ...sender, points: senderNewBalance },
      receiver: { ...receiver, points: receiverNewBalance }
    };
  })();
}

/**
 * Set user points to specific value
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {number} newBalance - New point balance
 * @param {string} reason - Reason
 * @returns {Object} Updated user record
 */
function setPoints(channelId, userId, username, newBalance, reason = 'Admin adjustment') {
  const db = getDb();

  return db.transaction(() => {
    const user = getOrCreateUser(channelId, userId, username);
    const oldBalance = user.points;
    const safeBalance = Math.max(0, Math.min(newBalance, MAX_POINTS));
    const diff = safeBalance - oldBalance;

    db.prepare(`
      UPDATE user_points
      SET points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(safeBalance, user.id);

    // Log transaction
    db.prepare(`
      INSERT INTO point_transactions (channel_id, user_id, username, amount, balance_after, transaction_type, reason)
      VALUES (?, ?, ?, ?, ?, 'admin_set', ?)
    `).run(channelId, userId, username, diff, safeBalance, reason);

    return { ...user, points: safeBalance };
  })();
}

/**
 * Batch add points to multiple users
 * @param {number} channelId - Channel ID
 * @param {Array} users - Array of {userId, username, amount, isSubscriber}
 * @param {Object} settings - Loyalty settings
 */
function batchAddPoints(channelId, users, settings) {
  const db = getDb();

  const insertOrUpdateUser = db.prepare(`
    INSERT INTO user_points (channel_id, user_id, username, points, is_subscriber, last_seen_at, watch_time_minutes)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT watch_time_minutes FROM user_points WHERE channel_id = ? AND user_id = ?), 0) + ?)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET
      username = excluded.username,
      points = MIN(points + excluded.points, ${MAX_POINTS}),
      is_subscriber = excluded.is_subscriber,
      last_seen_at = CURRENT_TIMESTAMP,
      watch_time_minutes = watch_time_minutes + ?,
      updated_at = CURRENT_TIMESTAMP
  `);

  db.transaction(() => {
    for (const user of users) {
      let points = settings.points_per_interval;
      if (user.isSubscriber && settings.subscriber_multiplier > 1) {
        points = Math.floor(points * settings.subscriber_multiplier);
      }

      insertOrUpdateUser.run(
        channelId,
        user.userId,
        user.username,
        points,
        user.isSubscriber ? 1 : 0,
        channelId,
        user.userId,
        settings.interval_minutes,
        settings.interval_minutes
      );
    }
  })();
}

/**
 * Update user activity (message count)
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 */
function recordMessage(channelId, userId, username) {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_points (channel_id, user_id, username, messages_sent, last_seen_at)
    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET
      username = excluded.username,
      messages_sent = messages_sent + 1,
      last_seen_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(channelId, userId, username);
}

/**
 * Get all users for a channel (paginated)
 * @param {number} channelId - Channel ID
 * @param {Object} options - Pagination options
 * @returns {Array} Users
 */
function getUsers(channelId, options = {}) {
  const db = getDb();
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  const sortBy = options.sortBy || 'points';
  const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const validSortColumns = ['points', 'watch_time_minutes', 'messages_sent', 'username', 'last_seen_at'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'points';

  return db.prepare(`
    SELECT * FROM user_points
    WHERE channel_id = ?
    ORDER BY ${sortColumn} ${sortOrder}
    LIMIT ? OFFSET ?
  `).all(channelId, limit, offset);
}

/**
 * Get user count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} User count
 */
function getUserCount(channelId) {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM user_points WHERE channel_id = ?').get(channelId);
  return result.count;
}

/**
 * Search users by username
 * @param {number} channelId - Channel ID
 * @param {string} search - Search term
 * @returns {Array} Matching users
 */
function searchUsers(channelId, search) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM user_points
    WHERE channel_id = ? AND username LIKE ?
    ORDER BY points DESC
    LIMIT 50
  `).all(channelId, `%${search}%`);
}

/**
 * Get transaction history for user
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {number} limit - Max results
 * @returns {Array} Transactions
 */
function getUserTransactions(channelId, userId, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM point_transactions
    WHERE channel_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(channelId, userId, limit);
}

module.exports = {
  // Settings
  getSettings,
  upsertSettings,
  // User points
  getUserPoints,
  getOrCreateUser,
  getLeaderboard,
  getUserRank,
  addPoints,
  removePoints,
  transferPoints,
  setPoints,
  batchAddPoints,
  recordMessage,
  getUsers,
  getUserCount,
  searchUsers,
  getUserTransactions
};
```

### Step 3: Create Loyalty Manager

Create `src/bot/managers/loyalty-manager.js`:

```javascript
/**
 * Loyalty Manager
 * Manages point distribution and viewer tracking
 */
const { createChildLogger } = require('../../utils/logger');
const loyaltyRepo = require('../../database/repositories/loyalty-repo');

const logger = createChildLogger('loyalty-manager');

class LoyaltyManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.channelIntervals = new Map(); // channelId -> intervalId
    this.activeViewers = new Map(); // channelId -> Map(userId -> {username, isSubscriber})
    this.channelSettings = new Map(); // channelId -> settings
    this.channelNames = new Map(); // channelId -> channelName
  }

  /**
   * Start tracking for a channel
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name
   */
  startChannel(channelId, channelName) {
    const settings = loyaltyRepo.getSettings(channelId);
    if (!settings || !settings.is_enabled) {
      logger.debug('Loyalty not enabled for channel', { channelId });
      return;
    }

    this.channelSettings.set(channelId, settings);
    this.channelNames.set(channelId, channelName);
    this.activeViewers.set(channelId, new Map());

    // Start point distribution interval
    const intervalMs = settings.interval_minutes * 60 * 1000;
    const intervalId = setInterval(() => {
      this.distributePoints(channelId);
    }, intervalMs);

    this.channelIntervals.set(channelId, intervalId);

    logger.info('Loyalty tracking started', { channelId, channelName, intervalMinutes: settings.interval_minutes });
  }

  /**
   * Stop tracking for a channel
   * @param {number} channelId - Channel ID
   */
  stopChannel(channelId) {
    const intervalId = this.channelIntervals.get(channelId);
    if (intervalId) {
      clearInterval(intervalId);
      this.channelIntervals.delete(channelId);
    }

    // Distribute remaining points before stopping
    this.distributePoints(channelId);

    this.activeViewers.delete(channelId);
    this.channelSettings.delete(channelId);
    this.channelNames.delete(channelId);

    logger.info('Loyalty tracking stopped', { channelId });
  }

  /**
   * Reload settings for a channel
   * @param {number} channelId - Channel ID
   */
  reloadSettings(channelId) {
    const channelName = this.channelNames.get(channelId);
    if (!channelName) return;

    this.stopChannel(channelId);
    this.startChannel(channelId, channelName);
  }

  /**
   * Record a viewer as active (from chat message)
   * @param {number} channelId - Channel ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {boolean} isSubscriber - Is subscriber
   */
  recordActivity(channelId, userId, username, isSubscriber) {
    const viewers = this.activeViewers.get(channelId);
    if (!viewers) return;

    viewers.set(userId, { username, isSubscriber });

    // Also record message for stats
    loyaltyRepo.recordMessage(channelId, userId, username);
  }

  /**
   * Distribute points to all active viewers
   * @param {number} channelId - Channel ID
   */
  async distributePoints(channelId) {
    const settings = this.channelSettings.get(channelId);
    const viewers = this.activeViewers.get(channelId);
    const channelName = this.channelNames.get(channelId);

    if (!settings || !viewers || viewers.size === 0) {
      return;
    }

    // Check if stream is live (skip if offline earning disabled)
    if (!settings.enable_offline) {
      try {
        const stream = await this.apiClient.streams.getStreamByUserName(channelName);
        if (!stream) {
          logger.debug('Stream offline, skipping point distribution', { channelId });
          return;
        }
      } catch (error) {
        logger.error('Error checking stream status', { channelId, error: error.message });
        return;
      }
    }

    // Convert viewers to array for batch processing
    const viewerArray = Array.from(viewers.entries()).map(([userId, data]) => ({
      userId,
      username: data.username,
      isSubscriber: data.isSubscriber
    }));

    // Batch add points
    loyaltyRepo.batchAddPoints(channelId, viewerArray, settings);

    logger.debug('Points distributed', { channelId, viewerCount: viewerArray.length });

    // Clear active viewers for next interval
    viewers.clear();
  }

  /**
   * Get settings for a channel
   * @param {number} channelId - Channel ID
   * @returns {Object|null} Settings
   */
  getSettings(channelId) {
    return this.channelSettings.get(channelId) || loyaltyRepo.getSettings(channelId);
  }

  /**
   * Check if loyalty is enabled for a channel
   * @param {number} channelId - Channel ID
   * @returns {boolean} Is enabled
   */
  isEnabled(channelId) {
    const settings = this.getSettings(channelId);
    return settings && settings.is_enabled;
  }
}

module.exports = LoyaltyManager;
```

### Step 4: Create Loyalty Handler

Create `src/bot/handlers/loyalty-handler.js`:

```javascript
/**
 * Loyalty Handler
 * Handles chat commands for loyalty points
 */
const { createChildLogger } = require('../../utils/logger');
const loyaltyRepo = require('../../database/repositories/loyalty-repo');

const logger = createChildLogger('loyalty-handler');

// Rate limiting
const checkCooldowns = new Map(); // channelId:userId -> timestamp
const transferCooldowns = new Map();
const CHECK_COOLDOWN_MS = 5000; // 5 seconds
const TRANSFER_COOLDOWN_MS = 30000; // 30 seconds

// Limits
const MAX_TRANSFER_AMOUNT = 1000000;
const MIN_TRANSFER_AMOUNT = 1;

class LoyaltyHandler {
  constructor(chatClient, loyaltyManager) {
    this.chatClient = chatClient;
    this.loyaltyManager = loyaltyManager;
  }

  /**
   * Check if user is moderator or broadcaster
   */
  isModerator(userInfo) {
    return userInfo.isBroadcaster || userInfo.isMod;
  }

  /**
   * Format points with currency name
   */
  formatPoints(amount, settings) {
    const name = amount === 1 ? settings.currency_name : settings.currency_name_plural;
    return `${amount.toLocaleString()} ${name}`;
  }

  /**
   * Handle !points or ![currency] command
   */
  async handlePoints(channelId, channelName, userId, username, args, userInfo) {
    const settings = this.loyaltyManager.getSettings(channelId);
    if (!settings || !settings.is_enabled) return;

    // Rate limit
    const cooldownKey = `${channelId}:${userId}`;
    const lastCheck = checkCooldowns.get(cooldownKey);
    if (lastCheck && Date.now() - lastCheck < CHECK_COOLDOWN_MS) {
      return; // Silent rate limit
    }
    checkCooldowns.set(cooldownKey, Date.now());

    try {
      // Check if looking up another user
      let targetUserId = userId;
      let targetUsername = username;

      if (args.length > 0 && this.isModerator(userInfo)) {
        // Moderators can check other users' points
        const targetName = args[0].replace('@', '').toLowerCase();
        const searchResult = loyaltyRepo.searchUsers(channelId, targetName);
        if (searchResult.length > 0) {
          targetUserId = searchResult[0].user_id;
          targetUsername = searchResult[0].username;
        }
      }

      const user = loyaltyRepo.getUserPoints(channelId, targetUserId);
      if (!user) {
        await this.chatClient.say(channelName, `@${username}, ${targetUsername === username ? 'you have' : targetUsername + ' has'} 0 ${settings.currency_name_plural}.`);
        return;
      }

      const rank = loyaltyRepo.getUserRank(channelId, targetUserId);
      const rankText = rank ? ` (Rank #${rank})` : '';

      await this.chatClient.say(
        channelName,
        `@${username}, ${targetUsername === username ? 'you have' : targetUsername + ' has'} ${this.formatPoints(user.points, settings)}${rankText}`
      );

    } catch (error) {
      logger.error('Error handling !points', { channelId, error: error.message });
    }
  }

  /**
   * Handle !give command
   */
  async handleGive(channelId, channelName, userId, username, args, userInfo) {
    const settings = this.loyaltyManager.getSettings(channelId);
    if (!settings || !settings.is_enabled) return;

    // Rate limit
    const cooldownKey = `${channelId}:${userId}`;
    const lastTransfer = transferCooldowns.get(cooldownKey);
    if (lastTransfer && Date.now() - lastTransfer < TRANSFER_COOLDOWN_MS) {
      await this.chatClient.say(channelName, `@${username}, please wait before giving more ${settings.currency_name_plural}.`);
      return;
    }

    if (args.length < 2) {
      await this.chatClient.say(channelName, `@${username}, usage: !give <user> <amount>`);
      return;
    }

    const targetUsername = args[0].replace('@', '').toLowerCase();
    const amount = parseInt(args[1], 10);

    if (isNaN(amount) || amount < MIN_TRANSFER_AMOUNT) {
      await this.chatClient.say(channelName, `@${username}, please enter a valid amount (minimum ${MIN_TRANSFER_AMOUNT}).`);
      return;
    }

    if (amount > MAX_TRANSFER_AMOUNT) {
      await this.chatClient.say(channelName, `@${username}, maximum transfer is ${MAX_TRANSFER_AMOUNT.toLocaleString()}.`);
      return;
    }

    // Find target user
    const targetUsers = loyaltyRepo.searchUsers(channelId, targetUsername);
    if (targetUsers.length === 0) {
      await this.chatClient.say(channelName, `@${username}, user "${targetUsername}" not found.`);
      return;
    }

    const target = targetUsers[0];

    if (target.user_id === userId) {
      await this.chatClient.say(channelName, `@${username}, you can't give ${settings.currency_name_plural} to yourself!`);
      return;
    }

    try {
      const result = loyaltyRepo.transferPoints(
        channelId,
        { id: userId, username },
        { id: target.user_id, username: target.username },
        amount
      );

      if (!result) {
        await this.chatClient.say(channelName, `@${username}, you don't have enough ${settings.currency_name_plural}.`);
        return;
      }

      transferCooldowns.set(cooldownKey, Date.now());

      await this.chatClient.say(
        channelName,
        `@${username} gave ${this.formatPoints(amount, settings)} to @${target.username}! (${username}: ${result.sender.points.toLocaleString()}, ${target.username}: ${result.receiver.points.toLocaleString()})`
      );

      logger.info('Points transferred', { channelId, from: userId, to: target.user_id, amount });

    } catch (error) {
      logger.error('Error transferring points', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to transfer ${settings.currency_name_plural}.`);
    }
  }

  /**
   * Handle !addpoints command (mod+)
   */
  async handleAddPoints(channelId, channelName, userId, username, args, userInfo) {
    if (!this.isModerator(userInfo)) return;

    const settings = this.loyaltyManager.getSettings(channelId);
    if (!settings || !settings.is_enabled) return;

    if (args.length < 2) {
      await this.chatClient.say(channelName, `@${username}, usage: !addpoints <user> <amount>`);
      return;
    }

    const targetUsername = args[0].replace('@', '').toLowerCase();
    const amount = parseInt(args[1], 10);

    if (isNaN(amount) || amount < 1) {
      await this.chatClient.say(channelName, `@${username}, please enter a valid positive amount.`);
      return;
    }

    // Find or create target user
    const targetUsers = loyaltyRepo.searchUsers(channelId, targetUsername);
    if (targetUsers.length === 0) {
      await this.chatClient.say(channelName, `@${username}, user "${targetUsername}" not found.`);
      return;
    }

    const target = targetUsers[0];

    try {
      const result = loyaltyRepo.addPoints(
        channelId,
        target.user_id,
        target.username,
        amount,
        'admin_add',
        `Added by ${username}`
      );

      await this.chatClient.say(
        channelName,
        `@${username} added ${this.formatPoints(amount, settings)} to @${target.username}. New balance: ${result.points.toLocaleString()}`
      );

      logger.info('Points added by moderator', { channelId, moderator: username, target: target.user_id, amount });

    } catch (error) {
      logger.error('Error adding points', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to add ${settings.currency_name_plural}.`);
    }
  }

  /**
   * Handle !removepoints command (mod+)
   */
  async handleRemovePoints(channelId, channelName, userId, username, args, userInfo) {
    if (!this.isModerator(userInfo)) return;

    const settings = this.loyaltyManager.getSettings(channelId);
    if (!settings || !settings.is_enabled) return;

    if (args.length < 2) {
      await this.chatClient.say(channelName, `@${username}, usage: !removepoints <user> <amount>`);
      return;
    }

    const targetUsername = args[0].replace('@', '').toLowerCase();
    const amount = parseInt(args[1], 10);

    if (isNaN(amount) || amount < 1) {
      await this.chatClient.say(channelName, `@${username}, please enter a valid positive amount.`);
      return;
    }

    const targetUsers = loyaltyRepo.searchUsers(channelId, targetUsername);
    if (targetUsers.length === 0) {
      await this.chatClient.say(channelName, `@${username}, user "${targetUsername}" not found.`);
      return;
    }

    const target = targetUsers[0];

    try {
      const result = loyaltyRepo.removePoints(
        channelId,
        target.user_id,
        target.username,
        amount,
        'admin_remove',
        `Removed by ${username}`
      );

      if (!result) {
        await this.chatClient.say(channelName, `@${username}, ${target.username} doesn't have that many ${settings.currency_name_plural}.`);
        return;
      }

      await this.chatClient.say(
        channelName,
        `@${username} removed ${this.formatPoints(amount, settings)} from @${target.username}. New balance: ${result.points.toLocaleString()}`
      );

      logger.info('Points removed by moderator', { channelId, moderator: username, target: target.user_id, amount });

    } catch (error) {
      logger.error('Error removing points', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to remove ${settings.currency_name_plural}.`);
    }
  }

  /**
   * Handle !leaderboard command
   */
  async handleLeaderboard(channelId, channelName, userId, username, args, userInfo) {
    const settings = this.loyaltyManager.getSettings(channelId);
    if (!settings || !settings.is_enabled) return;

    // Rate limit
    const cooldownKey = `${channelId}:${userId}`;
    const lastCheck = checkCooldowns.get(cooldownKey);
    if (lastCheck && Date.now() - lastCheck < CHECK_COOLDOWN_MS) {
      return;
    }
    checkCooldowns.set(cooldownKey, Date.now());

    try {
      const leaders = loyaltyRepo.getLeaderboard(channelId, 5);

      if (leaders.length === 0) {
        await this.chatClient.say(channelName, `@${username}, no one has any ${settings.currency_name_plural} yet!`);
        return;
      }

      const leaderText = leaders
        .map((u, i) => `${i + 1}. ${u.username} (${u.points.toLocaleString()})`)
        .join(' | ');

      await this.chatClient.say(channelName, `🏆 Top ${settings.currency_name} holders: ${leaderText}`);

    } catch (error) {
      logger.error('Error getting leaderboard', { channelId, error: error.message });
    }
  }

  /**
   * Handle incoming command
   */
  async handleCommand(command, channelId, channelName, userId, username, args, userInfo) {
    const cmd = command.toLowerCase();
    const settings = this.loyaltyManager.getSettings(channelId);

    // Check if command matches currency name
    if (settings && cmd === settings.currency_name.toLowerCase()) {
      await this.handlePoints(channelId, channelName, userId, username, args, userInfo);
      return true;
    }

    switch (cmd) {
      case 'points':
        await this.handlePoints(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'give':
        await this.handleGive(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'addpoints':
        await this.handleAddPoints(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'removepoints':
        await this.handleRemovePoints(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'leaderboard':
      case 'top':
        await this.handleLeaderboard(channelId, channelName, userId, username, args, userInfo);
        return true;

      default:
        return false;
    }
  }
}

module.exports = LoyaltyHandler;
```

### Step 5: Create Web Routes and Views

Create `src/web/routes/loyalty.js` with routes for:
- Settings page (enable/disable, configure currency name, rates, etc.)
- User management page (view all users, search, adjust points)
- Leaderboard page

Create views in `src/web/views/loyalty/`:
- `settings.ejs`
- `users.ejs`
- `leaderboard.ejs`

(Similar patterns to previous task templates)

### Step 6: Register Routes and Integrate

Update `src/web/index.js` and `src/bot/index.js` to register routes and handlers.

## Testing Requirements

### Unit Tests
- Point addition/removal with overflow protection
- Transfer validation
- Batch point distribution
- Settings CRUD

### Integration Tests
- End-to-end point earning
- Command handling
- Web interface operations

### Manual Testing
1. Configure loyalty settings via web
2. Chat to earn points over time
3. Check balance with !points
4. Transfer with !give
5. View leaderboard
6. Moderator add/remove points
7. Verify subscriber multiplier

### Security Testing
- Integer overflow attempts
- Negative point values
- Race condition in transfers
- Rate limiting effectiveness

## Git Commit

**Commit Message:**
```
feat(bot): add loyalty points system

- Add migration 011_loyalty.sql for points tables
- Create loyalty-repo.js with transaction support
- Create loyalty-manager.js for point distribution
- Create loyalty-handler.js for chat commands
- Implement !points, !give, !addpoints, !removepoints, !leaderboard
- Support custom currency names
- Include subscriber multiplier
- Add watch time and message tracking
- Transaction logging for audit trail

Security: Overflow protection, rate limiting, transaction safety
Phase 3 Task 01: Loyalty Points System
```

## Acceptance Criteria

- [ ] Settings configurable via web interface
- [ ] Points automatically distributed to viewers
- [ ] Subscriber multiplier works correctly
- [ ] !points shows balance and rank
- [ ] !give transfers points between users
- [ ] !addpoints and !removepoints work for mods
- [ ] !leaderboard shows top users
- [ ] Custom currency name used in messages
- [ ] Points persisted across bot restarts
- [ ] Transaction history available
- [ ] Integer overflow prevented
- [ ] Rate limiting active
- [ ] No race conditions in transfers
