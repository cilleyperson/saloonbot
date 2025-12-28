# Task 01: Timer System

## Task ID
`P2-T01`

## Prerequisites
- Phase 1 completed
- Understanding of existing bot architecture

## Objective
Implement a timer/scheduled messages system that allows channels to configure recurring messages with optional chat activity requirements.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `frontend-mobile-development:frontend-developer`

## Security Requirements
- Validate timer names (alphanumeric, 1-50 chars)
- Sanitize message content (no script injection)
- Validate interval ranges (1-1440 minutes)
- Rate limit timer creation per channel
- Verify channel ownership on all operations
- Use parameterized queries only

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/008_timers.sql`:

```sql
-- Migration: 008_timers.sql
-- Description: Timer/scheduled message system

CREATE TABLE IF NOT EXISTS channel_timers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 10,
  min_chat_lines INTEGER DEFAULT 0,
  is_enabled INTEGER DEFAULT 1,
  chat_scope TEXT DEFAULT 'all',
  last_fired_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE(channel_id, name)
);

CREATE TABLE IF NOT EXISTS timer_chat_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timer_id INTEGER NOT NULL,
  chat_name TEXT NOT NULL,
  FOREIGN KEY (timer_id) REFERENCES channel_timers(id) ON DELETE CASCADE,
  UNIQUE(timer_id, chat_name)
);

CREATE INDEX IF NOT EXISTS idx_timers_channel ON channel_timers(channel_id);
CREATE INDEX IF NOT EXISTS idx_timers_enabled ON channel_timers(channel_id, is_enabled);
```

### Step 2: Create Timer Repository

Create `src/database/repositories/timer-repo.js`:

```javascript
/**
 * Timer Repository
 * Data access layer for timer/scheduled message operations
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('timer-repo');

/**
 * Get all timers for a channel
 * @param {number} channelId - Channel ID
 * @returns {Array} List of timers
 */
function getTimersByChannel(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM channel_timers
    WHERE channel_id = ?
    ORDER BY name ASC
  `).all(channelId);
}

/**
 * Get enabled timers for a channel
 * @param {number} channelId - Channel ID
 * @returns {Array} List of enabled timers
 */
function getEnabledTimersByChannel(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM channel_timers
    WHERE channel_id = ? AND is_enabled = 1
    ORDER BY name ASC
  `).all(channelId);
}

/**
 * Get timer by ID
 * @param {number} timerId - Timer ID
 * @returns {Object|undefined} Timer or undefined
 */
function getTimerById(timerId) {
  const db = getDb();
  return db.prepare('SELECT * FROM channel_timers WHERE id = ?').get(timerId);
}

/**
 * Get timer by name for a channel
 * @param {number} channelId - Channel ID
 * @param {string} name - Timer name
 * @returns {Object|undefined} Timer or undefined
 */
function getTimerByName(channelId, name) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM channel_timers
    WHERE channel_id = ? AND name = ?
  `).get(channelId, name);
}

/**
 * Create a new timer
 * @param {number} channelId - Channel ID
 * @param {Object} data - Timer data
 * @returns {number} New timer ID
 */
function createTimer(channelId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO channel_timers (channel_id, name, message, interval_minutes, min_chat_lines, is_enabled, chat_scope)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    channelId,
    data.name.trim(),
    data.message,
    data.intervalMinutes || 10,
    data.minChatLines || 0,
    data.isEnabled !== false ? 1 : 0,
    data.chatScope || 'all'
  );
  return result.lastInsertRowid;
}

/**
 * Update an existing timer
 * @param {number} timerId - Timer ID
 * @param {Object} data - Updated timer data
 * @returns {boolean} Success
 */
function updateTimer(timerId, data) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE channel_timers
    SET name = ?, message = ?, interval_minutes = ?, min_chat_lines = ?,
        is_enabled = ?, chat_scope = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.name.trim(),
    data.message,
    data.intervalMinutes || 10,
    data.minChatLines || 0,
    data.isEnabled ? 1 : 0,
    data.chatScope || 'all',
    timerId
  );
  return result.changes > 0;
}

/**
 * Delete a timer
 * @param {number} timerId - Timer ID
 * @returns {boolean} Success
 */
function deleteTimer(timerId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM channel_timers WHERE id = ?').run(timerId);
  return result.changes > 0;
}

/**
 * Toggle timer enabled state
 * @param {number} timerId - Timer ID
 * @param {boolean} isEnabled - New enabled state
 * @returns {boolean} Success
 */
function setTimerEnabled(timerId, isEnabled) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE channel_timers
    SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isEnabled ? 1 : 0, timerId);
  return result.changes > 0;
}

/**
 * Update last fired timestamp
 * @param {number} timerId - Timer ID
 * @returns {boolean} Success
 */
function updateLastFired(timerId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE channel_timers
    SET last_fired_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(timerId);
  return result.changes > 0;
}

/**
 * Get chat scopes for a timer
 * @param {number} timerId - Timer ID
 * @returns {Array} List of chat names
 */
function getTimerChatScopes(timerId) {
  const db = getDb();
  return db.prepare(`
    SELECT chat_name FROM timer_chat_scopes
    WHERE timer_id = ?
  `).all(timerId).map(row => row.chat_name);
}

/**
 * Set chat scopes for a timer
 * @param {number} timerId - Timer ID
 * @param {Array} chatNames - List of chat names
 */
function setTimerChatScopes(timerId, chatNames) {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM timer_chat_scopes WHERE timer_id = ?');
  const insertStmt = db.prepare('INSERT INTO timer_chat_scopes (timer_id, chat_name) VALUES (?, ?)');

  db.transaction(() => {
    deleteStmt.run(timerId);
    for (const chatName of chatNames) {
      insertStmt.run(timerId, chatName);
    }
  })();
}

module.exports = {
  getTimersByChannel,
  getEnabledTimersByChannel,
  getTimerById,
  getTimerByName,
  createTimer,
  updateTimer,
  deleteTimer,
  setTimerEnabled,
  updateLastFired,
  getTimerChatScopes,
  setTimerChatScopes
};
```

### Step 3: Create Timer Manager

Create `src/bot/managers/timer-manager.js`:

```javascript
/**
 * Timer Manager
 * Manages scheduled message execution for all channels
 */
const { createChildLogger } = require('../../utils/logger');
const timerRepo = require('../../database/repositories/timer-repo');
const { formatTemplate } = require('../../utils/template');

const logger = createChildLogger('timer-manager');

class TimerManager {
  constructor(chatClient) {
    this.chatClient = chatClient;
    this.activeTimers = new Map(); // channelId -> Map(timerId -> intervalId)
    this.chatLineCounters = new Map(); // channelId -> count
    this.checkInterval = null;
  }

  /**
   * Start the timer manager
   */
  start() {
    logger.info('Timer manager starting');

    // Check timers every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkTimers();
    }, 30000);
  }

  /**
   * Stop the timer manager
   */
  stop() {
    logger.info('Timer manager stopping');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all active timers
    for (const channelTimers of this.activeTimers.values()) {
      for (const intervalId of channelTimers.values()) {
        clearInterval(intervalId);
      }
    }
    this.activeTimers.clear();
    this.chatLineCounters.clear();
  }

  /**
   * Load and start timers for a channel
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name for chat
   */
  loadChannelTimers(channelId, channelName) {
    const timers = timerRepo.getEnabledTimersByChannel(channelId);
    logger.info('Loading timers for channel', { channelId, channelName, count: timers.length });

    if (!this.activeTimers.has(channelId)) {
      this.activeTimers.set(channelId, new Map());
    }

    for (const timer of timers) {
      this.startTimer(timer, channelName);
    }
  }

  /**
   * Unload timers for a channel
   * @param {number} channelId - Channel ID
   */
  unloadChannelTimers(channelId) {
    const channelTimers = this.activeTimers.get(channelId);
    if (channelTimers) {
      for (const intervalId of channelTimers.values()) {
        clearInterval(intervalId);
      }
      this.activeTimers.delete(channelId);
    }
    this.chatLineCounters.delete(channelId);
  }

  /**
   * Start a single timer
   * @param {Object} timer - Timer object from database
   * @param {string} channelName - Channel name for chat
   */
  startTimer(timer, channelName) {
    const channelTimers = this.activeTimers.get(timer.channel_id);
    if (!channelTimers) return;

    // Clear existing timer if any
    if (channelTimers.has(timer.id)) {
      clearInterval(channelTimers.get(timer.id));
    }

    const intervalMs = timer.interval_minutes * 60 * 1000;

    const intervalId = setInterval(() => {
      this.executeTimer(timer, channelName);
    }, intervalMs);

    channelTimers.set(timer.id, intervalId);
    logger.debug('Timer started', { timerId: timer.id, name: timer.name, intervalMinutes: timer.interval_minutes });
  }

  /**
   * Stop a single timer
   * @param {number} channelId - Channel ID
   * @param {number} timerId - Timer ID
   */
  stopTimer(channelId, timerId) {
    const channelTimers = this.activeTimers.get(channelId);
    if (channelTimers && channelTimers.has(timerId)) {
      clearInterval(channelTimers.get(timerId));
      channelTimers.delete(timerId);
      logger.debug('Timer stopped', { timerId });
    }
  }

  /**
   * Execute a timer (send message)
   * @param {Object} timer - Timer object
   * @param {string} channelName - Channel name
   */
  async executeTimer(timer, channelName) {
    try {
      // Check minimum chat lines requirement
      if (timer.min_chat_lines > 0) {
        const lineCount = this.chatLineCounters.get(timer.channel_id) || 0;
        if (lineCount < timer.min_chat_lines) {
          logger.debug('Timer skipped - insufficient chat activity', {
            timerId: timer.id,
            required: timer.min_chat_lines,
            actual: lineCount
          });
          return;
        }
        // Reset counter after successful check
        this.chatLineCounters.set(timer.channel_id, 0);
      }

      // Format message with template variables
      const message = formatTemplate(timer.message, {
        channel: channelName
      });

      // Send to appropriate chats based on scope
      const chats = this.getTimerChats(timer, channelName);
      for (const chat of chats) {
        await this.chatClient.say(chat, message);
      }

      // Update last fired timestamp
      timerRepo.updateLastFired(timer.id);

      logger.info('Timer executed', { timerId: timer.id, name: timer.name, chats });
    } catch (error) {
      logger.error('Error executing timer', { timerId: timer.id, error: error.message });
    }
  }

  /**
   * Get list of chats for a timer based on scope
   * @param {Object} timer - Timer object
   * @param {string} channelName - Default channel name
   * @returns {Array} List of chat names
   */
  getTimerChats(timer, channelName) {
    if (timer.chat_scope === 'all') {
      return [channelName];
    }

    const scopes = timerRepo.getTimerChatScopes(timer.id);
    if (scopes.length === 0) {
      return [channelName];
    }

    return scopes.map(scope => scope === '__own__' ? channelName : scope);
  }

  /**
   * Increment chat line counter for a channel
   * @param {number} channelId - Channel ID
   */
  incrementChatLines(channelId) {
    const current = this.chatLineCounters.get(channelId) || 0;
    this.chatLineCounters.set(channelId, current + 1);
  }

  /**
   * Check all timers (called periodically)
   */
  checkTimers() {
    // This method can be used for additional timer health checks
    // Currently timers are managed via setInterval
  }

  /**
   * Reload a specific timer
   * @param {number} timerId - Timer ID
   * @param {string} channelName - Channel name
   */
  reloadTimer(timerId, channelName) {
    const timer = timerRepo.getTimerById(timerId);
    if (!timer) return;

    this.stopTimer(timer.channel_id, timerId);

    if (timer.is_enabled) {
      if (!this.activeTimers.has(timer.channel_id)) {
        this.activeTimers.set(timer.channel_id, new Map());
      }
      this.startTimer(timer, channelName);
    }
  }
}

module.exports = TimerManager;
```

### Step 4: Create Web Routes

Create `src/web/routes/timers.js`:

```javascript
/**
 * Timer Routes
 * Web interface for managing channel timers
 */
const express = require('express');
const router = express.Router();
const timerRepo = require('../../database/repositories/timer-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const chatMembershipRepo = require('../../database/repositories/chat-membership-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('timers-route');

// Validation constants
const MAX_TIMER_NAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 500;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 1440; // 24 hours
const MAX_MIN_LINES = 1000;

/**
 * Validate timer name
 */
function isValidTimerName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 1 &&
         trimmed.length <= MAX_TIMER_NAME_LENGTH &&
         /^[a-zA-Z0-9_-]+$/.test(trimmed);
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
 * GET /timers/:channelId - List all timers
 */
router.get('/:channelId', (req, res) => {
  try {
    const timers = timerRepo.getTimersByChannel(req.channel.id);
    res.render('timers/list', {
      title: 'Timers',
      channel: req.channel,
      timers
    });
  } catch (error) {
    logger.error('Error listing timers', { channelId: req.channel.id, error: error.message });
    req.flash('error', 'Failed to load timers');
    res.redirect('/dashboard');
  }
});

/**
 * GET /timers/:channelId/add - Show add timer form
 */
router.get('/:channelId/add', (req, res) => {
  const memberships = chatMembershipRepo.getMembershipsByChannel(req.channel.id);
  res.render('timers/form', {
    title: 'Add Timer',
    channel: req.channel,
    timer: null,
    memberships,
    action: 'add'
  });
});

/**
 * POST /timers/:channelId - Create new timer
 */
router.post('/:channelId', (req, res) => {
  try {
    const { name, message, intervalMinutes, minChatLines, isEnabled, chatScope, selectedChats } = req.body;

    // Validate name
    if (!isValidTimerName(name)) {
      req.flash('error', 'Timer name must be 1-50 alphanumeric characters, underscores, or hyphens');
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    // Check for duplicate name
    if (timerRepo.getTimerByName(req.channel.id, name.trim())) {
      req.flash('error', 'A timer with this name already exists');
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    // Validate message
    if (!message || message.trim().length === 0) {
      req.flash('error', 'Message is required');
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      req.flash('error', `Message must be ${MAX_MESSAGE_LENGTH} characters or less`);
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    // Validate interval
    const interval = parseInt(intervalMinutes, 10);
    if (isNaN(interval) || interval < MIN_INTERVAL || interval > MAX_INTERVAL) {
      req.flash('error', `Interval must be between ${MIN_INTERVAL} and ${MAX_INTERVAL} minutes`);
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    // Validate min chat lines
    const minLines = parseInt(minChatLines, 10) || 0;
    if (minLines < 0 || minLines > MAX_MIN_LINES) {
      req.flash('error', `Minimum chat lines must be between 0 and ${MAX_MIN_LINES}`);
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    // Create timer
    const timerId = timerRepo.createTimer(req.channel.id, {
      name: name.trim(),
      message: message.trim(),
      intervalMinutes: interval,
      minChatLines: minLines,
      isEnabled: isEnabled === 'on',
      chatScope: chatScope || 'all'
    });

    // Set chat scopes if applicable
    if (chatScope === 'selected' && selectedChats) {
      const chats = Array.isArray(selectedChats) ? selectedChats : [selectedChats];
      timerRepo.setTimerChatScopes(timerId, chats);
    }

    logger.info('Timer created', { channelId: req.channel.id, timerId, name: name.trim() });
    req.flash('success', 'Timer created successfully');
    res.redirect(`/timers/${req.channel.id}`);

  } catch (error) {
    logger.error('Error creating timer', { channelId: req.channel.id, error: error.message });
    req.flash('error', 'Failed to create timer');
    res.redirect(`/timers/${req.channel.id}/add`);
  }
});

/**
 * GET /timers/:channelId/:timerId/edit - Show edit timer form
 */
router.get('/:channelId/:timerId/edit', (req, res) => {
  const timerId = parseInt(req.params.timerId, 10);
  if (isNaN(timerId)) {
    req.flash('error', 'Invalid timer ID');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  const timer = timerRepo.getTimerById(timerId);
  if (!timer || timer.channel_id !== req.channel.id) {
    req.flash('error', 'Timer not found');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  const memberships = chatMembershipRepo.getMembershipsByChannel(req.channel.id);
  const selectedChats = timerRepo.getTimerChatScopes(timerId);

  res.render('timers/form', {
    title: 'Edit Timer',
    channel: req.channel,
    timer,
    memberships,
    selectedChats,
    action: 'edit'
  });
});

/**
 * POST /timers/:channelId/:timerId - Update timer
 */
router.post('/:channelId/:timerId', (req, res) => {
  const timerId = parseInt(req.params.timerId, 10);
  if (isNaN(timerId)) {
    req.flash('error', 'Invalid timer ID');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  const timer = timerRepo.getTimerById(timerId);
  if (!timer || timer.channel_id !== req.channel.id) {
    req.flash('error', 'Timer not found');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  try {
    const { name, message, intervalMinutes, minChatLines, isEnabled, chatScope, selectedChats } = req.body;

    // Validate name
    if (!isValidTimerName(name)) {
      req.flash('error', 'Timer name must be 1-50 alphanumeric characters, underscores, or hyphens');
      return res.redirect(`/timers/${req.channel.id}/${timerId}/edit`);
    }

    // Check for duplicate name (excluding current timer)
    const existing = timerRepo.getTimerByName(req.channel.id, name.trim());
    if (existing && existing.id !== timerId) {
      req.flash('error', 'A timer with this name already exists');
      return res.redirect(`/timers/${req.channel.id}/${timerId}/edit`);
    }

    // Validate message
    if (!message || message.trim().length === 0) {
      req.flash('error', 'Message is required');
      return res.redirect(`/timers/${req.channel.id}/${timerId}/edit`);
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      req.flash('error', `Message must be ${MAX_MESSAGE_LENGTH} characters or less`);
      return res.redirect(`/timers/${req.channel.id}/${timerId}/edit`);
    }

    // Validate interval
    const interval = parseInt(intervalMinutes, 10);
    if (isNaN(interval) || interval < MIN_INTERVAL || interval > MAX_INTERVAL) {
      req.flash('error', `Interval must be between ${MIN_INTERVAL} and ${MAX_INTERVAL} minutes`);
      return res.redirect(`/timers/${req.channel.id}/${timerId}/edit`);
    }

    // Validate min chat lines
    const minLines = parseInt(minChatLines, 10) || 0;
    if (minLines < 0 || minLines > MAX_MIN_LINES) {
      req.flash('error', `Minimum chat lines must be between 0 and ${MAX_MIN_LINES}`);
      return res.redirect(`/timers/${req.channel.id}/${timerId}/edit`);
    }

    // Update timer
    timerRepo.updateTimer(timerId, {
      name: name.trim(),
      message: message.trim(),
      intervalMinutes: interval,
      minChatLines: minLines,
      isEnabled: isEnabled === 'on',
      chatScope: chatScope || 'all'
    });

    // Update chat scopes
    if (chatScope === 'selected' && selectedChats) {
      const chats = Array.isArray(selectedChats) ? selectedChats : [selectedChats];
      timerRepo.setTimerChatScopes(timerId, chats);
    } else {
      timerRepo.setTimerChatScopes(timerId, []);
    }

    logger.info('Timer updated', { channelId: req.channel.id, timerId });
    req.flash('success', 'Timer updated successfully');
    res.redirect(`/timers/${req.channel.id}`);

  } catch (error) {
    logger.error('Error updating timer', { timerId, error: error.message });
    req.flash('error', 'Failed to update timer');
    res.redirect(`/timers/${req.channel.id}/${timerId}/edit`);
  }
});

/**
 * POST /timers/:channelId/:timerId/toggle - Toggle timer enabled state
 */
router.post('/:channelId/:timerId/toggle', (req, res) => {
  const timerId = parseInt(req.params.timerId, 10);
  if (isNaN(timerId)) {
    req.flash('error', 'Invalid timer ID');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  const timer = timerRepo.getTimerById(timerId);
  if (!timer || timer.channel_id !== req.channel.id) {
    req.flash('error', 'Timer not found');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  try {
    const newState = !timer.is_enabled;
    timerRepo.setTimerEnabled(timerId, newState);

    logger.info('Timer toggled', { timerId, enabled: newState });
    req.flash('success', `Timer ${newState ? 'enabled' : 'disabled'}`);
    res.redirect(`/timers/${req.channel.id}`);

  } catch (error) {
    logger.error('Error toggling timer', { timerId, error: error.message });
    req.flash('error', 'Failed to toggle timer');
    res.redirect(`/timers/${req.channel.id}`);
  }
});

/**
 * POST /timers/:channelId/:timerId/delete - Delete timer
 */
router.post('/:channelId/:timerId/delete', (req, res) => {
  const timerId = parseInt(req.params.timerId, 10);
  if (isNaN(timerId)) {
    req.flash('error', 'Invalid timer ID');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  const timer = timerRepo.getTimerById(timerId);
  if (!timer || timer.channel_id !== req.channel.id) {
    req.flash('error', 'Timer not found');
    return res.redirect(`/timers/${req.channel.id}`);
  }

  try {
    timerRepo.deleteTimer(timerId);

    logger.info('Timer deleted', { channelId: req.channel.id, timerId });
    req.flash('success', 'Timer deleted successfully');
    res.redirect(`/timers/${req.channel.id}`);

  } catch (error) {
    logger.error('Error deleting timer', { timerId, error: error.message });
    req.flash('error', 'Failed to delete timer');
    res.redirect(`/timers/${req.channel.id}`);
  }
});

module.exports = router;
```

### Step 5: Create View Templates

Create `src/web/views/timers/list.ejs`:

```ejs
<%- include('../layout', { body: `
<div class="page">
  <div class="page-header">
    <div class="page-header-content">
      <a href="/channels/${channel.id}" class="back-link">&larr; Back to ${channel.channel_name}</a>
      <h1 class="page-title">Timers</h1>
      <p class="page-subtitle">Scheduled messages for ${channel.channel_name}</p>
    </div>
    <div class="page-header-actions">
      <a href="/timers/${channel.id}/add" class="btn btn-primary">Add Timer</a>
    </div>
  </div>

  <div class="page-content">
    ${timers.length === 0 ? `
    <div class="card">
      <div class="empty-state">
        <p>No timers configured yet.</p>
        <a href="/timers/${channel.id}/add" class="btn btn-primary">Create your first timer</a>
      </div>
    </div>
    ` : `
    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Message</th>
              <th>Interval</th>
              <th>Min Lines</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${timers.map(timer => `
            <tr>
              <td><strong>${timer.name}</strong></td>
              <td class="text-truncate" style="max-width: 200px;">${timer.message}</td>
              <td>${timer.interval_minutes} min</td>
              <td>${timer.min_chat_lines || 0}</td>
              <td>
                <span class="badge badge-${timer.is_enabled ? 'success' : 'secondary'}">
                  ${timer.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </td>
              <td>
                <div class="btn-group">
                  <a href="/timers/${channel.id}/${timer.id}/edit" class="btn btn-sm btn-secondary">Edit</a>
                  <form action="/timers/${channel.id}/${timer.id}/toggle" method="POST" style="display: inline;">
                    <button type="submit" class="btn btn-sm btn-${timer.is_enabled ? 'warning' : 'success'}">
                      ${timer.is_enabled ? 'Disable' : 'Enable'}
                    </button>
                  </form>
                  <form action="/timers/${channel.id}/${timer.id}/delete" method="POST" style="display: inline;"
                        onsubmit="return confirm('Delete this timer?')">
                    <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                  </form>
                </div>
              </td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    `}
  </div>
</div>
` }) %>
```

Create `src/web/views/timers/form.ejs`:

```ejs
<%- include('../layout', { body: `
<div class="page">
  <div class="page-header">
    <div class="page-header-content">
      <a href="/timers/${channel.id}" class="back-link">&larr; Back to Timers</a>
      <h1 class="page-title">${action === 'add' ? 'Add Timer' : 'Edit Timer'}</h1>
    </div>
  </div>

  <div class="page-content">
    <div class="card">
      <form action="/timers/${channel.id}${timer ? '/' + timer.id : ''}" method="POST">
        <div class="form-group">
          <label for="name" class="form-label">Timer Name</label>
          <input type="text" id="name" name="name" class="form-input"
                 value="${timer ? timer.name : ''}"
                 placeholder="e.g., social_reminder"
                 pattern="[a-zA-Z0-9_-]+"
                 maxlength="50"
                 required>
          <p class="form-help">Alphanumeric characters, underscores, and hyphens only</p>
        </div>

        <div class="form-group">
          <label for="message" class="form-label">Message</label>
          <textarea id="message" name="message" class="form-input form-textarea"
                    rows="3" maxlength="500" required
                    placeholder="Follow us on Twitter @example!">${timer ? timer.message : ''}</textarea>
          <p class="form-help">Available variables: {channel}</p>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="intervalMinutes" class="form-label">Interval (minutes)</label>
            <input type="number" id="intervalMinutes" name="intervalMinutes" class="form-input"
                   value="${timer ? timer.interval_minutes : 10}"
                   min="1" max="1440" required>
            <p class="form-help">1-1440 minutes (24 hours max)</p>
          </div>

          <div class="form-group">
            <label for="minChatLines" class="form-label">Minimum Chat Lines</label>
            <input type="number" id="minChatLines" name="minChatLines" class="form-input"
                   value="${timer ? timer.min_chat_lines : 0}"
                   min="0" max="1000">
            <p class="form-help">Timer only fires if this many lines have been sent (0 = always fire)</p>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Chat Scope</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="chatScope" value="all"
                     ${!timer || timer.chat_scope === 'all' ? 'checked' : ''}>
              <span>All Chats</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="chatScope" value="selected"
                     ${timer && timer.chat_scope === 'selected' ? 'checked' : ''}>
              <span>Selected Chats Only</span>
            </label>
          </div>
        </div>

        <div class="form-group chat-scope-selector" style="${!timer || timer.chat_scope !== 'selected' ? 'display: none;' : ''}">
          <label class="form-label">Select Chats</label>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" name="selectedChats" value="__own__"
                     ${selectedChats && selectedChats.includes('__own__') ? 'checked' : ''}>
              <span>${channel.channel_name} (own chat)</span>
            </label>
            ${memberships.map(m => `
            <label class="checkbox-label">
              <input type="checkbox" name="selectedChats" value="${m.target_channel}"
                     ${selectedChats && selectedChats.includes(m.target_channel) ? 'checked' : ''}>
              <span>${m.target_channel}</span>
            </label>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" name="isEnabled" ${!timer || timer.is_enabled ? 'checked' : ''}>
            <span>Enable this timer</span>
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${action === 'add' ? 'Create Timer' : 'Save Changes'}</button>
          <a href="/timers/${channel.id}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
  </div>
</div>

<script>
(function() {
  var scopeRadios = document.querySelectorAll('input[name="chatScope"]');
  var scopeSelector = document.querySelector('.chat-scope-selector');

  scopeRadios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      if (this.value === 'selected') {
        scopeSelector.style.display = 'block';
      } else {
        scopeSelector.style.display = 'none';
      }
    });
  });
})();
</script>
` }) %>
```

### Step 6: Register Routes and Update Navigation

Update `src/web/index.js` to include the timer routes:

```javascript
// Add near other route imports
const timerRoutes = require('./routes/timers');

// Add near other app.use() calls
app.use('/timers', requireAuth, timerRoutes);
```

Update the sidebar navigation in `layout.ejs` to include timers link (channel-specific navigation).

### Step 7: Integrate Timer Manager with Bot Core

Update `src/bot/index.js` to initialize and manage the TimerManager:

```javascript
// Add import
const TimerManager = require('./managers/timer-manager');

// In BotCore class, add property
this.timerManager = null;

// In start() method, after chat client is ready
this.timerManager = new TimerManager(this.chatClient);
this.timerManager.start();

// In channel connection logic, load timers
this.timerManager.loadChannelTimers(channel.id, channel.channel_name);

// In stop() method
if (this.timerManager) {
  this.timerManager.stop();
}

// In message handler, increment chat lines
this.timerManager.incrementChatLines(channel.id);
```

## Testing Requirements

### Unit Tests
- Test repository CRUD operations
- Test timer validation functions
- Test timer manager start/stop
- Test chat line counting

### Integration Tests
- Create timer via web interface
- Edit and delete timers
- Test timer execution
- Test chat scope filtering

### Manual Testing
1. Create a timer with 1-minute interval
2. Verify timer fires correctly
3. Test minimum chat lines requirement
4. Test enabling/disabling timers
5. Test chat scope selection
6. Verify timer persists across bot restarts

### Security Testing
- Attempt SQL injection in timer name
- Test XSS in timer message
- Verify channel ownership checks
- Test CSRF protection on forms

## Git Commit

**Files to Stage:**
- `migrations/008_timers.sql`
- `src/database/repositories/timer-repo.js`
- `src/bot/managers/timer-manager.js`
- `src/web/routes/timers.js`
- `src/web/views/timers/list.ejs`
- `src/web/views/timers/form.ejs`
- `src/web/index.js` (updated)
- `src/bot/index.js` (updated)
- `src/web/views/layout.ejs` (updated navigation)

**Commit Message:**
```
feat(bot): add timer/scheduled messages system

- Add migration 008_timers.sql for timer tables
- Create timer-repo.js for data access
- Create timer-manager.js for scheduling logic
- Add web routes and views for timer management
- Support chat scope selection for multi-chat
- Include minimum chat lines requirement
- Integrate with bot core for auto-loading

Security: Input validation, parameterized queries
Phase 2 Task 01: Timer System
```

## Acceptance Criteria

- [ ] Database migration creates tables correctly
- [ ] Timers can be created with all fields
- [ ] Timers fire at specified intervals
- [ ] Minimum chat lines requirement works
- [ ] Timers can be enabled/disabled
- [ ] Timers can be edited and deleted
- [ ] Chat scope filtering works correctly
- [ ] Timers persist across bot restarts
- [ ] Timer manager handles channel disconnect
- [ ] All forms have CSRF protection
- [ ] Input validation prevents invalid data
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
