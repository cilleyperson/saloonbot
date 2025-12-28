# Task 02: Giveaway System

## Task ID
`P3-T02`

## Prerequisites
- Phase 2 completed
- Optional: Loyalty Points System (P3-T01) for entry cost feature

## Objective
Implement a giveaway system that allows channels to run community giveaways with configurable entry requirements and random winner selection.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `frontend-mobile-development:frontend-developer`

## Security Requirements
- Prevent duplicate entries
- Use cryptographically secure random selection
- Verify subscriber/follower status via Twitch API
- Rate limit entry commands
- Prevent giveaway state manipulation
- Validate all input parameters
- Use parameterized queries only

## Twitch API Scopes Required
- `moderator:read:followers` - To verify follower status for follower-only giveaways

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/012_giveaways.sql`:

```sql
-- Migration: 012_giveaways.sql
-- Description: Giveaway system

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  keyword TEXT DEFAULT '!enter',
  status TEXT DEFAULT 'pending',
  subscribers_only INTEGER DEFAULT 0,
  followers_only INTEGER DEFAULT 0,
  subscriber_luck_multiplier INTEGER DEFAULT 1,
  entry_cost INTEGER DEFAULT 0,
  max_entries_per_user INTEGER DEFAULT 1,
  duration_minutes INTEGER,
  winner_user_id TEXT,
  winner_username TEXT,
  total_entries INTEGER DEFAULT 0,
  started_at DATETIME,
  ended_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  is_subscriber INTEGER DEFAULT 0,
  is_follower INTEGER DEFAULT 0,
  entry_count INTEGER DEFAULT 1,
  points_spent INTEGER DEFAULT 0,
  entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE,
  UNIQUE(giveaway_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_giveaways_channel ON giveaways(channel_id);
CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries ON giveaway_entries(giveaway_id);
```

### Step 2: Create Giveaway Repository

Create `src/database/repositories/giveaway-repo.js`:

```javascript
/**
 * Giveaway Repository
 * Data access layer for giveaway system
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('giveaway-repo');

// Giveaway statuses
const STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  ENDED: 'ended',
  CANCELLED: 'cancelled'
};

/**
 * Get active giveaway for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object|undefined} Active giveaway or undefined
 */
function getActiveGiveaway(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM giveaways
    WHERE channel_id = ? AND status = 'active'
    LIMIT 1
  `).get(channelId);
}

/**
 * Get giveaway by ID
 * @param {number} giveawayId - Giveaway ID
 * @returns {Object|undefined} Giveaway or undefined
 */
function getGiveawayById(giveawayId) {
  const db = getDb();
  return db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
}

/**
 * Get giveaway history for a channel
 * @param {number} channelId - Channel ID
 * @param {number} limit - Max results
 * @returns {Array} Past giveaways
 */
function getGiveawayHistory(channelId, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM giveaways
    WHERE channel_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(channelId, limit);
}

/**
 * Create a new giveaway
 * @param {number} channelId - Channel ID
 * @param {Object} data - Giveaway data
 * @returns {number} New giveaway ID
 */
function createGiveaway(channelId, data) {
  const db = getDb();

  // Check for existing active giveaway
  const existing = getActiveGiveaway(channelId);
  if (existing) {
    throw new Error('A giveaway is already active');
  }

  const result = db.prepare(`
    INSERT INTO giveaways (
      channel_id, title, keyword, status, subscribers_only, followers_only,
      subscriber_luck_multiplier, entry_cost, max_entries_per_user, duration_minutes,
      started_at, created_by
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
  `).run(
    channelId,
    data.title,
    data.keyword || '!enter',
    data.subscribersOnly ? 1 : 0,
    data.followersOnly ? 1 : 0,
    data.subscriberLuckMultiplier || 1,
    data.entryCost || 0,
    data.maxEntriesPerUser || 1,
    data.durationMinutes || null,
    data.createdBy || null
  );

  return result.lastInsertRowid;
}

/**
 * Start a pending giveaway
 * @param {number} giveawayId - Giveaway ID
 * @returns {boolean} Success
 */
function startGiveaway(giveawayId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE giveaways
    SET status = 'active', started_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).run(giveawayId);
  return result.changes > 0;
}

/**
 * End a giveaway and record winner
 * @param {number} giveawayId - Giveaway ID
 * @param {Object|null} winner - Winner info {userId, username} or null
 * @returns {boolean} Success
 */
function endGiveaway(giveawayId, winner) {
  const db = getDb();

  // Get total entries
  const entryCount = db.prepare(`
    SELECT SUM(entry_count) as total FROM giveaway_entries WHERE giveaway_id = ?
  `).get(giveawayId);

  const result = db.prepare(`
    UPDATE giveaways
    SET status = 'ended',
        winner_user_id = ?,
        winner_username = ?,
        total_entries = ?,
        ended_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'active'
  `).run(
    winner ? winner.userId : null,
    winner ? winner.username : null,
    entryCount.total || 0,
    giveawayId
  );

  return result.changes > 0;
}

/**
 * Cancel a giveaway
 * @param {number} giveawayId - Giveaway ID
 * @returns {boolean} Success
 */
function cancelGiveaway(giveawayId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE giveaways
    SET status = 'cancelled', ended_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'active')
  `).run(giveawayId);
  return result.changes > 0;
}

/**
 * Add an entry to a giveaway
 * @param {number} giveawayId - Giveaway ID
 * @param {Object} user - User info
 * @returns {Object} Result with success and entry count
 */
function addEntry(giveawayId, user) {
  const db = getDb();
  const giveaway = getGiveawayById(giveawayId);

  if (!giveaway || giveaway.status !== 'active') {
    return { success: false, reason: 'Giveaway not active' };
  }

  // Check existing entry
  const existing = db.prepare(`
    SELECT * FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?
  `).get(giveawayId, user.userId);

  if (existing) {
    // Check if can add more entries
    if (existing.entry_count >= giveaway.max_entries_per_user) {
      return { success: false, reason: 'Already entered maximum times' };
    }

    // Add additional entry
    db.prepare(`
      UPDATE giveaway_entries
      SET entry_count = entry_count + 1, points_spent = points_spent + ?
      WHERE giveaway_id = ? AND user_id = ?
    `).run(user.pointsSpent || 0, giveawayId, user.userId);

    return { success: true, entryCount: existing.entry_count + 1 };
  }

  // Create new entry
  db.prepare(`
    INSERT INTO giveaway_entries (giveaway_id, user_id, username, is_subscriber, is_follower, entry_count, points_spent)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(
    giveawayId,
    user.userId,
    user.username,
    user.isSubscriber ? 1 : 0,
    user.isFollower ? 1 : 0,
    user.pointsSpent || 0
  );

  return { success: true, entryCount: 1 };
}

/**
 * Get all entries for a giveaway
 * @param {number} giveawayId - Giveaway ID
 * @returns {Array} Entries
 */
function getEntries(giveawayId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM giveaway_entries
    WHERE giveaway_id = ?
    ORDER BY entered_at ASC
  `).all(giveawayId);
}

/**
 * Get entry count for a giveaway
 * @param {number} giveawayId - Giveaway ID
 * @returns {number} Total entries (weighted)
 */
function getEntryCount(giveawayId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT SUM(entry_count) as total FROM giveaway_entries WHERE giveaway_id = ?
  `).get(giveawayId);
  return result.total || 0;
}

/**
 * Get unique entrant count
 * @param {number} giveawayId - Giveaway ID
 * @returns {number} Unique users
 */
function getEntrantCount(giveawayId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM giveaway_entries WHERE giveaway_id = ?
  `).get(giveawayId);
  return result.count;
}

/**
 * Select a random winner
 * @param {number} giveawayId - Giveaway ID
 * @param {number} subscriberMultiplier - Extra entries for subscribers
 * @returns {Object|null} Winner entry or null
 */
function selectRandomWinner(giveawayId, subscriberMultiplier = 1) {
  const db = getDb();
  const entries = getEntries(giveawayId);

  if (entries.length === 0) {
    return null;
  }

  // Build weighted entry pool
  const pool = [];
  for (const entry of entries) {
    let tickets = entry.entry_count;
    if (entry.is_subscriber && subscriberMultiplier > 1) {
      tickets *= subscriberMultiplier;
    }
    for (let i = 0; i < tickets; i++) {
      pool.push(entry);
    }
  }

  if (pool.length === 0) {
    return null;
  }

  // Cryptographically secure random selection
  const crypto = require('crypto');
  const randomIndex = crypto.randomInt(0, pool.length);

  return pool[randomIndex];
}

/**
 * Check if user has entered a giveaway
 * @param {number} giveawayId - Giveaway ID
 * @param {string} userId - User ID
 * @returns {Object|undefined} Entry or undefined
 */
function getUserEntry(giveawayId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?
  `).get(giveawayId, userId);
}

/**
 * Delete all entries for a giveaway
 * @param {number} giveawayId - Giveaway ID
 */
function clearEntries(giveawayId) {
  const db = getDb();
  db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ?').run(giveawayId);
}

module.exports = {
  STATUS,
  getActiveGiveaway,
  getGiveawayById,
  getGiveawayHistory,
  createGiveaway,
  startGiveaway,
  endGiveaway,
  cancelGiveaway,
  addEntry,
  getEntries,
  getEntryCount,
  getEntrantCount,
  selectRandomWinner,
  getUserEntry,
  clearEntries
};
```

### Step 3: Create Giveaway Handler

Create `src/bot/handlers/giveaway-handler.js`:

```javascript
/**
 * Giveaway Handler
 * Handles chat commands for giveaways
 */
const { createChildLogger } = require('../../utils/logger');
const giveawayRepo = require('../../database/repositories/giveaway-repo');
const loyaltyRepo = require('../../database/repositories/loyalty-repo');

const logger = createChildLogger('giveaway-handler');

// Rate limiting
const entryCooldowns = new Map(); // giveawayId:userId -> timestamp
const ENTRY_COOLDOWN_MS = 2000; // 2 seconds between entry attempts

// Active giveaway timers
const giveawayTimers = new Map(); // giveawayId -> timeoutId

class GiveawayHandler {
  constructor(chatClient, apiClient, loyaltyManager = null) {
    this.chatClient = chatClient;
    this.apiClient = apiClient;
    this.loyaltyManager = loyaltyManager;
  }

  /**
   * Check if user is moderator or broadcaster
   */
  isModerator(userInfo) {
    return userInfo.isBroadcaster || userInfo.isMod;
  }

  /**
   * Handle giveaway entry (keyword command)
   */
  async handleEntry(giveaway, channelName, userId, username, userInfo) {
    // Rate limit
    const cooldownKey = `${giveaway.id}:${userId}`;
    const lastEntry = entryCooldowns.get(cooldownKey);
    if (lastEntry && Date.now() - lastEntry < ENTRY_COOLDOWN_MS) {
      return; // Silent rate limit
    }
    entryCooldowns.set(cooldownKey, Date.now());

    try {
      // Check subscriber requirement
      if (giveaway.subscribers_only && !userInfo.isSubscriber) {
        await this.chatClient.say(channelName, `@${username}, this giveaway is for subscribers only!`);
        return;
      }

      // Check follower requirement
      if (giveaway.followers_only) {
        const isFollower = await this.checkFollower(channelName, userId);
        if (!isFollower) {
          await this.chatClient.say(channelName, `@${username}, this giveaway is for followers only!`);
          return;
        }
      }

      // Check entry cost (loyalty points)
      if (giveaway.entry_cost > 0 && this.loyaltyManager) {
        const user = loyaltyRepo.getUserPoints(giveaway.channel_id, userId);
        if (!user || user.points < giveaway.entry_cost) {
          const settings = this.loyaltyManager.getSettings(giveaway.channel_id);
          const currencyName = settings ? settings.currency_name_plural : 'points';
          await this.chatClient.say(
            channelName,
            `@${username}, you need ${giveaway.entry_cost} ${currencyName} to enter!`
          );
          return;
        }

        // Deduct points
        loyaltyRepo.removePoints(
          giveaway.channel_id,
          userId,
          username,
          giveaway.entry_cost,
          'giveaway_entry',
          `Entry for: ${giveaway.title}`
        );
      }

      // Add entry
      const result = giveawayRepo.addEntry(giveaway.id, {
        userId,
        username,
        isSubscriber: userInfo.isSubscriber,
        isFollower: true, // Already verified above if required
        pointsSpent: giveaway.entry_cost || 0
      });

      if (!result.success) {
        // Refund points if entry failed
        if (giveaway.entry_cost > 0 && this.loyaltyManager) {
          loyaltyRepo.addPoints(
            giveaway.channel_id,
            userId,
            username,
            giveaway.entry_cost,
            'giveaway_refund',
            'Entry failed - refund'
          );
        }

        if (result.reason === 'Already entered maximum times') {
          await this.chatClient.say(channelName, `@${username}, you've already entered the maximum number of times!`);
        }
        return;
      }

      // Confirmation (only for first entry)
      if (result.entryCount === 1) {
        const entrantCount = giveawayRepo.getEntrantCount(giveaway.id);
        await this.chatClient.say(
          channelName,
          `@${username}, you've entered the giveaway! (${entrantCount} entrants)`
        );
      }

      logger.debug('Giveaway entry recorded', { giveawayId: giveaway.id, userId, username });

    } catch (error) {
      logger.error('Error processing giveaway entry', { error: error.message });
    }
  }

  /**
   * Handle !giveaway command
   */
  async handleGiveaway(channelId, channelName, userId, username, args, userInfo) {
    if (!this.isModerator(userInfo)) return;

    if (args.length === 0) {
      await this.chatClient.say(
        channelName,
        `@${username}, usage: !giveaway start <title> | !giveaway end | !giveaway reroll | !giveaway cancel`
      );
      return;
    }

    const subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case 'start':
        await this.handleStart(channelId, channelName, userId, username, args.slice(1), userInfo);
        break;

      case 'end':
        await this.handleEnd(channelId, channelName, userId, username);
        break;

      case 'reroll':
        await this.handleReroll(channelId, channelName, userId, username);
        break;

      case 'cancel':
        await this.handleCancel(channelId, channelName, userId, username);
        break;

      case 'info':
        await this.handleInfo(channelId, channelName, userId, username);
        break;

      default:
        await this.chatClient.say(channelName, `@${username}, unknown giveaway command: ${subCommand}`);
    }
  }

  /**
   * Handle !giveaway start
   */
  async handleStart(channelId, channelName, userId, username, args, userInfo) {
    // Check for existing giveaway
    const existing = giveawayRepo.getActiveGiveaway(channelId);
    if (existing) {
      await this.chatClient.say(channelName, `@${username}, a giveaway is already active! Use !giveaway end first.`);
      return;
    }

    const title = args.join(' ') || 'Giveaway';

    try {
      const giveawayId = giveawayRepo.createGiveaway(channelId, {
        title,
        keyword: '!enter',
        createdBy: username
      });

      await this.chatClient.say(
        channelName,
        `🎉 GIVEAWAY STARTED: ${title}! Type !enter to join!`
      );

      logger.info('Giveaway started', { channelId, giveawayId, title, startedBy: username });

    } catch (error) {
      logger.error('Error starting giveaway', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to start giveaway.`);
    }
  }

  /**
   * Handle !giveaway end
   */
  async handleEnd(channelId, channelName, userId, username) {
    const giveaway = giveawayRepo.getActiveGiveaway(channelId);
    if (!giveaway) {
      await this.chatClient.say(channelName, `@${username}, no active giveaway to end.`);
      return;
    }

    try {
      const winner = giveawayRepo.selectRandomWinner(giveaway.id, giveaway.subscriber_luck_multiplier);

      giveawayRepo.endGiveaway(giveaway.id, winner ? {
        userId: winner.user_id,
        username: winner.username
      } : null);

      const entrantCount = giveawayRepo.getEntrantCount(giveaway.id);

      if (winner) {
        await this.chatClient.say(
          channelName,
          `🎉 GIVEAWAY ENDED! The winner of "${giveaway.title}" is @${winner.username}! Congratulations! (${entrantCount} entrants)`
        );
      } else {
        await this.chatClient.say(
          channelName,
          `Giveaway "${giveaway.title}" ended with no entries.`
        );
      }

      logger.info('Giveaway ended', { giveawayId: giveaway.id, winner: winner?.username, entrantCount });

    } catch (error) {
      logger.error('Error ending giveaway', { giveawayId: giveaway.id, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to end giveaway.`);
    }
  }

  /**
   * Handle !giveaway reroll
   */
  async handleReroll(channelId, channelName, userId, username) {
    // Get most recent ended giveaway
    const history = giveawayRepo.getGiveawayHistory(channelId, 1);
    const lastGiveaway = history.find(g => g.status === 'ended');

    if (!lastGiveaway) {
      await this.chatClient.say(channelName, `@${username}, no recent giveaway to reroll.`);
      return;
    }

    try {
      const winner = giveawayRepo.selectRandomWinner(lastGiveaway.id, lastGiveaway.subscriber_luck_multiplier);

      if (winner) {
        await this.chatClient.say(
          channelName,
          `🎲 REROLL! The new winner of "${lastGiveaway.title}" is @${winner.username}! Congratulations!`
        );
        logger.info('Giveaway rerolled', { giveawayId: lastGiveaway.id, newWinner: winner.username });
      } else {
        await this.chatClient.say(channelName, `@${username}, no other entries to pick from.`);
      }

    } catch (error) {
      logger.error('Error rerolling giveaway', { error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to reroll.`);
    }
  }

  /**
   * Handle !giveaway cancel
   */
  async handleCancel(channelId, channelName, userId, username) {
    const giveaway = giveawayRepo.getActiveGiveaway(channelId);
    if (!giveaway) {
      await this.chatClient.say(channelName, `@${username}, no active giveaway to cancel.`);
      return;
    }

    try {
      // Refund points if applicable
      if (giveaway.entry_cost > 0 && this.loyaltyManager) {
        const entries = giveawayRepo.getEntries(giveaway.id);
        for (const entry of entries) {
          if (entry.points_spent > 0) {
            loyaltyRepo.addPoints(
              channelId,
              entry.user_id,
              entry.username,
              entry.points_spent,
              'giveaway_refund',
              `Cancelled giveaway: ${giveaway.title}`
            );
          }
        }
      }

      giveawayRepo.cancelGiveaway(giveaway.id);

      await this.chatClient.say(
        channelName,
        `Giveaway "${giveaway.title}" has been cancelled.${giveaway.entry_cost > 0 ? ' Points have been refunded.' : ''}`
      );

      logger.info('Giveaway cancelled', { giveawayId: giveaway.id, cancelledBy: username });

    } catch (error) {
      logger.error('Error cancelling giveaway', { error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to cancel giveaway.`);
    }
  }

  /**
   * Handle !giveaway info
   */
  async handleInfo(channelId, channelName, userId, username) {
    const giveaway = giveawayRepo.getActiveGiveaway(channelId);
    if (!giveaway) {
      await this.chatClient.say(channelName, `@${username}, no active giveaway.`);
      return;
    }

    const entrantCount = giveawayRepo.getEntrantCount(giveaway.id);
    const entryCount = giveawayRepo.getEntryCount(giveaway.id);

    let info = `🎉 "${giveaway.title}" - ${entrantCount} entrants (${entryCount} entries)`;

    if (giveaway.subscribers_only) info += ' [Subs Only]';
    if (giveaway.followers_only) info += ' [Followers Only]';
    if (giveaway.entry_cost > 0) info += ` [${giveaway.entry_cost} pts]`;

    await this.chatClient.say(channelName, info);
  }

  /**
   * Check if user is a follower
   */
  async checkFollower(channelName, userId) {
    try {
      const follow = await this.apiClient.users.getFollowFromUserToBroadcaster(userId, channelName);
      return !!follow;
    } catch (error) {
      logger.error('Error checking follower status', { error: error.message });
      return true; // Default to allowing on error
    }
  }

  /**
   * Handle incoming message for giveaway entry
   */
  async handleMessage(channelId, channelName, userId, username, message, userInfo) {
    const giveaway = giveawayRepo.getActiveGiveaway(channelId);
    if (!giveaway) return false;

    // Check if message matches entry keyword
    const keyword = giveaway.keyword.toLowerCase();
    if (message.toLowerCase().trim() === keyword) {
      await this.handleEntry(giveaway, channelName, userId, username, userInfo);
      return true;
    }

    return false;
  }

  /**
   * Handle !giveaway command routing
   */
  async handleCommand(command, channelId, channelName, userId, username, args, userInfo) {
    if (command.toLowerCase() === 'giveaway') {
      await this.handleGiveaway(channelId, channelName, userId, username, args, userInfo);
      return true;
    }

    // Check for entry command
    const giveaway = giveawayRepo.getActiveGiveaway(channelId);
    if (giveaway && command.toLowerCase() === giveaway.keyword.replace('!', '').toLowerCase()) {
      await this.handleEntry(giveaway, channelName, userId, username, userInfo);
      return true;
    }

    return false;
  }
}

module.exports = GiveawayHandler;
```

### Step 4: Create Web Routes and Views

Create routes and views for web-based giveaway management (settings, quick start, history view).

### Step 5: Integrate with Bot Core

Register the handler and connect entry detection.

## Testing Requirements

### Unit Tests
- Entry validation (subscriber, follower checks)
- Weighted random selection
- Point deduction and refunds
- Duplicate entry prevention

### Integration Tests
- Full giveaway flow
- Entry via chat
- Winner selection
- Web interface

### Manual Testing
1. !giveaway start Test Giveaway
2. Enter with !enter
3. Verify entry count
4. !giveaway end - verify winner
5. !giveaway reroll
6. Test subscriber-only mode
7. Test entry cost with points

### Security Testing
- Rate limiting on entries
- Random selection fairness
- Prevent manipulation
- CSRF on web forms

## Git Commit

**Commit Message:**
```
feat(bot): add giveaway system

- Add migration 012_giveaways.sql
- Create giveaway-repo.js with secure random selection
- Create giveaway-handler.js for chat commands
- Implement !giveaway start/end/reroll/cancel
- Support subscriber/follower requirements
- Optional entry cost with loyalty points
- Subscriber luck multiplier
- Web interface for management

Security: Crypto random selection, rate limiting, entry validation
Phase 3 Task 02: Giveaway System
```

## Acceptance Criteria

- [ ] !giveaway start creates new giveaway
- [ ] Entry keyword registers entries
- [ ] Duplicate entries prevented
- [ ] Subscriber-only giveaways work
- [ ] Follower-only giveaways work
- [ ] Entry cost deducts/refunds points
- [ ] Random winner selection is fair
- [ ] !giveaway end picks and announces winner
- [ ] !giveaway reroll picks new winner
- [ ] !giveaway cancel refunds points
- [ ] Web interface shows history
- [ ] Rate limiting prevents spam
- [ ] All forms have CSRF protection
