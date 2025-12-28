# Task 03: Viewer Queue System

## Task ID
`P3-T03`

## Prerequisites
- Phase 2 completed
- Understanding of chat command patterns

## Objective
Implement a viewer queue system for managing viewer participation in games, allowing viewers to join a queue and streamers to pick participants.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `frontend-mobile-development:frontend-developer`

## Security Requirements
- Prevent queue position manipulation
- Validate queue size limits
- Rate limit join/leave commands
- Secure random selection for picks
- Verify channel ownership on all operations
- Use parameterized queries only

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/013_queue.sql`:

```sql
-- Migration: 013_queue.sql
-- Description: Viewer queue system

CREATE TABLE IF NOT EXISTS queue_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL UNIQUE,
  is_open INTEGER DEFAULT 0,
  max_size INTEGER DEFAULT 50,
  subscriber_priority INTEGER DEFAULT 0,
  allow_multiple_entries INTEGER DEFAULT 0,
  custom_join_command TEXT DEFAULT 'join',
  announcement_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  is_subscriber INTEGER DEFAULT 0,
  position INTEGER NOT NULL,
  note TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_entries_channel ON queue_entries(channel_id);
CREATE INDEX IF NOT EXISTS idx_queue_entries_position ON queue_entries(channel_id, position);
```

### Step 2: Create Queue Repository

Create `src/database/repositories/queue-repo.js`:

```javascript
/**
 * Queue Repository
 * Data access layer for viewer queue system
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('queue-repo');

// ============================================
// Settings Functions
// ============================================

/**
 * Get queue settings for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object} Settings (with defaults if not set)
 */
function getSettings(channelId) {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM queue_settings WHERE channel_id = ?').get(channelId);

  if (!settings) {
    return {
      channel_id: channelId,
      is_open: 0,
      max_size: 50,
      subscriber_priority: 0,
      allow_multiple_entries: 0,
      custom_join_command: 'join',
      announcement_message: null
    };
  }

  return settings;
}

/**
 * Update queue settings
 * @param {number} channelId - Channel ID
 * @param {Object} settings - Settings to update
 */
function updateSettings(channelId, settings) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM queue_settings WHERE channel_id = ?').get(channelId);

  if (existing) {
    db.prepare(`
      UPDATE queue_settings SET
        is_open = COALESCE(?, is_open),
        max_size = COALESCE(?, max_size),
        subscriber_priority = COALESCE(?, subscriber_priority),
        allow_multiple_entries = COALESCE(?, allow_multiple_entries),
        custom_join_command = COALESCE(?, custom_join_command),
        announcement_message = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE channel_id = ?
    `).run(
      settings.isOpen !== undefined ? (settings.isOpen ? 1 : 0) : null,
      settings.maxSize || null,
      settings.subscriberPriority !== undefined ? (settings.subscriberPriority ? 1 : 0) : null,
      settings.allowMultipleEntries !== undefined ? (settings.allowMultipleEntries ? 1 : 0) : null,
      settings.customJoinCommand || null,
      settings.announcementMessage || null,
      channelId
    );
  } else {
    db.prepare(`
      INSERT INTO queue_settings (channel_id, is_open, max_size, subscriber_priority, allow_multiple_entries, custom_join_command, announcement_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      channelId,
      settings.isOpen ? 1 : 0,
      settings.maxSize || 50,
      settings.subscriberPriority ? 1 : 0,
      settings.allowMultipleEntries ? 1 : 0,
      settings.customJoinCommand || 'join',
      settings.announcementMessage || null
    );
  }
}

/**
 * Open the queue
 * @param {number} channelId - Channel ID
 */
function openQueue(channelId) {
  const db = getDb();
  updateSettings(channelId, { isOpen: true });
}

/**
 * Close the queue
 * @param {number} channelId - Channel ID
 */
function closeQueue(channelId) {
  const db = getDb();
  updateSettings(channelId, { isOpen: false });
}

/**
 * Check if queue is open
 * @param {number} channelId - Channel ID
 * @returns {boolean} Is open
 */
function isQueueOpen(channelId) {
  const settings = getSettings(channelId);
  return settings.is_open === 1;
}

// ============================================
// Queue Entry Functions
// ============================================

/**
 * Get all queue entries for a channel
 * @param {number} channelId - Channel ID
 * @returns {Array} Queue entries in order
 */
function getQueue(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM queue_entries
    WHERE channel_id = ?
    ORDER BY position ASC
  `).all(channelId);
}

/**
 * Get queue size
 * @param {number} channelId - Channel ID
 * @returns {number} Queue size
 */
function getQueueSize(channelId) {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM queue_entries WHERE channel_id = ?').get(channelId);
  return result.count;
}

/**
 * Get user's entry in queue
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {Object|undefined} Entry or undefined
 */
function getUserEntry(channelId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM queue_entries
    WHERE channel_id = ? AND user_id = ?
  `).get(channelId, userId);
}

/**
 * Get user's position in queue
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {number|null} Position (1-based) or null
 */
function getUserPosition(channelId, userId) {
  const entry = getUserEntry(channelId, userId);
  return entry ? entry.position : null;
}

/**
 * Add user to queue
 * @param {number} channelId - Channel ID
 * @param {Object} user - User info
 * @returns {Object} Result with success and position
 */
function joinQueue(channelId, user) {
  const db = getDb();
  const settings = getSettings(channelId);

  // Check if queue is open
  if (!settings.is_open) {
    return { success: false, reason: 'Queue is closed' };
  }

  // Check if already in queue
  const existing = getUserEntry(channelId, user.userId);
  if (existing && !settings.allow_multiple_entries) {
    return { success: false, reason: 'Already in queue', position: existing.position };
  }

  // Check queue size
  const currentSize = getQueueSize(channelId);
  if (currentSize >= settings.max_size) {
    return { success: false, reason: 'Queue is full' };
  }

  // Determine position
  let position;
  if (settings.subscriber_priority && user.isSubscriber) {
    // Find first non-subscriber position
    const firstNonSub = db.prepare(`
      SELECT MIN(position) as pos FROM queue_entries
      WHERE channel_id = ? AND is_subscriber = 0
    `).get(channelId);

    if (firstNonSub.pos !== null) {
      position = firstNonSub.pos;
      // Shift non-subscribers down
      db.prepare(`
        UPDATE queue_entries
        SET position = position + 1
        WHERE channel_id = ? AND position >= ?
      `).run(channelId, position);
    } else {
      position = currentSize + 1;
    }
  } else {
    position = currentSize + 1;
  }

  // Add entry
  db.prepare(`
    INSERT INTO queue_entries (channel_id, user_id, username, is_subscriber, position, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    channelId,
    user.userId,
    user.username,
    user.isSubscriber ? 1 : 0,
    position,
    user.note || null
  );

  return { success: true, position };
}

/**
 * Remove user from queue
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {boolean} Success
 */
function leaveQueue(channelId, userId) {
  const db = getDb();
  const entry = getUserEntry(channelId, userId);

  if (!entry) {
    return false;
  }

  db.transaction(() => {
    // Remove entry
    db.prepare('DELETE FROM queue_entries WHERE channel_id = ? AND user_id = ?').run(channelId, userId);

    // Shift positions
    db.prepare(`
      UPDATE queue_entries
      SET position = position - 1
      WHERE channel_id = ? AND position > ?
    `).run(channelId, entry.position);
  })();

  return true;
}

/**
 * Get next person in queue
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Next entry or null
 */
function getNext(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM queue_entries
    WHERE channel_id = ?
    ORDER BY position ASC
    LIMIT 1
  `).get(channelId);
}

/**
 * Pick (remove and return) next person
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Picked entry or null
 */
function pickNext(channelId) {
  const db = getDb();

  return db.transaction(() => {
    const next = getNext(channelId);
    if (!next) return null;

    // Remove from queue
    db.prepare('DELETE FROM queue_entries WHERE id = ?').run(next.id);

    // Shift positions
    db.prepare(`
      UPDATE queue_entries
      SET position = position - 1
      WHERE channel_id = ? AND position > 1
    `).run(channelId);

    return next;
  })();
}

/**
 * Pick multiple people from queue
 * @param {number} channelId - Channel ID
 * @param {number} count - Number to pick
 * @returns {Array} Picked entries
 */
function pickMultiple(channelId, count) {
  const picked = [];
  for (let i = 0; i < count; i++) {
    const next = pickNext(channelId);
    if (!next) break;
    picked.push(next);
  }
  return picked;
}

/**
 * Pick a random person from queue
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Picked entry or null
 */
function pickRandom(channelId) {
  const db = getDb();
  const crypto = require('crypto');

  return db.transaction(() => {
    const entries = getQueue(channelId);
    if (entries.length === 0) return null;

    const randomIndex = crypto.randomInt(0, entries.length);
    const selected = entries[randomIndex];

    // Remove from queue
    db.prepare('DELETE FROM queue_entries WHERE id = ?').run(selected.id);

    // Shift positions
    db.prepare(`
      UPDATE queue_entries
      SET position = position - 1
      WHERE channel_id = ? AND position > ?
    `).run(channelId, selected.position);

    return selected;
  })();
}

/**
 * Clear the entire queue
 * @param {number} channelId - Channel ID
 * @returns {number} Number removed
 */
function clearQueue(channelId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM queue_entries WHERE channel_id = ?').run(channelId);
  return result.changes;
}

/**
 * Move user to specific position
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {number} newPosition - New position (1-based)
 * @returns {boolean} Success
 */
function moveUser(channelId, userId, newPosition) {
  const db = getDb();
  const entry = getUserEntry(channelId, userId);

  if (!entry) return false;

  const queueSize = getQueueSize(channelId);
  if (newPosition < 1 || newPosition > queueSize) return false;

  if (entry.position === newPosition) return true;

  db.transaction(() => {
    const oldPosition = entry.position;

    if (newPosition < oldPosition) {
      // Moving up - shift others down
      db.prepare(`
        UPDATE queue_entries
        SET position = position + 1
        WHERE channel_id = ? AND position >= ? AND position < ?
      `).run(channelId, newPosition, oldPosition);
    } else {
      // Moving down - shift others up
      db.prepare(`
        UPDATE queue_entries
        SET position = position - 1
        WHERE channel_id = ? AND position > ? AND position <= ?
      `).run(channelId, oldPosition, newPosition);
    }

    // Update user's position
    db.prepare(`
      UPDATE queue_entries
      SET position = ?
      WHERE channel_id = ? AND user_id = ?
    `).run(newPosition, channelId, userId);
  })();

  return true;
}

module.exports = {
  // Settings
  getSettings,
  updateSettings,
  openQueue,
  closeQueue,
  isQueueOpen,
  // Queue operations
  getQueue,
  getQueueSize,
  getUserEntry,
  getUserPosition,
  joinQueue,
  leaveQueue,
  getNext,
  pickNext,
  pickMultiple,
  pickRandom,
  clearQueue,
  moveUser
};
```

### Step 3: Create Queue Handler

Create `src/bot/handlers/queue-handler.js`:

```javascript
/**
 * Queue Handler
 * Handles chat commands for viewer queue
 */
const { createChildLogger } = require('../../utils/logger');
const queueRepo = require('../../database/repositories/queue-repo');

const logger = createChildLogger('queue-handler');

// Rate limiting
const joinCooldowns = new Map(); // channelId:userId -> timestamp
const JOIN_COOLDOWN_MS = 3000; // 3 seconds

class QueueHandler {
  constructor(chatClient) {
    this.chatClient = chatClient;
  }

  /**
   * Check if user is moderator or broadcaster
   */
  isModerator(userInfo) {
    return userInfo.isBroadcaster || userInfo.isMod;
  }

  /**
   * Handle !join command
   */
  async handleJoin(channelId, channelName, userId, username, args, userInfo) {
    // Rate limit
    const cooldownKey = `${channelId}:${userId}`;
    const lastJoin = joinCooldowns.get(cooldownKey);
    if (lastJoin && Date.now() - lastJoin < JOIN_COOLDOWN_MS) {
      return; // Silent rate limit
    }
    joinCooldowns.set(cooldownKey, Date.now());

    try {
      const note = args.join(' ').substring(0, 100) || null; // Optional note

      const result = queueRepo.joinQueue(channelId, {
        userId,
        username,
        isSubscriber: userInfo.isSubscriber,
        note
      });

      if (!result.success) {
        switch (result.reason) {
          case 'Queue is closed':
            await this.chatClient.say(channelName, `@${username}, the queue is currently closed.`);
            break;
          case 'Already in queue':
            await this.chatClient.say(channelName, `@${username}, you're already in the queue at position #${result.position}!`);
            break;
          case 'Queue is full':
            await this.chatClient.say(channelName, `@${username}, the queue is full!`);
            break;
        }
        return;
      }

      await this.chatClient.say(
        channelName,
        `@${username}, you've joined the queue at position #${result.position}!`
      );

      logger.debug('User joined queue', { channelId, userId, position: result.position });

    } catch (error) {
      logger.error('Error joining queue', { channelId, error: error.message });
    }
  }

  /**
   * Handle !leave command
   */
  async handleLeave(channelId, channelName, userId, username) {
    try {
      const success = queueRepo.leaveQueue(channelId, userId);

      if (success) {
        await this.chatClient.say(channelName, `@${username}, you've left the queue.`);
        logger.debug('User left queue', { channelId, userId });
      } else {
        await this.chatClient.say(channelName, `@${username}, you're not in the queue.`);
      }

    } catch (error) {
      logger.error('Error leaving queue', { channelId, error: error.message });
    }
  }

  /**
   * Handle !position / !queue command
   */
  async handlePosition(channelId, channelName, userId, username) {
    try {
      const position = queueRepo.getUserPosition(channelId, userId);
      const queueSize = queueRepo.getQueueSize(channelId);

      if (position !== null) {
        await this.chatClient.say(
          channelName,
          `@${username}, you're #${position} in the queue (${queueSize} total)`
        );
      } else {
        const isOpen = queueRepo.isQueueOpen(channelId);
        if (isOpen) {
          await this.chatClient.say(
            channelName,
            `@${username}, you're not in the queue. Type !join to join! (${queueSize} in queue)`
          );
        } else {
          await this.chatClient.say(
            channelName,
            `@${username}, you're not in the queue. The queue is currently closed. (${queueSize} waiting)`
          );
        }
      }

    } catch (error) {
      logger.error('Error checking position', { channelId, error: error.message });
    }
  }

  /**
   * Handle !next command (mod+)
   */
  async handleNext(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      const next = queueRepo.pickNext(channelId);

      if (next) {
        const noteText = next.note ? ` (Note: ${next.note})` : '';
        await this.chatClient.say(
          channelName,
          `🎮 Next up: @${next.username}!${noteText}`
        );
        logger.info('Picked next from queue', { channelId, picked: next.username });
      } else {
        await this.chatClient.say(channelName, `@${username}, the queue is empty!`);
      }

    } catch (error) {
      logger.error('Error picking next', { channelId, error: error.message });
    }
  }

  /**
   * Handle !pick command (mod+)
   */
  async handlePick(channelId, channelName, userId, username, args, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      const countArg = args[0];

      // Check if picking random
      if (countArg === 'random') {
        const picked = queueRepo.pickRandom(channelId);
        if (picked) {
          const noteText = picked.note ? ` (Note: ${picked.note})` : '';
          await this.chatClient.say(
            channelName,
            `🎲 Randomly selected: @${picked.username}!${noteText}`
          );
          logger.info('Randomly picked from queue', { channelId, picked: picked.username });
        } else {
          await this.chatClient.say(channelName, `@${username}, the queue is empty!`);
        }
        return;
      }

      // Pick multiple
      const count = parseInt(countArg, 10) || 1;
      if (count < 1 || count > 10) {
        await this.chatClient.say(channelName, `@${username}, please pick between 1 and 10 people.`);
        return;
      }

      const picked = queueRepo.pickMultiple(channelId, count);

      if (picked.length === 0) {
        await this.chatClient.say(channelName, `@${username}, the queue is empty!`);
        return;
      }

      const names = picked.map(p => `@${p.username}`).join(', ');
      await this.chatClient.say(
        channelName,
        `🎮 Selected: ${names}!`
      );

      logger.info('Picked multiple from queue', { channelId, count: picked.length });

    } catch (error) {
      logger.error('Error picking', { channelId, error: error.message });
    }
  }

  /**
   * Handle !open command (mod+)
   */
  async handleOpen(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      queueRepo.openQueue(channelId);
      const settings = queueRepo.getSettings(channelId);

      const announcement = settings.announcement_message ||
        `The queue is now open! Type !join to enter!`;

      await this.chatClient.say(channelName, `📋 ${announcement}`);
      logger.info('Queue opened', { channelId, openedBy: username });

    } catch (error) {
      logger.error('Error opening queue', { channelId, error: error.message });
    }
  }

  /**
   * Handle !close command (mod+)
   */
  async handleClose(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      queueRepo.closeQueue(channelId);
      const queueSize = queueRepo.getQueueSize(channelId);

      await this.chatClient.say(
        channelName,
        `📋 The queue is now closed. (${queueSize} in queue)`
      );

      logger.info('Queue closed', { channelId, closedBy: username });

    } catch (error) {
      logger.error('Error closing queue', { channelId, error: error.message });
    }
  }

  /**
   * Handle !clear command (mod+)
   */
  async handleClear(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      const removed = queueRepo.clearQueue(channelId);
      await this.chatClient.say(
        channelName,
        `📋 Queue cleared. (${removed} entries removed)`
      );

      logger.info('Queue cleared', { channelId, clearedBy: username, removed });

    } catch (error) {
      logger.error('Error clearing queue', { channelId, error: error.message });
    }
  }

  /**
   * Handle !list command (mod+)
   */
  async handleList(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      const queue = queueRepo.getQueue(channelId);

      if (queue.length === 0) {
        await this.chatClient.say(channelName, `@${username}, the queue is empty.`);
        return;
      }

      // Show first 5
      const preview = queue.slice(0, 5)
        .map((e, i) => `${i + 1}. ${e.username}`)
        .join(' | ');

      const moreText = queue.length > 5 ? ` ... and ${queue.length - 5} more` : '';

      await this.chatClient.say(channelName, `📋 Queue: ${preview}${moreText}`);

    } catch (error) {
      logger.error('Error listing queue', { channelId, error: error.message });
    }
  }

  /**
   * Handle incoming command
   */
  async handleCommand(command, channelId, channelName, userId, username, args, userInfo) {
    const cmd = command.toLowerCase();

    // Check for custom join command
    const settings = queueRepo.getSettings(channelId);
    if (cmd === settings.custom_join_command.toLowerCase()) {
      await this.handleJoin(channelId, channelName, userId, username, args, userInfo);
      return true;
    }

    switch (cmd) {
      case 'join':
        await this.handleJoin(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'leave':
        await this.handleLeave(channelId, channelName, userId, username);
        return true;

      case 'position':
      case 'queue':
        await this.handlePosition(channelId, channelName, userId, username);
        return true;

      case 'next':
        await this.handleNext(channelId, channelName, userId, username, userInfo);
        return true;

      case 'pick':
        await this.handlePick(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'open':
        await this.handleOpen(channelId, channelName, userId, username, userInfo);
        return true;

      case 'close':
        await this.handleClose(channelId, channelName, userId, username, userInfo);
        return true;

      case 'clear':
        if (args[0]?.toLowerCase() === 'queue') {
          await this.handleClear(channelId, channelName, userId, username, userInfo);
          return true;
        }
        return false;

      case 'list':
        await this.handleList(channelId, channelName, userId, username, userInfo);
        return true;

      default:
        return false;
    }
  }
}

module.exports = QueueHandler;
```

### Step 4: Create Web Routes and Views

Create routes and views for web-based queue management with drag-and-drop reordering.

### Step 5: Integrate with Bot Core

Register the handler and connect to chat events.

## Testing Requirements

### Unit Tests
- Queue join with position assignment
- Subscriber priority positioning
- Pick next/random algorithms
- Position shifting on leave

### Integration Tests
- Full queue flow via chat
- Web interface management
- Concurrent joins/leaves

### Manual Testing
1. !open to open queue
2. !join to join queue
3. !position to check position
4. !next to pick next (mod)
5. !pick random for random selection
6. !pick 3 for multiple picks
7. Test subscriber priority
8. !close and !clear

### Security Testing
- Rate limiting on joins
- Position manipulation attempts
- Random selection fairness
- CSRF on web forms

## Git Commit

**Commit Message:**
```
feat(bot): add viewer queue system

- Add migration 013_queue.sql
- Create queue-repo.js with position management
- Create queue-handler.js for chat commands
- Implement !join, !leave, !position, !queue
- Implement !next, !pick, !open, !close, !clear (mod)
- Support subscriber priority
- Optional notes on join
- Secure random selection for picks
- Web interface for queue management

Security: Rate limiting, position validation, crypto random
Phase 3 Task 03: Queue System
```

## Acceptance Criteria

- [ ] !open opens queue for joining
- [ ] !join adds user to queue
- [ ] !leave removes user from queue
- [ ] !position shows user's position
- [ ] !next picks next person (mod)
- [ ] !pick random selects randomly (mod)
- [ ] !pick N selects multiple (mod)
- [ ] !close closes queue to new entries
- [ ] !clear empties the queue (mod)
- [ ] Subscriber priority works correctly
- [ ] Positions update correctly on leave
- [ ] Web interface shows queue state
- [ ] Rate limiting prevents spam
- [ ] All forms have CSRF protection
