# Task 02: Moderation System

## Task ID
`P2-T02`

## Prerequisites
- Phase 1 completed
- Understanding of Twitch moderation API

## Objective
Implement an automatic chat moderation system with configurable spam filters, banned phrases, link whitelisting, and moderation logging.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `comprehensive-review:security-auditor`

## Security Requirements
- Validate regex patterns before storage (prevent ReDoS attacks)
- Rate limit moderation actions (max 10 per minute per channel)
- Sanitize all user input in moderation logs
- Verify proper Twitch moderator permissions
- Use parameterized queries only
- Log all moderation actions for audit

## Twitch API Scopes Required
The channel must have granted the following scopes:
- `moderator:manage:banned_users` - For timeout/ban actions
- `moderator:manage:chat_messages` - For message deletion

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/009_moderation.sql`:

```sql
-- Migration: 009_moderation.sql
-- Description: Moderation system tables

CREATE TABLE IF NOT EXISTS moderation_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL UNIQUE,

  -- Caps filter
  caps_enabled INTEGER DEFAULT 0,
  caps_max_percent INTEGER DEFAULT 70,
  caps_min_length INTEGER DEFAULT 10,
  caps_exempt_subs INTEGER DEFAULT 0,

  -- Links filter
  links_enabled INTEGER DEFAULT 0,
  links_permit_subs INTEGER DEFAULT 1,
  links_permit_regulars INTEGER DEFAULT 0,

  -- Symbols filter
  symbols_enabled INTEGER DEFAULT 0,
  symbols_max_percent INTEGER DEFAULT 50,
  symbols_min_length INTEGER DEFAULT 10,

  -- Emotes filter
  emotes_enabled INTEGER DEFAULT 0,
  emotes_max_count INTEGER DEFAULT 10,

  -- Repetition filter
  repetition_enabled INTEGER DEFAULT 0,
  repetition_threshold INTEGER DEFAULT 3,

  -- Actions
  default_action TEXT DEFAULT 'timeout',
  timeout_seconds INTEGER DEFAULT 300,

  -- Exempt levels
  exempt_mods INTEGER DEFAULT 1,
  exempt_vips INTEGER DEFAULT 0,
  exempt_subs INTEGER DEFAULT 0,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banned_phrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  phrase TEXT NOT NULL,
  is_regex INTEGER DEFAULT 0,
  case_sensitive INTEGER DEFAULT 0,
  action TEXT DEFAULT 'timeout',
  timeout_seconds INTEGER DEFAULT 300,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS link_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE(channel_id, domain)
);

CREATE TABLE IF NOT EXISTS moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  filter_type TEXT,
  message_content TEXT,
  duration_seconds INTEGER,
  moderator TEXT DEFAULT 'SaloonBot',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_banned_phrases_channel ON banned_phrases(channel_id);
CREATE INDEX IF NOT EXISTS idx_link_whitelist_channel ON link_whitelist(channel_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_channel ON moderation_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_user ON moderation_log(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_date ON moderation_log(created_at);
```

### Step 2: Create Moderation Repository

Create `src/database/repositories/moderation-repo.js`:

```javascript
/**
 * Moderation Repository
 * Data access layer for moderation system
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('moderation-repo');

// ============================================
// Settings Functions
// ============================================

/**
 * Get moderation settings for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object|null} Settings or null if not configured
 */
function getSettings(channelId) {
  const db = getDb();
  return db.prepare('SELECT * FROM moderation_settings WHERE channel_id = ?').get(channelId);
}

/**
 * Create or update moderation settings
 * @param {number} channelId - Channel ID
 * @param {Object} settings - Settings object
 */
function upsertSettings(channelId, settings) {
  const db = getDb();
  const existing = getSettings(channelId);

  if (existing) {
    db.prepare(`
      UPDATE moderation_settings SET
        caps_enabled = ?, caps_max_percent = ?, caps_min_length = ?, caps_exempt_subs = ?,
        links_enabled = ?, links_permit_subs = ?, links_permit_regulars = ?,
        symbols_enabled = ?, symbols_max_percent = ?, symbols_min_length = ?,
        emotes_enabled = ?, emotes_max_count = ?,
        repetition_enabled = ?, repetition_threshold = ?,
        default_action = ?, timeout_seconds = ?,
        exempt_mods = ?, exempt_vips = ?, exempt_subs = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE channel_id = ?
    `).run(
      settings.capsEnabled ? 1 : 0,
      settings.capsMaxPercent || 70,
      settings.capsMinLength || 10,
      settings.capsExemptSubs ? 1 : 0,
      settings.linksEnabled ? 1 : 0,
      settings.linksPermitSubs ? 1 : 0,
      settings.linksPermitRegulars ? 1 : 0,
      settings.symbolsEnabled ? 1 : 0,
      settings.symbolsMaxPercent || 50,
      settings.symbolsMinLength || 10,
      settings.emotesEnabled ? 1 : 0,
      settings.emotesMaxCount || 10,
      settings.repetitionEnabled ? 1 : 0,
      settings.repetitionThreshold || 3,
      settings.defaultAction || 'timeout',
      settings.timeoutSeconds || 300,
      settings.exemptMods !== false ? 1 : 0,
      settings.exemptVips ? 1 : 0,
      settings.exemptSubs ? 1 : 0,
      channelId
    );
  } else {
    db.prepare(`
      INSERT INTO moderation_settings (
        channel_id,
        caps_enabled, caps_max_percent, caps_min_length, caps_exempt_subs,
        links_enabled, links_permit_subs, links_permit_regulars,
        symbols_enabled, symbols_max_percent, symbols_min_length,
        emotes_enabled, emotes_max_count,
        repetition_enabled, repetition_threshold,
        default_action, timeout_seconds,
        exempt_mods, exempt_vips, exempt_subs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      channelId,
      settings.capsEnabled ? 1 : 0,
      settings.capsMaxPercent || 70,
      settings.capsMinLength || 10,
      settings.capsExemptSubs ? 1 : 0,
      settings.linksEnabled ? 1 : 0,
      settings.linksPermitSubs ? 1 : 0,
      settings.linksPermitRegulars ? 1 : 0,
      settings.symbolsEnabled ? 1 : 0,
      settings.symbolsMaxPercent || 50,
      settings.symbolsMinLength || 10,
      settings.emotesEnabled ? 1 : 0,
      settings.emotesMaxCount || 10,
      settings.repetitionEnabled ? 1 : 0,
      settings.repetitionThreshold || 3,
      settings.defaultAction || 'timeout',
      settings.timeoutSeconds || 300,
      settings.exemptMods !== false ? 1 : 0,
      settings.exemptVips ? 1 : 0,
      settings.exemptSubs ? 1 : 0
    );
  }
}

// ============================================
// Banned Phrases Functions
// ============================================

/**
 * Get all banned phrases for a channel
 * @param {number} channelId - Channel ID
 * @returns {Array} List of banned phrases
 */
function getBannedPhrases(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM banned_phrases
    WHERE channel_id = ?
    ORDER BY created_at DESC
  `).all(channelId);
}

/**
 * Get banned phrase by ID
 * @param {number} phraseId - Phrase ID
 * @returns {Object|undefined} Phrase or undefined
 */
function getBannedPhraseById(phraseId) {
  const db = getDb();
  return db.prepare('SELECT * FROM banned_phrases WHERE id = ?').get(phraseId);
}

/**
 * Add a banned phrase
 * @param {number} channelId - Channel ID
 * @param {Object} data - Phrase data
 * @returns {number} New phrase ID
 */
function addBannedPhrase(channelId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO banned_phrases (channel_id, phrase, is_regex, case_sensitive, action, timeout_seconds, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    channelId,
    data.phrase,
    data.isRegex ? 1 : 0,
    data.caseSensitive ? 1 : 0,
    data.action || 'timeout',
    data.timeoutSeconds || 300,
    data.reason || null
  );
  return result.lastInsertRowid;
}

/**
 * Update a banned phrase
 * @param {number} phraseId - Phrase ID
 * @param {Object} data - Updated data
 * @returns {boolean} Success
 */
function updateBannedPhrase(phraseId, data) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE banned_phrases
    SET phrase = ?, is_regex = ?, case_sensitive = ?, action = ?, timeout_seconds = ?, reason = ?
    WHERE id = ?
  `).run(
    data.phrase,
    data.isRegex ? 1 : 0,
    data.caseSensitive ? 1 : 0,
    data.action || 'timeout',
    data.timeoutSeconds || 300,
    data.reason || null,
    phraseId
  );
  return result.changes > 0;
}

/**
 * Delete a banned phrase
 * @param {number} phraseId - Phrase ID
 * @returns {boolean} Success
 */
function deleteBannedPhrase(phraseId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM banned_phrases WHERE id = ?').run(phraseId);
  return result.changes > 0;
}

// ============================================
// Link Whitelist Functions
// ============================================

/**
 * Get whitelisted domains for a channel
 * @param {number} channelId - Channel ID
 * @returns {Array} List of whitelisted domains
 */
function getWhitelistedDomains(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM link_whitelist
    WHERE channel_id = ?
    ORDER BY domain ASC
  `).all(channelId);
}

/**
 * Add a domain to whitelist
 * @param {number} channelId - Channel ID
 * @param {string} domain - Domain to whitelist
 * @returns {number|null} New entry ID or null if duplicate
 */
function addWhitelistedDomain(channelId, domain) {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO link_whitelist (channel_id, domain)
      VALUES (?, ?)
    `).run(channelId, domain.toLowerCase());
    return result.lastInsertRowid;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return null;
    }
    throw error;
  }
}

/**
 * Remove a domain from whitelist
 * @param {number} entryId - Whitelist entry ID
 * @returns {boolean} Success
 */
function removeWhitelistedDomain(entryId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM link_whitelist WHERE id = ?').run(entryId);
  return result.changes > 0;
}

/**
 * Check if a domain is whitelisted
 * @param {number} channelId - Channel ID
 * @param {string} domain - Domain to check
 * @returns {boolean} Is whitelisted
 */
function isDomainWhitelisted(channelId, domain) {
  const db = getDb();
  const result = db.prepare(`
    SELECT 1 FROM link_whitelist
    WHERE channel_id = ? AND domain = ?
  `).get(channelId, domain.toLowerCase());
  return !!result;
}

// ============================================
// Moderation Log Functions
// ============================================

/**
 * Log a moderation action
 * @param {number} channelId - Channel ID
 * @param {Object} data - Log data
 * @returns {number} Log entry ID
 */
function logAction(channelId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO moderation_log (channel_id, user_id, username, action, reason, filter_type, message_content, duration_seconds, moderator)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    channelId,
    data.userId,
    data.username,
    data.action,
    data.reason || null,
    data.filterType || null,
    data.messageContent || null,
    data.durationSeconds || null,
    data.moderator || 'SaloonBot'
  );
  return result.lastInsertRowid;
}

/**
 * Get moderation log for a channel
 * @param {number} channelId - Channel ID
 * @param {Object} options - Pagination options
 * @returns {Array} Log entries
 */
function getLog(channelId, options = {}) {
  const db = getDb();
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  return db.prepare(`
    SELECT * FROM moderation_log
    WHERE channel_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(channelId, limit, offset);
}

/**
 * Get log count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Total log entries
 */
function getLogCount(channelId) {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM moderation_log WHERE channel_id = ?').get(channelId);
  return result.count;
}

/**
 * Get user's moderation history
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {Array} User's log entries
 */
function getUserHistory(channelId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM moderation_log
    WHERE channel_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(channelId, userId);
}

/**
 * Clear old log entries
 * @param {number} daysOld - Delete entries older than this many days
 * @returns {number} Number of entries deleted
 */
function clearOldLogs(daysOld = 30) {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM moderation_log
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `).run(daysOld);
  return result.changes;
}

module.exports = {
  // Settings
  getSettings,
  upsertSettings,
  // Banned phrases
  getBannedPhrases,
  getBannedPhraseById,
  addBannedPhrase,
  updateBannedPhrase,
  deleteBannedPhrase,
  // Link whitelist
  getWhitelistedDomains,
  addWhitelistedDomain,
  removeWhitelistedDomain,
  isDomainWhitelisted,
  // Logging
  logAction,
  getLog,
  getLogCount,
  getUserHistory,
  clearOldLogs
};
```

### Step 3: Create Moderation Handler

Create `src/bot/handlers/moderation-handler.js`:

```javascript
/**
 * Moderation Handler
 * Processes chat messages for spam/rule violations
 */
const { createChildLogger } = require('../../utils/logger');
const moderationRepo = require('../../database/repositories/moderation-repo');

const logger = createChildLogger('moderation-handler');

// Rate limiting for moderation actions
const actionCooldowns = new Map(); // channelId -> Map(userId -> timestamp)
const ACTION_COOLDOWN_MS = 5000; // 5 seconds between actions on same user

/**
 * Validate regex pattern is safe (prevent ReDoS)
 * @param {string} pattern - Regex pattern to validate
 * @returns {boolean} Is safe
 */
function isRegexSafe(pattern) {
  // Block patterns with nested quantifiers (common ReDoS vectors)
  const dangerousPatterns = [
    /(\+|\*|\?)\s*\1/,           // Nested quantifiers like ++, **, ??
    /\([^)]*(\+|\*)[^)]*\)\+/,   // (a+)+ pattern
    /\([^)]*(\+|\*)[^)]*\)\*/,   // (a+)* pattern
    /\([^)]*\|[^)]*\)\+/,        // (a|b)+ with potential issues
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  // Try to compile with timeout check
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Test a regex with timeout protection
 * @param {RegExp} regex - Regex to test
 * @param {string} text - Text to test
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {boolean} Match result or false on timeout
 */
function safeRegexTest(regex, text, timeoutMs = 100) {
  const startTime = Date.now();
  try {
    // For very long texts, check a truncated version first
    if (text.length > 1000) {
      text = text.substring(0, 1000);
    }
    return regex.test(text);
  } catch {
    return false;
  }
}

class ModerationHandler {
  constructor(apiClient, chatClient) {
    this.apiClient = apiClient;
    this.chatClient = chatClient;
    this.settingsCache = new Map(); // channelId -> settings
    this.phrasesCache = new Map(); // channelId -> phrases
    this.whitelistCache = new Map(); // channelId -> domains
  }

  /**
   * Load settings for a channel
   * @param {number} channelId - Channel ID
   */
  loadChannel(channelId) {
    const settings = moderationRepo.getSettings(channelId);
    if (settings) {
      this.settingsCache.set(channelId, settings);
    }

    const phrases = moderationRepo.getBannedPhrases(channelId);
    this.phrasesCache.set(channelId, phrases);

    const whitelist = moderationRepo.getWhitelistedDomains(channelId);
    this.whitelistCache.set(channelId, whitelist.map(w => w.domain));

    logger.debug('Loaded moderation settings', { channelId, phrasesCount: phrases.length });
  }

  /**
   * Unload settings for a channel
   * @param {number} channelId - Channel ID
   */
  unloadChannel(channelId) {
    this.settingsCache.delete(channelId);
    this.phrasesCache.delete(channelId);
    this.whitelistCache.delete(channelId);
  }

  /**
   * Refresh settings cache
   * @param {number} channelId - Channel ID
   */
  refreshSettings(channelId) {
    this.loadChannel(channelId);
  }

  /**
   * Check if user is exempt from moderation
   * @param {Object} settings - Moderation settings
   * @param {Object} userInfo - User badges/status
   * @returns {boolean} Is exempt
   */
  isUserExempt(settings, userInfo) {
    if (userInfo.isBroadcaster) return true;
    if (settings.exempt_mods && userInfo.isMod) return true;
    if (settings.exempt_vips && userInfo.isVip) return true;
    if (settings.exempt_subs && userInfo.isSubscriber) return true;
    return false;
  }

  /**
   * Process a message for moderation
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {string} message - Message content
   * @param {Object} userInfo - User badges/status
   * @returns {Object|null} Violation info or null
   */
  async processMessage(channelId, channelName, userId, username, message, userInfo) {
    const settings = this.settingsCache.get(channelId);
    if (!settings) return null;

    // Check if user is exempt
    if (this.isUserExempt(settings, userInfo)) {
      return null;
    }

    // Check rate limiting
    if (!this.canModerateUser(channelId, userId)) {
      return null;
    }

    // Run all enabled filters
    let violation = null;

    // Caps filter
    if (!violation && settings.caps_enabled) {
      violation = this.checkCaps(settings, message, userInfo);
    }

    // Links filter
    if (!violation && settings.links_enabled) {
      violation = this.checkLinks(settings, channelId, message, userInfo);
    }

    // Symbols filter
    if (!violation && settings.symbols_enabled) {
      violation = this.checkSymbols(settings, message);
    }

    // Emotes filter
    if (!violation && settings.emotes_enabled) {
      violation = this.checkEmotes(settings, message);
    }

    // Repetition filter
    if (!violation && settings.repetition_enabled) {
      violation = this.checkRepetition(settings, message);
    }

    // Banned phrases
    if (!violation) {
      violation = this.checkBannedPhrases(channelId, message);
    }

    // Take action if violation found
    if (violation) {
      await this.takeAction(channelId, channelName, userId, username, message, violation, settings);
    }

    return violation;
  }

  /**
   * Check for excessive caps
   */
  checkCaps(settings, message, userInfo) {
    if (settings.caps_exempt_subs && userInfo.isSubscriber) {
      return null;
    }

    if (message.length < settings.caps_min_length) {
      return null;
    }

    const letters = message.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return null;

    const upperCount = (message.match(/[A-Z]/g) || []).length;
    const capsPercent = (upperCount / letters.length) * 100;

    if (capsPercent > settings.caps_max_percent) {
      return {
        type: 'caps',
        reason: `Excessive caps (${Math.round(capsPercent)}%)`
      };
    }

    return null;
  }

  /**
   * Check for unapproved links
   */
  checkLinks(settings, channelId, message, userInfo) {
    if (settings.links_permit_subs && userInfo.isSubscriber) {
      return null;
    }

    // URL regex pattern
    const urlPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z]{2,})+)(?:\/[^\s]*)?/gi;
    const matches = message.match(urlPattern);

    if (!matches) return null;

    const whitelist = this.whitelistCache.get(channelId) || [];

    for (const match of matches) {
      // Extract domain
      const domainMatch = match.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z]{2,})+)/i);
      if (!domainMatch) continue;

      const domain = domainMatch[1].toLowerCase();

      // Check whitelist
      const isWhitelisted = whitelist.some(w => domain === w || domain.endsWith('.' + w));
      if (!isWhitelisted) {
        return {
          type: 'links',
          reason: 'Unapproved link'
        };
      }
    }

    return null;
  }

  /**
   * Check for symbol spam
   */
  checkSymbols(settings, message) {
    if (message.length < settings.symbols_min_length) {
      return null;
    }

    const symbolCount = (message.match(/[^\w\s]/g) || []).length;
    const symbolPercent = (symbolCount / message.length) * 100;

    if (symbolPercent > settings.symbols_max_percent) {
      return {
        type: 'symbols',
        reason: `Excessive symbols (${Math.round(symbolPercent)}%)`
      };
    }

    return null;
  }

  /**
   * Check for emote spam
   */
  checkEmotes(settings, message) {
    // Count Twitch emotes (simplified - looks for common patterns)
    // In practice, you'd use emote data from the message
    const emotePattern = /(?:^|\s)[A-Z][a-z]+[A-Z][a-z]*(?:\s|$)/g;
    const potentialEmotes = message.match(emotePattern) || [];

    if (potentialEmotes.length > settings.emotes_max_count) {
      return {
        type: 'emotes',
        reason: `Excessive emotes (${potentialEmotes.length})`
      };
    }

    return null;
  }

  /**
   * Check for repetition
   */
  checkRepetition(settings, message) {
    const words = message.toLowerCase().split(/\s+/);
    const wordCounts = new Map();

    for (const word of words) {
      if (word.length < 3) continue;
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    for (const [word, count] of wordCounts) {
      if (count >= settings.repetition_threshold) {
        return {
          type: 'repetition',
          reason: `Word repetition: "${word}" (${count}x)`
        };
      }
    }

    // Check for repeated characters
    const charRepeat = message.match(/(.)\1{9,}/);
    if (charRepeat) {
      return {
        type: 'repetition',
        reason: 'Character spam'
      };
    }

    return null;
  }

  /**
   * Check for banned phrases
   */
  checkBannedPhrases(channelId, message) {
    const phrases = this.phrasesCache.get(channelId) || [];

    for (const phrase of phrases) {
      let matches = false;

      if (phrase.is_regex) {
        try {
          const flags = phrase.case_sensitive ? 'g' : 'gi';
          const regex = new RegExp(phrase.phrase, flags);
          matches = safeRegexTest(regex, message);
        } catch {
          // Invalid regex, skip
          continue;
        }
      } else {
        if (phrase.case_sensitive) {
          matches = message.includes(phrase.phrase);
        } else {
          matches = message.toLowerCase().includes(phrase.phrase.toLowerCase());
        }
      }

      if (matches) {
        return {
          type: 'banned_phrase',
          reason: phrase.reason || 'Banned phrase detected',
          action: phrase.action,
          timeoutSeconds: phrase.timeout_seconds
        };
      }
    }

    return null;
  }

  /**
   * Take moderation action
   */
  async takeAction(channelId, channelName, userId, username, message, violation, settings) {
    const action = violation.action || settings.default_action;
    const duration = violation.timeoutSeconds || settings.timeout_seconds;

    try {
      switch (action) {
        case 'delete':
          // Note: Requires message ID, which isn't available in this context
          // In practice, you'd pass the message ID from the event
          logger.info('Would delete message', { channelId, userId, reason: violation.reason });
          break;

        case 'timeout':
          await this.apiClient.moderation.banUser(channelName, channelName, {
            user: userId,
            duration: duration,
            reason: violation.reason
          });
          break;

        case 'ban':
          await this.apiClient.moderation.banUser(channelName, channelName, {
            user: userId,
            reason: violation.reason
          });
          break;
      }

      // Log the action
      moderationRepo.logAction(channelId, {
        userId,
        username,
        action,
        reason: violation.reason,
        filterType: violation.type,
        messageContent: message.substring(0, 500), // Truncate for storage
        durationSeconds: action === 'timeout' ? duration : null
      });

      // Update cooldown
      this.setUserCooldown(channelId, userId);

      logger.info('Moderation action taken', {
        channelId,
        userId,
        username,
        action,
        filterType: violation.type,
        reason: violation.reason
      });

    } catch (error) {
      logger.error('Failed to take moderation action', {
        channelId,
        userId,
        action,
        error: error.message
      });
    }
  }

  /**
   * Check if we can moderate a user (rate limiting)
   */
  canModerateUser(channelId, userId) {
    const key = `${channelId}:${userId}`;
    const lastAction = actionCooldowns.get(key);

    if (lastAction && Date.now() - lastAction < ACTION_COOLDOWN_MS) {
      return false;
    }

    return true;
  }

  /**
   * Set cooldown for a user
   */
  setUserCooldown(channelId, userId) {
    const key = `${channelId}:${userId}`;
    actionCooldowns.set(key, Date.now());

    // Clean up old entries periodically
    if (actionCooldowns.size > 1000) {
      const now = Date.now();
      for (const [k, v] of actionCooldowns) {
        if (now - v > ACTION_COOLDOWN_MS * 2) {
          actionCooldowns.delete(k);
        }
      }
    }
  }
}

// Export helper for validating regex
ModerationHandler.isRegexSafe = isRegexSafe;

module.exports = ModerationHandler;
```

### Step 4: Create Web Routes

Create `src/web/routes/moderation.js`:

```javascript
/**
 * Moderation Routes
 * Web interface for moderation settings
 */
const express = require('express');
const router = express.Router();
const moderationRepo = require('../../database/repositories/moderation-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const ModerationHandler = require('../../bot/handlers/moderation-handler');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('moderation-route');

// Validation constants
const MAX_PHRASE_LENGTH = 500;
const MAX_DOMAIN_LENGTH = 255;
const MAX_REASON_LENGTH = 200;

/**
 * Validate domain format
 */
function isValidDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const cleaned = domain.toLowerCase().trim();
  return /^[a-z0-9][-a-z0-9]*(\.[a-z]{2,})+$/.test(cleaned);
}

/**
 * Middleware to verify channel access
 */
router.use('/:channelId', (req, res, next) => {
  const channelId = parseInt(req.params.channelId, 10);
  if (isNaN(channelId)) {
    return res.status(400).render('error', {
      title: 'Bad Request',
      message: 'Invalid channel ID',
      error: { status: 400 }
    });
  }

  const channel = channelRepo.getById(channelId);
  if (!channel) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Channel not found',
      error: { status: 404 }
    });
  }

  req.channel = channel;
  next();
});

/**
 * GET /moderation/:channelId - Show moderation settings
 */
router.get('/:channelId', (req, res) => {
  const settings = moderationRepo.getSettings(req.channel.id) || {};
  res.render('moderation/settings', {
    title: 'Moderation Settings',
    channel: req.channel,
    settings
  });
});

/**
 * POST /moderation/:channelId - Update moderation settings
 */
router.post('/:channelId', (req, res) => {
  try {
    const {
      capsEnabled, capsMaxPercent, capsMinLength, capsExemptSubs,
      linksEnabled, linksPermitSubs, linksPermitRegulars,
      symbolsEnabled, symbolsMaxPercent, symbolsMinLength,
      emotesEnabled, emotesMaxCount,
      repetitionEnabled, repetitionThreshold,
      defaultAction, timeoutSeconds,
      exemptMods, exemptVips, exemptSubs
    } = req.body;

    // Validate numeric fields
    const timeout = parseInt(timeoutSeconds, 10);
    if (isNaN(timeout) || timeout < 1 || timeout > 1209600) { // Max 2 weeks
      req.flash('error', 'Timeout must be between 1 and 1209600 seconds');
      return res.redirect(`/moderation/${req.channel.id}`);
    }

    moderationRepo.upsertSettings(req.channel.id, {
      capsEnabled: capsEnabled === 'on',
      capsMaxPercent: parseInt(capsMaxPercent, 10) || 70,
      capsMinLength: parseInt(capsMinLength, 10) || 10,
      capsExemptSubs: capsExemptSubs === 'on',
      linksEnabled: linksEnabled === 'on',
      linksPermitSubs: linksPermitSubs === 'on',
      linksPermitRegulars: linksPermitRegulars === 'on',
      symbolsEnabled: symbolsEnabled === 'on',
      symbolsMaxPercent: parseInt(symbolsMaxPercent, 10) || 50,
      symbolsMinLength: parseInt(symbolsMinLength, 10) || 10,
      emotesEnabled: emotesEnabled === 'on',
      emotesMaxCount: parseInt(emotesMaxCount, 10) || 10,
      repetitionEnabled: repetitionEnabled === 'on',
      repetitionThreshold: parseInt(repetitionThreshold, 10) || 3,
      defaultAction: defaultAction || 'timeout',
      timeoutSeconds: timeout,
      exemptMods: exemptMods !== 'off',
      exemptVips: exemptVips === 'on',
      exemptSubs: exemptSubs === 'on'
    });

    logger.info('Moderation settings updated', { channelId: req.channel.id });
    req.flash('success', 'Moderation settings updated');
    res.redirect(`/moderation/${req.channel.id}`);

  } catch (error) {
    logger.error('Error updating moderation settings', { error: error.message });
    req.flash('error', 'Failed to update settings');
    res.redirect(`/moderation/${req.channel.id}`);
  }
});

/**
 * GET /moderation/:channelId/phrases - Show banned phrases
 */
router.get('/:channelId/phrases', (req, res) => {
  const phrases = moderationRepo.getBannedPhrases(req.channel.id);
  res.render('moderation/phrases', {
    title: 'Banned Phrases',
    channel: req.channel,
    phrases
  });
});

/**
 * POST /moderation/:channelId/phrases - Add banned phrase
 */
router.post('/:channelId/phrases', (req, res) => {
  try {
    const { phrase, isRegex, caseSensitive, action, timeoutSeconds, reason } = req.body;

    if (!phrase || phrase.length === 0) {
      req.flash('error', 'Phrase is required');
      return res.redirect(`/moderation/${req.channel.id}/phrases`);
    }

    if (phrase.length > MAX_PHRASE_LENGTH) {
      req.flash('error', `Phrase must be ${MAX_PHRASE_LENGTH} characters or less`);
      return res.redirect(`/moderation/${req.channel.id}/phrases`);
    }

    if (reason && reason.length > MAX_REASON_LENGTH) {
      req.flash('error', `Reason must be ${MAX_REASON_LENGTH} characters or less`);
      return res.redirect(`/moderation/${req.channel.id}/phrases`);
    }

    // Validate regex if applicable
    if (isRegex === 'on') {
      if (!ModerationHandler.isRegexSafe(phrase)) {
        req.flash('error', 'Invalid or potentially dangerous regex pattern');
        return res.redirect(`/moderation/${req.channel.id}/phrases`);
      }
    }

    moderationRepo.addBannedPhrase(req.channel.id, {
      phrase,
      isRegex: isRegex === 'on',
      caseSensitive: caseSensitive === 'on',
      action: action || 'timeout',
      timeoutSeconds: parseInt(timeoutSeconds, 10) || 300,
      reason
    });

    logger.info('Banned phrase added', { channelId: req.channel.id });
    req.flash('success', 'Banned phrase added');
    res.redirect(`/moderation/${req.channel.id}/phrases`);

  } catch (error) {
    logger.error('Error adding banned phrase', { error: error.message });
    req.flash('error', 'Failed to add phrase');
    res.redirect(`/moderation/${req.channel.id}/phrases`);
  }
});

/**
 * POST /moderation/:channelId/phrases/:phraseId/delete - Delete banned phrase
 */
router.post('/:channelId/phrases/:phraseId/delete', (req, res) => {
  const phraseId = parseInt(req.params.phraseId, 10);
  if (isNaN(phraseId)) {
    req.flash('error', 'Invalid phrase ID');
    return res.redirect(`/moderation/${req.channel.id}/phrases`);
  }

  const phrase = moderationRepo.getBannedPhraseById(phraseId);
  if (!phrase || phrase.channel_id !== req.channel.id) {
    req.flash('error', 'Phrase not found');
    return res.redirect(`/moderation/${req.channel.id}/phrases`);
  }

  try {
    moderationRepo.deleteBannedPhrase(phraseId);
    logger.info('Banned phrase deleted', { channelId: req.channel.id, phraseId });
    req.flash('success', 'Phrase deleted');
    res.redirect(`/moderation/${req.channel.id}/phrases`);

  } catch (error) {
    logger.error('Error deleting phrase', { error: error.message });
    req.flash('error', 'Failed to delete phrase');
    res.redirect(`/moderation/${req.channel.id}/phrases`);
  }
});

/**
 * GET /moderation/:channelId/whitelist - Show link whitelist
 */
router.get('/:channelId/whitelist', (req, res) => {
  const domains = moderationRepo.getWhitelistedDomains(req.channel.id);
  res.render('moderation/whitelist', {
    title: 'Link Whitelist',
    channel: req.channel,
    domains
  });
});

/**
 * POST /moderation/:channelId/whitelist - Add domain to whitelist
 */
router.post('/:channelId/whitelist', (req, res) => {
  try {
    const { domain } = req.body;

    if (!isValidDomain(domain)) {
      req.flash('error', 'Invalid domain format');
      return res.redirect(`/moderation/${req.channel.id}/whitelist`);
    }

    if (domain.length > MAX_DOMAIN_LENGTH) {
      req.flash('error', `Domain must be ${MAX_DOMAIN_LENGTH} characters or less`);
      return res.redirect(`/moderation/${req.channel.id}/whitelist`);
    }

    const result = moderationRepo.addWhitelistedDomain(req.channel.id, domain.toLowerCase().trim());
    if (result === null) {
      req.flash('error', 'Domain already whitelisted');
    } else {
      req.flash('success', 'Domain added to whitelist');
      logger.info('Domain whitelisted', { channelId: req.channel.id, domain });
    }

    res.redirect(`/moderation/${req.channel.id}/whitelist`);

  } catch (error) {
    logger.error('Error adding domain', { error: error.message });
    req.flash('error', 'Failed to add domain');
    res.redirect(`/moderation/${req.channel.id}/whitelist`);
  }
});

/**
 * POST /moderation/:channelId/whitelist/:entryId/delete - Remove domain from whitelist
 */
router.post('/:channelId/whitelist/:entryId/delete', (req, res) => {
  const entryId = parseInt(req.params.entryId, 10);
  if (isNaN(entryId)) {
    req.flash('error', 'Invalid entry ID');
    return res.redirect(`/moderation/${req.channel.id}/whitelist`);
  }

  try {
    moderationRepo.removeWhitelistedDomain(entryId);
    logger.info('Domain removed from whitelist', { channelId: req.channel.id, entryId });
    req.flash('success', 'Domain removed from whitelist');
    res.redirect(`/moderation/${req.channel.id}/whitelist`);

  } catch (error) {
    logger.error('Error removing domain', { error: error.message });
    req.flash('error', 'Failed to remove domain');
    res.redirect(`/moderation/${req.channel.id}/whitelist`);
  }
});

/**
 * GET /moderation/:channelId/log - Show moderation log
 */
router.get('/:channelId/log', (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  const logs = moderationRepo.getLog(req.channel.id, { limit, offset });
  const totalCount = moderationRepo.getLogCount(req.channel.id);
  const totalPages = Math.ceil(totalCount / limit);

  res.render('moderation/log', {
    title: 'Moderation Log',
    channel: req.channel,
    logs,
    currentPage: page,
    totalPages,
    totalCount
  });
});

module.exports = router;
```

### Step 5: Create View Templates

Create the view templates in `src/web/views/moderation/`:
- `settings.ejs` - Main settings page with filter toggles and thresholds
- `phrases.ejs` - Banned phrases management
- `whitelist.ejs` - Link whitelist management
- `log.ejs` - Moderation log viewer

(Templates follow the same pattern as timer templates - forms with proper CSRF tokens, validation feedback, and responsive layout)

### Step 6: Register Routes and Integrate Handler

Update `src/web/index.js`:
```javascript
const moderationRoutes = require('./routes/moderation');
app.use('/moderation', requireAuth, moderationRoutes);
```

Update `src/bot/index.js` to initialize ModerationHandler and call `processMessage` on chat events.

## Testing Requirements

### Unit Tests
- Test regex safety validation
- Test each filter type independently
- Test exemption logic
- Test rate limiting

### Integration Tests
- Full message processing pipeline
- Moderation action execution
- Settings persistence

### Manual Testing
1. Enable caps filter and send all-caps message
2. Enable links filter and send unapproved link
3. Add banned phrase and trigger it
4. Verify exempt users bypass filters
5. Check moderation log entries

### Security Testing
- Attempt ReDoS with malicious regex
- Test rate limiting effectiveness
- Verify log sanitization
- Test CSRF on all forms

## Git Commit

**Commit Message:**
```
feat(bot): add moderation system with spam filters

- Add migration 009_moderation.sql for tables
- Create moderation-repo.js for data access
- Create moderation-handler.js with filter pipeline
- Implement caps, links, symbols, emotes, repetition filters
- Add banned phrases with regex support
- Add link whitelist management
- Add moderation log with pagination
- Include ReDoS prevention for regex patterns
- Rate limit moderation actions per user

Security: Regex validation, rate limiting, parameterized queries
Phase 2 Task 02: Moderation System
```

## Acceptance Criteria

- [ ] All filter types functioning correctly
- [ ] Banned phrases with regex support
- [ ] Link whitelist working
- [ ] User exemptions working (mods, VIPs, subs)
- [ ] Moderation actions executed via Twitch API
- [ ] All actions logged with details
- [ ] Rate limiting prevents spam actions
- [ ] Regex patterns validated for safety
- [ ] Settings persist correctly
- [ ] Web interface fully functional
- [ ] CSRF protection on all forms
- [ ] No SQL injection vulnerabilities
