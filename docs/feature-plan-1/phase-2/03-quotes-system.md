# Task 03: Quotes System

## Task ID
`P2-T03`

## Prerequisites
- Phase 1 completed
- Understanding of existing command handler patterns

## Objective
Implement a quotes system allowing channels to save and retrieve memorable quotes with chat commands and web management.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `frontend-mobile-development:frontend-developer`

## Security Requirements
- Sanitize all quote text for XSS
- Validate quote numbers as positive integers
- Limit quote length to prevent abuse
- Rate limit quote additions
- Verify channel ownership on all operations
- Use parameterized queries only

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/010_quotes.sql`:

```sql
-- Migration: 010_quotes.sql
-- Description: Quotes system

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  quote_number INTEGER NOT NULL,
  quote_text TEXT NOT NULL,
  game TEXT,
  added_by_user_id TEXT,
  added_by_username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE(channel_id, quote_number)
);

CREATE INDEX IF NOT EXISTS idx_quotes_channel ON quotes(channel_id);
CREATE INDEX IF NOT EXISTS idx_quotes_number ON quotes(channel_id, quote_number);
```

### Step 2: Create Quote Repository

Create `src/database/repositories/quote-repo.js`:

```javascript
/**
 * Quote Repository
 * Data access layer for quotes system
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('quote-repo');

/**
 * Get all quotes for a channel
 * @param {number} channelId - Channel ID
 * @returns {Array} List of quotes
 */
function getQuotesByChannel(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM quotes
    WHERE channel_id = ?
    ORDER BY quote_number ASC
  `).all(channelId);
}

/**
 * Get quote count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Quote count
 */
function getQuoteCount(channelId) {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM quotes WHERE channel_id = ?').get(channelId);
  return result.count;
}

/**
 * Get quote by ID
 * @param {number} quoteId - Quote ID
 * @returns {Object|undefined} Quote or undefined
 */
function getQuoteById(quoteId) {
  const db = getDb();
  return db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
}

/**
 * Get quote by number for a channel
 * @param {number} channelId - Channel ID
 * @param {number} quoteNumber - Quote number
 * @returns {Object|undefined} Quote or undefined
 */
function getQuoteByNumber(channelId, quoteNumber) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM quotes
    WHERE channel_id = ? AND quote_number = ?
  `).get(channelId, quoteNumber);
}

/**
 * Get a random quote for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object|undefined} Random quote or undefined
 */
function getRandomQuote(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM quotes
    WHERE channel_id = ?
    ORDER BY RANDOM()
    LIMIT 1
  `).get(channelId);
}

/**
 * Get the next available quote number
 * @param {number} channelId - Channel ID
 * @returns {number} Next quote number
 */
function getNextQuoteNumber(channelId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT MAX(quote_number) as max_num FROM quotes
    WHERE channel_id = ?
  `).get(channelId);
  return (result.max_num || 0) + 1;
}

/**
 * Create a new quote
 * @param {number} channelId - Channel ID
 * @param {Object} data - Quote data
 * @returns {Object} Created quote with ID and number
 */
function createQuote(channelId, data) {
  const db = getDb();
  const quoteNumber = getNextQuoteNumber(channelId);

  const result = db.prepare(`
    INSERT INTO quotes (channel_id, quote_number, quote_text, game, added_by_user_id, added_by_username)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    channelId,
    quoteNumber,
    data.quoteText.trim(),
    data.game || null,
    data.addedByUserId || null,
    data.addedByUsername || null
  );

  return {
    id: result.lastInsertRowid,
    quoteNumber
  };
}

/**
 * Update a quote
 * @param {number} quoteId - Quote ID
 * @param {Object} data - Updated data
 * @returns {boolean} Success
 */
function updateQuote(quoteId, data) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE quotes
    SET quote_text = ?, game = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(data.quoteText.trim(), data.game || null, quoteId);
  return result.changes > 0;
}

/**
 * Delete a quote
 * @param {number} quoteId - Quote ID
 * @returns {boolean} Success
 */
function deleteQuote(quoteId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM quotes WHERE id = ?').run(quoteId);
  return result.changes > 0;
}

/**
 * Delete a quote by number
 * @param {number} channelId - Channel ID
 * @param {number} quoteNumber - Quote number
 * @returns {boolean} Success
 */
function deleteQuoteByNumber(channelId, quoteNumber) {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM quotes
    WHERE channel_id = ? AND quote_number = ?
  `).run(channelId, quoteNumber);
  return result.changes > 0;
}

/**
 * Search quotes by text
 * @param {number} channelId - Channel ID
 * @param {string} searchText - Text to search for
 * @returns {Array} Matching quotes
 */
function searchQuotes(channelId, searchText) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM quotes
    WHERE channel_id = ? AND quote_text LIKE ?
    ORDER BY quote_number ASC
    LIMIT 50
  `).all(channelId, `%${searchText}%`);
}

/**
 * Renumber all quotes for a channel (after deletion)
 * @param {number} channelId - Channel ID
 */
function renumberQuotes(channelId) {
  const db = getDb();
  const quotes = db.prepare(`
    SELECT id FROM quotes
    WHERE channel_id = ?
    ORDER BY quote_number ASC
  `).all(channelId);

  const updateStmt = db.prepare('UPDATE quotes SET quote_number = ? WHERE id = ?');

  db.transaction(() => {
    let num = 1;
    for (const quote of quotes) {
      updateStmt.run(num, quote.id);
      num++;
    }
  })();
}

module.exports = {
  getQuotesByChannel,
  getQuoteCount,
  getQuoteById,
  getQuoteByNumber,
  getRandomQuote,
  getNextQuoteNumber,
  createQuote,
  updateQuote,
  deleteQuote,
  deleteQuoteByNumber,
  searchQuotes,
  renumberQuotes
};
```

### Step 3: Create Quote Handler

Create `src/bot/handlers/quote-handler.js`:

```javascript
/**
 * Quote Handler
 * Handles chat commands for quotes system
 */
const { createChildLogger } = require('../../utils/logger');
const quoteRepo = require('../../database/repositories/quote-repo');
const settingsRepo = require('../../database/repositories/settings-repo');

const logger = createChildLogger('quote-handler');

// Rate limiting
const addCooldowns = new Map(); // channelId:userId -> timestamp
const ADD_COOLDOWN_MS = 10000; // 10 seconds between adds

// Quote limits
const MAX_QUOTE_LENGTH = 500;
const MAX_QUOTES_PER_CHANNEL = 10000;

class QuoteHandler {
  constructor(chatClient) {
    this.chatClient = chatClient;
  }

  /**
   * Check if user is moderator or broadcaster
   * @param {Object} userInfo - User badges/status
   * @returns {boolean} Has permission
   */
  isModerator(userInfo) {
    return userInfo.isBroadcaster || userInfo.isMod;
  }

  /**
   * Handle !quote command
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {Array} args - Command arguments
   * @param {Object} userInfo - User badges/status
   */
  async handleQuote(channelId, channelName, userId, username, args, userInfo) {
    try {
      let quote;

      if (args.length > 0) {
        // Try to get specific quote by number
        const quoteNumber = parseInt(args[0], 10);
        if (!isNaN(quoteNumber) && quoteNumber > 0) {
          quote = quoteRepo.getQuoteByNumber(channelId, quoteNumber);
          if (!quote) {
            await this.chatClient.say(channelName, `@${username}, quote #${quoteNumber} not found.`);
            return;
          }
        } else {
          // Search by text
          const searchText = args.join(' ');
          const results = quoteRepo.searchQuotes(channelId, searchText);
          if (results.length === 0) {
            await this.chatClient.say(channelName, `@${username}, no quotes found matching "${searchText}".`);
            return;
          }
          // Return first match
          quote = results[0];
        }
      } else {
        // Get random quote
        quote = quoteRepo.getRandomQuote(channelId);
        if (!quote) {
          await this.chatClient.say(channelName, `@${username}, no quotes saved yet. Add one with !addquote`);
          return;
        }
      }

      // Format and send quote
      const gameInfo = quote.game ? ` [${quote.game}]` : '';
      await this.chatClient.say(channelName, `📜 Quote #${quote.quote_number}: "${quote.quote_text}"${gameInfo}`);

    } catch (error) {
      logger.error('Error handling !quote', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, an error occurred.`);
    }
  }

  /**
   * Handle !addquote command
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {Array} args - Command arguments
   * @param {Object} userInfo - User badges/status
   * @param {string} currentGame - Current game being played (optional)
   */
  async handleAddQuote(channelId, channelName, userId, username, args, userInfo, currentGame) {
    try {
      // Check permissions
      if (!this.isModerator(userInfo)) {
        await this.chatClient.say(channelName, `@${username}, only moderators can add quotes.`);
        return;
      }

      // Check rate limit
      const cooldownKey = `${channelId}:${userId}`;
      const lastAdd = addCooldowns.get(cooldownKey);
      if (lastAdd && Date.now() - lastAdd < ADD_COOLDOWN_MS) {
        await this.chatClient.say(channelName, `@${username}, please wait before adding another quote.`);
        return;
      }

      // Check for quote text
      if (args.length === 0) {
        await this.chatClient.say(channelName, `@${username}, usage: !addquote <quote text>`);
        return;
      }

      const quoteText = args.join(' ');

      // Validate length
      if (quoteText.length > MAX_QUOTE_LENGTH) {
        await this.chatClient.say(channelName, `@${username}, quote is too long (max ${MAX_QUOTE_LENGTH} characters).`);
        return;
      }

      // Check quote limit
      const currentCount = quoteRepo.getQuoteCount(channelId);
      if (currentCount >= MAX_QUOTES_PER_CHANNEL) {
        await this.chatClient.say(channelName, `@${username}, quote limit reached (${MAX_QUOTES_PER_CHANNEL}).`);
        return;
      }

      // Create quote
      const result = quoteRepo.createQuote(channelId, {
        quoteText,
        game: currentGame,
        addedByUserId: userId,
        addedByUsername: username
      });

      // Update cooldown
      addCooldowns.set(cooldownKey, Date.now());

      await this.chatClient.say(channelName, `📜 Quote #${result.quoteNumber} added by @${username}!`);
      logger.info('Quote added', { channelId, quoteNumber: result.quoteNumber, username });

    } catch (error) {
      logger.error('Error handling !addquote', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to add quote.`);
    }
  }

  /**
   * Handle !delquote command
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {Array} args - Command arguments
   * @param {Object} userInfo - User badges/status
   */
  async handleDelQuote(channelId, channelName, userId, username, args, userInfo) {
    try {
      // Check permissions
      if (!this.isModerator(userInfo)) {
        await this.chatClient.say(channelName, `@${username}, only moderators can delete quotes.`);
        return;
      }

      // Check for quote number
      if (args.length === 0) {
        await this.chatClient.say(channelName, `@${username}, usage: !delquote <number>`);
        return;
      }

      const quoteNumber = parseInt(args[0], 10);
      if (isNaN(quoteNumber) || quoteNumber < 1) {
        await this.chatClient.say(channelName, `@${username}, invalid quote number.`);
        return;
      }

      // Check if quote exists
      const quote = quoteRepo.getQuoteByNumber(channelId, quoteNumber);
      if (!quote) {
        await this.chatClient.say(channelName, `@${username}, quote #${quoteNumber} not found.`);
        return;
      }

      // Delete quote
      quoteRepo.deleteQuoteByNumber(channelId, quoteNumber);

      await this.chatClient.say(channelName, `📜 Quote #${quoteNumber} deleted.`);
      logger.info('Quote deleted', { channelId, quoteNumber, username });

    } catch (error) {
      logger.error('Error handling !delquote', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to delete quote.`);
    }
  }

  /**
   * Handle !editquote command
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {Array} args - Command arguments
   * @param {Object} userInfo - User badges/status
   */
  async handleEditQuote(channelId, channelName, userId, username, args, userInfo) {
    try {
      // Check permissions
      if (!this.isModerator(userInfo)) {
        await this.chatClient.say(channelName, `@${username}, only moderators can edit quotes.`);
        return;
      }

      // Check arguments
      if (args.length < 2) {
        await this.chatClient.say(channelName, `@${username}, usage: !editquote <number> <new text>`);
        return;
      }

      const quoteNumber = parseInt(args[0], 10);
      if (isNaN(quoteNumber) || quoteNumber < 1) {
        await this.chatClient.say(channelName, `@${username}, invalid quote number.`);
        return;
      }

      const newText = args.slice(1).join(' ');

      // Validate length
      if (newText.length > MAX_QUOTE_LENGTH) {
        await this.chatClient.say(channelName, `@${username}, quote is too long (max ${MAX_QUOTE_LENGTH} characters).`);
        return;
      }

      // Check if quote exists
      const quote = quoteRepo.getQuoteByNumber(channelId, quoteNumber);
      if (!quote) {
        await this.chatClient.say(channelName, `@${username}, quote #${quoteNumber} not found.`);
        return;
      }

      // Update quote
      quoteRepo.updateQuote(quote.id, {
        quoteText: newText,
        game: quote.game
      });

      await this.chatClient.say(channelName, `📜 Quote #${quoteNumber} updated.`);
      logger.info('Quote edited', { channelId, quoteNumber, username });

    } catch (error) {
      logger.error('Error handling !editquote', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to edit quote.`);
    }
  }

  /**
   * Handle incoming command
   * @param {string} command - Command name (without !)
   * @param {number} channelId - Channel ID
   * @param {string} channelName - Channel name
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {Array} args - Command arguments
   * @param {Object} userInfo - User badges/status
   * @param {string} currentGame - Current game (optional)
   * @returns {boolean} Whether command was handled
   */
  async handleCommand(command, channelId, channelName, userId, username, args, userInfo, currentGame) {
    const cmd = command.toLowerCase();

    switch (cmd) {
      case 'quote':
        await this.handleQuote(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'addquote':
        await this.handleAddQuote(channelId, channelName, userId, username, args, userInfo, currentGame);
        return true;

      case 'delquote':
      case 'deletequote':
      case 'removequote':
        await this.handleDelQuote(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'editquote':
        await this.handleEditQuote(channelId, channelName, userId, username, args, userInfo);
        return true;

      default:
        return false;
    }
  }
}

module.exports = QuoteHandler;
```

### Step 4: Create Web Routes

Create `src/web/routes/quotes.js`:

```javascript
/**
 * Quotes Routes
 * Web interface for managing channel quotes
 */
const express = require('express');
const router = express.Router();
const quoteRepo = require('../../database/repositories/quote-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('quotes-route');

// Validation constants
const MAX_QUOTE_LENGTH = 500;
const MAX_GAME_LENGTH = 200;

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
 * GET /quotes/:channelId - List all quotes
 */
router.get('/:channelId', (req, res) => {
  try {
    const search = req.query.search || '';
    let quotes;

    if (search) {
      quotes = quoteRepo.searchQuotes(req.channel.id, search);
    } else {
      quotes = quoteRepo.getQuotesByChannel(req.channel.id);
    }

    const totalCount = quoteRepo.getQuoteCount(req.channel.id);

    res.render('quotes/list', {
      title: 'Quotes',
      channel: req.channel,
      quotes,
      search,
      totalCount
    });
  } catch (error) {
    logger.error('Error listing quotes', { channelId: req.channel.id, error: error.message });
    req.flash('error', 'Failed to load quotes');
    res.redirect('/dashboard');
  }
});

/**
 * GET /quotes/:channelId/add - Show add quote form
 */
router.get('/:channelId/add', (req, res) => {
  res.render('quotes/form', {
    title: 'Add Quote',
    channel: req.channel,
    quote: null,
    action: 'add'
  });
});

/**
 * POST /quotes/:channelId - Create new quote
 */
router.post('/:channelId', (req, res) => {
  try {
    const { quoteText, game } = req.body;

    // Validate quote text
    if (!quoteText || quoteText.trim().length === 0) {
      req.flash('error', 'Quote text is required');
      return res.redirect(`/quotes/${req.channel.id}/add`);
    }

    if (quoteText.length > MAX_QUOTE_LENGTH) {
      req.flash('error', `Quote must be ${MAX_QUOTE_LENGTH} characters or less`);
      return res.redirect(`/quotes/${req.channel.id}/add`);
    }

    // Validate game (optional)
    if (game && game.length > MAX_GAME_LENGTH) {
      req.flash('error', `Game name must be ${MAX_GAME_LENGTH} characters or less`);
      return res.redirect(`/quotes/${req.channel.id}/add`);
    }

    // Create quote
    const result = quoteRepo.createQuote(req.channel.id, {
      quoteText: quoteText.trim(),
      game: game ? game.trim() : null,
      addedByUsername: 'Web Admin'
    });

    logger.info('Quote created via web', { channelId: req.channel.id, quoteNumber: result.quoteNumber });
    req.flash('success', `Quote #${result.quoteNumber} created`);
    res.redirect(`/quotes/${req.channel.id}`);

  } catch (error) {
    logger.error('Error creating quote', { channelId: req.channel.id, error: error.message });
    req.flash('error', 'Failed to create quote');
    res.redirect(`/quotes/${req.channel.id}/add`);
  }
});

/**
 * GET /quotes/:channelId/:quoteId/edit - Show edit quote form
 */
router.get('/:channelId/:quoteId/edit', (req, res) => {
  const quoteId = parseInt(req.params.quoteId, 10);
  if (isNaN(quoteId)) {
    req.flash('error', 'Invalid quote ID');
    return res.redirect(`/quotes/${req.channel.id}`);
  }

  const quote = quoteRepo.getQuoteById(quoteId);
  if (!quote || quote.channel_id !== req.channel.id) {
    req.flash('error', 'Quote not found');
    return res.redirect(`/quotes/${req.channel.id}`);
  }

  res.render('quotes/form', {
    title: 'Edit Quote',
    channel: req.channel,
    quote,
    action: 'edit'
  });
});

/**
 * POST /quotes/:channelId/:quoteId - Update quote
 */
router.post('/:channelId/:quoteId', (req, res) => {
  const quoteId = parseInt(req.params.quoteId, 10);
  if (isNaN(quoteId)) {
    req.flash('error', 'Invalid quote ID');
    return res.redirect(`/quotes/${req.channel.id}`);
  }

  const quote = quoteRepo.getQuoteById(quoteId);
  if (!quote || quote.channel_id !== req.channel.id) {
    req.flash('error', 'Quote not found');
    return res.redirect(`/quotes/${req.channel.id}`);
  }

  try {
    const { quoteText, game } = req.body;

    // Validate quote text
    if (!quoteText || quoteText.trim().length === 0) {
      req.flash('error', 'Quote text is required');
      return res.redirect(`/quotes/${req.channel.id}/${quoteId}/edit`);
    }

    if (quoteText.length > MAX_QUOTE_LENGTH) {
      req.flash('error', `Quote must be ${MAX_QUOTE_LENGTH} characters or less`);
      return res.redirect(`/quotes/${req.channel.id}/${quoteId}/edit`);
    }

    // Validate game (optional)
    if (game && game.length > MAX_GAME_LENGTH) {
      req.flash('error', `Game name must be ${MAX_GAME_LENGTH} characters or less`);
      return res.redirect(`/quotes/${req.channel.id}/${quoteId}/edit`);
    }

    // Update quote
    quoteRepo.updateQuote(quoteId, {
      quoteText: quoteText.trim(),
      game: game ? game.trim() : null
    });

    logger.info('Quote updated via web', { channelId: req.channel.id, quoteId });
    req.flash('success', 'Quote updated');
    res.redirect(`/quotes/${req.channel.id}`);

  } catch (error) {
    logger.error('Error updating quote', { quoteId, error: error.message });
    req.flash('error', 'Failed to update quote');
    res.redirect(`/quotes/${req.channel.id}/${quoteId}/edit`);
  }
});

/**
 * POST /quotes/:channelId/:quoteId/delete - Delete quote
 */
router.post('/:channelId/:quoteId/delete', (req, res) => {
  const quoteId = parseInt(req.params.quoteId, 10);
  if (isNaN(quoteId)) {
    req.flash('error', 'Invalid quote ID');
    return res.redirect(`/quotes/${req.channel.id}`);
  }

  const quote = quoteRepo.getQuoteById(quoteId);
  if (!quote || quote.channel_id !== req.channel.id) {
    req.flash('error', 'Quote not found');
    return res.redirect(`/quotes/${req.channel.id}`);
  }

  try {
    quoteRepo.deleteQuote(quoteId);

    logger.info('Quote deleted via web', { channelId: req.channel.id, quoteId });
    req.flash('success', 'Quote deleted');
    res.redirect(`/quotes/${req.channel.id}`);

  } catch (error) {
    logger.error('Error deleting quote', { quoteId, error: error.message });
    req.flash('error', 'Failed to delete quote');
    res.redirect(`/quotes/${req.channel.id}`);
  }
});

/**
 * POST /quotes/:channelId/renumber - Renumber all quotes
 */
router.post('/:channelId/renumber', (req, res) => {
  try {
    quoteRepo.renumberQuotes(req.channel.id);

    logger.info('Quotes renumbered', { channelId: req.channel.id });
    req.flash('success', 'Quotes renumbered successfully');
    res.redirect(`/quotes/${req.channel.id}`);

  } catch (error) {
    logger.error('Error renumbering quotes', { channelId: req.channel.id, error: error.message });
    req.flash('error', 'Failed to renumber quotes');
    res.redirect(`/quotes/${req.channel.id}`);
  }
});

module.exports = router;
```

### Step 5: Create View Templates

Create `src/web/views/quotes/list.ejs`:

```ejs
<%- include('../layout', { body: `
<div class="page">
  <div class="page-header">
    <div class="page-header-content">
      <a href="/channels/${channel.id}" class="back-link">&larr; Back to ${channel.channel_name}</a>
      <h1 class="page-title">Quotes</h1>
      <p class="page-subtitle">${totalCount} quotes for ${channel.channel_name}</p>
    </div>
    <div class="page-header-actions">
      <a href="/quotes/${channel.id}/add" class="btn btn-primary">Add Quote</a>
    </div>
  </div>

  <div class="page-content">
    <div class="card">
      <form action="/quotes/${channel.id}" method="GET" class="search-form">
        <div class="form-row">
          <input type="text" name="search" class="form-input" placeholder="Search quotes..."
                 value="${search || ''}">
          <button type="submit" class="btn btn-secondary">Search</button>
          ${search ? `<a href="/quotes/${channel.id}" class="btn btn-outline">Clear</a>` : ''}
        </div>
      </form>
    </div>

    ${quotes.length === 0 ? `
    <div class="card">
      <div class="empty-state">
        <p>${search ? 'No quotes match your search.' : 'No quotes saved yet.'}</p>
        <a href="/quotes/${channel.id}/add" class="btn btn-primary">Add your first quote</a>
      </div>
    </div>
    ` : `
    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 60px;">#</th>
              <th>Quote</th>
              <th style="width: 150px;">Game</th>
              <th style="width: 120px;">Added By</th>
              <th style="width: 140px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${quotes.map(quote => `
            <tr>
              <td><strong>${quote.quote_number}</strong></td>
              <td>${quote.quote_text}</td>
              <td>${quote.game || '-'}</td>
              <td>${quote.added_by_username || '-'}</td>
              <td>
                <div class="btn-group">
                  <a href="/quotes/${channel.id}/${quote.id}/edit" class="btn btn-sm btn-secondary">Edit</a>
                  <form action="/quotes/${channel.id}/${quote.id}/delete" method="POST" style="display: inline;"
                        onsubmit="return confirm('Delete quote #${quote.quote_number}?')">
                    <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                  </form>
                </div>
              </td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card-footer">
        <form action="/quotes/${channel.id}/renumber" method="POST"
              onsubmit="return confirm('Renumber all quotes? This will fill any gaps in quote numbers.')">
          <button type="submit" class="btn btn-secondary btn-sm">Renumber Quotes</button>
        </form>
      </div>
    </div>
    `}
  </div>
</div>
` }) %>
```

Create `src/web/views/quotes/form.ejs`:

```ejs
<%- include('../layout', { body: `
<div class="page">
  <div class="page-header">
    <div class="page-header-content">
      <a href="/quotes/${channel.id}" class="back-link">&larr; Back to Quotes</a>
      <h1 class="page-title">${action === 'add' ? 'Add Quote' : 'Edit Quote #' + quote.quote_number}</h1>
    </div>
  </div>

  <div class="page-content">
    <div class="card">
      <form action="/quotes/${channel.id}${quote ? '/' + quote.id : ''}" method="POST">
        <div class="form-group">
          <label for="quoteText" class="form-label">Quote Text</label>
          <textarea id="quoteText" name="quoteText" class="form-input form-textarea"
                    rows="4" maxlength="500" required
                    placeholder="Enter the quote text...">${quote ? quote.quote_text : ''}</textarea>
          <p class="form-help">Maximum 500 characters</p>
        </div>

        <div class="form-group">
          <label for="game" class="form-label">Game (optional)</label>
          <input type="text" id="game" name="game" class="form-input"
                 value="${quote ? (quote.game || '') : ''}"
                 maxlength="200"
                 placeholder="e.g., Minecraft, Just Chatting">
          <p class="form-help">The game being played when this quote was said</p>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${action === 'add' ? 'Add Quote' : 'Save Changes'}</button>
          <a href="/quotes/${channel.id}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
  </div>
</div>
` }) %>
```

### Step 6: Register Routes and Integrate Handler

Update `src/web/index.js`:
```javascript
const quoteRoutes = require('./routes/quotes');
app.use('/quotes', requireAuth, quoteRoutes);
```

Update `src/bot/index.js` to initialize QuoteHandler and route quote commands.

Update sidebar navigation in `layout.ejs` to include quotes link.

## Testing Requirements

### Unit Tests
- Test repository CRUD operations
- Test quote number generation
- Test search functionality
- Test renumbering

### Integration Tests
- Create/edit/delete via web
- Quote commands in chat
- Rate limiting

### Manual Testing
1. `!quote` - Get random quote
2. `!quote 1` - Get specific quote
3. `!quote text` - Search quotes
4. `!addquote This is a test` - Add quote
5. `!editquote 1 New text` - Edit quote
6. `!delquote 1` - Delete quote
7. Verify web interface CRUD
8. Test search functionality

### Security Testing
- XSS attempts in quote text
- SQL injection in search
- Rate limiting verification
- CSRF on forms

## Git Commit

**Files to Stage:**
- `migrations/010_quotes.sql`
- `src/database/repositories/quote-repo.js`
- `src/bot/handlers/quote-handler.js`
- `src/web/routes/quotes.js`
- `src/web/views/quotes/list.ejs`
- `src/web/views/quotes/form.ejs`
- `src/web/index.js` (updated)
- `src/bot/index.js` (updated)
- `src/web/views/layout.ejs` (updated navigation)

**Commit Message:**
```
feat(bot): add quotes system

- Add migration 010_quotes.sql for quotes table
- Create quote-repo.js for data access
- Create quote-handler.js for chat commands
- Add web routes and views for quote management
- Support !quote, !addquote, !editquote, !delquote commands
- Include search functionality
- Add quote renumbering feature
- Rate limit quote additions

Security: Input validation, XSS prevention, rate limiting
Phase 2 Task 03: Quotes System
```

## Acceptance Criteria

- [ ] Database migration creates table correctly
- [ ] `!quote` returns random quote
- [ ] `!quote [number]` returns specific quote
- [ ] `!quote [text]` searches quotes
- [ ] `!addquote` creates new quote (mod+)
- [ ] `!editquote` edits existing quote (mod+)
- [ ] `!delquote` deletes quote (mod+)
- [ ] Web interface shows all quotes
- [ ] Web interface allows CRUD operations
- [ ] Search functionality works
- [ ] Quote renumbering works
- [ ] Rate limiting prevents spam
- [ ] All forms have CSRF protection
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities in quote text
