# Task 02: Polls System

## Task ID
`P4-T02`

## Prerequisites
- Phase 2 completed (for command handling patterns)

## Objective
Implement an interactive polls system that allows channels to create polls with multiple options, collect votes from viewers, and display results.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `frontend-mobile-development:frontend-developer`

## Security Requirements
- One vote per user per poll
- Prevent vote manipulation
- Validate poll options (2-6 options)
- Rate limit vote commands
- Secure vote counting
- Prevent poll creation spam
- Use parameterized queries only

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/015_polls.sql`:

```sql
-- Migration: 015_polls.sql
-- Description: Polls system

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  duration_minutes INTEGER,
  subscriber_weight INTEGER DEFAULT 1,
  allow_change_vote INTEGER DEFAULT 0,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  created_by TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS poll_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  option_number INTEGER NOT NULL,
  option_text TEXT NOT NULL,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  UNIQUE(poll_id, option_number)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  option_number INTEGER NOT NULL,
  is_subscriber INTEGER DEFAULT 0,
  vote_weight INTEGER DEFAULT 1,
  voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  UNIQUE(poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_polls_channel ON polls(channel_id);
CREATE INDEX IF NOT EXISTS idx_polls_active ON polls(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_poll_votes ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(poll_id, option_number);
```

### Step 2: Create Poll Repository

Create `src/database/repositories/poll-repo.js`:

```javascript
/**
 * Poll Repository
 * Data access layer for polls system
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('poll-repo');

// Poll statuses
const STATUS = {
  ACTIVE: 'active',
  ENDED: 'ended',
  CANCELLED: 'cancelled'
};

// ============================================
// Poll Functions
// ============================================

/**
 * Get active poll for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object|undefined} Active poll with options or undefined
 */
function getActivePoll(channelId) {
  const db = getDb();
  const poll = db.prepare(`
    SELECT * FROM polls
    WHERE channel_id = ? AND status = 'active'
    LIMIT 1
  `).get(channelId);

  if (!poll) return undefined;

  // Get options
  poll.options = db.prepare(`
    SELECT * FROM poll_options
    WHERE poll_id = ?
    ORDER BY option_number ASC
  `).all(poll.id);

  return poll;
}

/**
 * Get poll by ID with options
 * @param {number} pollId - Poll ID
 * @returns {Object|undefined} Poll with options or undefined
 */
function getPollById(pollId) {
  const db = getDb();
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);

  if (!poll) return undefined;

  poll.options = db.prepare(`
    SELECT * FROM poll_options
    WHERE poll_id = ?
    ORDER BY option_number ASC
  `).all(poll.id);

  return poll;
}

/**
 * Get poll history for a channel
 * @param {number} channelId - Channel ID
 * @param {number} limit - Max results
 * @returns {Array} Past polls
 */
function getPollHistory(channelId, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM polls
    WHERE channel_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(channelId, limit);
}

/**
 * Create a new poll
 * @param {number} channelId - Channel ID
 * @param {Object} data - Poll data
 * @returns {number} New poll ID
 */
function createPoll(channelId, data) {
  const db = getDb();

  // Check for existing active poll
  const existing = getActivePoll(channelId);
  if (existing) {
    throw new Error('A poll is already active');
  }

  // Validate options
  if (!data.options || data.options.length < 2 || data.options.length > 6) {
    throw new Error('Poll must have 2-6 options');
  }

  return db.transaction(() => {
    // Create poll
    const result = db.prepare(`
      INSERT INTO polls (channel_id, question, status, duration_minutes, subscriber_weight, allow_change_vote, created_by)
      VALUES (?, ?, 'active', ?, ?, ?, ?)
    `).run(
      channelId,
      data.question,
      data.durationMinutes || null,
      data.subscriberWeight || 1,
      data.allowChangeVote ? 1 : 0,
      data.createdBy || null
    );

    const pollId = result.lastInsertRowid;

    // Add options
    const insertOption = db.prepare(`
      INSERT INTO poll_options (poll_id, option_number, option_text)
      VALUES (?, ?, ?)
    `);

    for (let i = 0; i < data.options.length; i++) {
      insertOption.run(pollId, i + 1, data.options[i].trim());
    }

    return pollId;
  })();
}

/**
 * End a poll
 * @param {number} pollId - Poll ID
 * @returns {boolean} Success
 */
function endPoll(pollId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE polls
    SET status = 'ended', ended_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'active'
  `).run(pollId);
  return result.changes > 0;
}

/**
 * Cancel a poll
 * @param {number} pollId - Poll ID
 * @returns {boolean} Success
 */
function cancelPoll(pollId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE polls
    SET status = 'cancelled', ended_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'active'
  `).run(pollId);
  return result.changes > 0;
}

// ============================================
// Vote Functions
// ============================================

/**
 * Cast a vote
 * @param {number} pollId - Poll ID
 * @param {Object} user - User info
 * @param {number} optionNumber - Option to vote for (1-based)
 * @returns {Object} Result with success and info
 */
function castVote(pollId, user, optionNumber) {
  const db = getDb();
  const poll = getPollById(pollId);

  if (!poll || poll.status !== 'active') {
    return { success: false, reason: 'Poll not active' };
  }

  // Validate option number
  if (optionNumber < 1 || optionNumber > poll.options.length) {
    return { success: false, reason: 'Invalid option' };
  }

  // Check for existing vote
  const existing = db.prepare(`
    SELECT * FROM poll_votes WHERE poll_id = ? AND user_id = ?
  `).get(pollId, user.userId);

  if (existing) {
    if (!poll.allow_change_vote) {
      return {
        success: false,
        reason: 'Already voted',
        previousVote: existing.option_number
      };
    }

    // Update vote
    db.prepare(`
      UPDATE poll_votes
      SET option_number = ?, voted_at = CURRENT_TIMESTAMP
      WHERE poll_id = ? AND user_id = ?
    `).run(optionNumber, pollId, user.userId);

    return {
      success: true,
      changed: true,
      previousVote: existing.option_number
    };
  }

  // Calculate vote weight
  let weight = 1;
  if (user.isSubscriber && poll.subscriber_weight > 1) {
    weight = poll.subscriber_weight;
  }

  // Insert vote
  db.prepare(`
    INSERT INTO poll_votes (poll_id, user_id, username, option_number, is_subscriber, vote_weight)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    pollId,
    user.userId,
    user.username,
    optionNumber,
    user.isSubscriber ? 1 : 0,
    weight
  );

  return { success: true, changed: false };
}

/**
 * Get vote counts for a poll
 * @param {number} pollId - Poll ID
 * @returns {Object} Vote counts by option
 */
function getVoteCounts(pollId) {
  const db = getDb();
  const poll = getPollById(pollId);

  if (!poll) return null;

  const counts = {};
  let totalVotes = 0;
  let totalWeight = 0;

  // Initialize counts
  for (const option of poll.options) {
    counts[option.option_number] = {
      optionNumber: option.option_number,
      optionText: option.option_text,
      votes: 0,
      weight: 0,
      percentage: 0
    };
  }

  // Get weighted counts
  const results = db.prepare(`
    SELECT option_number, COUNT(*) as votes, SUM(vote_weight) as weight
    FROM poll_votes
    WHERE poll_id = ?
    GROUP BY option_number
  `).all(pollId);

  for (const result of results) {
    if (counts[result.option_number]) {
      counts[result.option_number].votes = result.votes;
      counts[result.option_number].weight = result.weight;
      totalVotes += result.votes;
      totalWeight += result.weight;
    }
  }

  // Calculate percentages
  for (const key in counts) {
    if (totalWeight > 0) {
      counts[key].percentage = Math.round((counts[key].weight / totalWeight) * 100);
    }
  }

  return {
    options: Object.values(counts),
    totalVotes,
    totalWeight,
    uniqueVoters: totalVotes
  };
}

/**
 * Get winning option(s)
 * @param {number} pollId - Poll ID
 * @returns {Array} Winning option(s) (can be tie)
 */
function getWinners(pollId) {
  const counts = getVoteCounts(pollId);
  if (!counts || counts.totalWeight === 0) {
    return [];
  }

  const maxWeight = Math.max(...counts.options.map(o => o.weight));
  return counts.options.filter(o => o.weight === maxWeight);
}

/**
 * Get user's vote for a poll
 * @param {number} pollId - Poll ID
 * @param {string} userId - User ID
 * @returns {Object|undefined} Vote or undefined
 */
function getUserVote(pollId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM poll_votes
    WHERE poll_id = ? AND user_id = ?
  `).get(pollId, userId);
}

/**
 * Get all votes for a poll
 * @param {number} pollId - Poll ID
 * @returns {Array} All votes
 */
function getAllVotes(pollId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM poll_votes
    WHERE poll_id = ?
    ORDER BY voted_at ASC
  `).all(pollId);
}

module.exports = {
  STATUS,
  // Poll functions
  getActivePoll,
  getPollById,
  getPollHistory,
  createPoll,
  endPoll,
  cancelPoll,
  // Vote functions
  castVote,
  getVoteCounts,
  getWinners,
  getUserVote,
  getAllVotes
};
```

### Step 3: Create Poll Handler

Create `src/bot/handlers/poll-handler.js`:

```javascript
/**
 * Poll Handler
 * Handles chat commands for polls
 */
const { createChildLogger } = require('../../utils/logger');
const pollRepo = require('../../database/repositories/poll-repo');

const logger = createChildLogger('poll-handler');

// Rate limiting
const voteCooldowns = new Map();
const VOTE_COOLDOWN_MS = 2000;

// Active poll timers
const pollTimers = new Map(); // pollId -> timeoutId

class PollHandler {
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
   * Handle !poll command (create poll)
   */
  async handlePollCreate(channelId, channelName, userId, username, args, userInfo) {
    if (!this.isModerator(userInfo)) return;

    // Parse format: !poll Question? | Option 1 | Option 2 | ...
    const fullText = args.join(' ');
    const parts = fullText.split('|').map(p => p.trim()).filter(p => p.length > 0);

    if (parts.length < 3) {
      await this.chatClient.say(
        channelName,
        `@${username}, usage: !poll Question? | Option 1 | Option 2 [| Option 3...]`
      );
      return;
    }

    const question = parts[0];
    const options = parts.slice(1);

    if (options.length < 2 || options.length > 6) {
      await this.chatClient.say(channelName, `@${username}, polls must have 2-6 options.`);
      return;
    }

    try {
      // Check for existing poll
      const existing = pollRepo.getActivePoll(channelId);
      if (existing) {
        await this.chatClient.say(
          channelName,
          `@${username}, a poll is already active! Use !endpoll to finish it first.`
        );
        return;
      }

      const pollId = pollRepo.createPoll(channelId, {
        question,
        options,
        createdBy: username
      });

      // Format options for display
      const optionsText = options.map((opt, i) => `${i + 1}. ${opt}`).join(' | ');

      await this.chatClient.say(
        channelName,
        `📊 POLL: ${question}`
      );
      await this.chatClient.say(
        channelName,
        `Options: ${optionsText}`
      );
      await this.chatClient.say(
        channelName,
        `Vote with !vote <number> (e.g., !vote 1)`
      );

      logger.info('Poll created', { channelId, pollId, question, optionCount: options.length });

    } catch (error) {
      logger.error('Error creating poll', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to create poll.`);
    }
  }

  /**
   * Handle !vote command
   */
  async handleVote(channelId, channelName, userId, username, args, userInfo) {
    // Rate limit
    const cooldownKey = `${channelId}:${userId}`;
    const lastVote = voteCooldowns.get(cooldownKey);
    if (lastVote && Date.now() - lastVote < VOTE_COOLDOWN_MS) {
      return;
    }
    voteCooldowns.set(cooldownKey, Date.now());

    if (args.length === 0) {
      await this.chatClient.say(channelName, `@${username}, usage: !vote <number>`);
      return;
    }

    const optionNumber = parseInt(args[0], 10);
    if (isNaN(optionNumber)) {
      await this.chatClient.say(channelName, `@${username}, please enter a valid option number.`);
      return;
    }

    try {
      const poll = pollRepo.getActivePoll(channelId);
      if (!poll) {
        await this.chatClient.say(channelName, `@${username}, no active poll.`);
        return;
      }

      const result = pollRepo.castVote(poll.id, {
        userId,
        username,
        isSubscriber: userInfo.isSubscriber
      }, optionNumber);

      if (!result.success) {
        switch (result.reason) {
          case 'Already voted':
            const votedOption = poll.options.find(o => o.option_number === result.previousVote);
            await this.chatClient.say(
              channelName,
              `@${username}, you already voted for "${votedOption?.option_text || result.previousVote}"!`
            );
            break;
          case 'Invalid option':
            await this.chatClient.say(
              channelName,
              `@${username}, invalid option. Choose 1-${poll.options.length}.`
            );
            break;
          default:
            await this.chatClient.say(channelName, `@${username}, couldn't register vote.`);
        }
        return;
      }

      const option = poll.options.find(o => o.option_number === optionNumber);

      if (result.changed) {
        await this.chatClient.say(
          channelName,
          `@${username}, vote changed to "${option?.option_text}"!`
        );
      } else {
        // Silent acknowledgment or brief confirmation
        logger.debug('Vote cast', { channelId, pollId: poll.id, userId, option: optionNumber });
      }

    } catch (error) {
      logger.error('Error casting vote', { channelId, error: error.message });
    }
  }

  /**
   * Handle !endpoll command (mod+)
   */
  async handleEndPoll(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      const poll = pollRepo.getActivePoll(channelId);
      if (!poll) {
        await this.chatClient.say(channelName, `@${username}, no active poll to end.`);
        return;
      }

      pollRepo.endPoll(poll.id);

      // Get results
      const counts = pollRepo.getVoteCounts(poll.id);
      const winners = pollRepo.getWinners(poll.id);

      // Format results
      const resultsText = counts.options
        .sort((a, b) => b.weight - a.weight)
        .map(o => `${o.optionText}: ${o.percentage}% (${o.votes} votes)`)
        .join(' | ');

      await this.chatClient.say(
        channelName,
        `📊 POLL ENDED: ${poll.question}`
      );

      await this.chatClient.say(
        channelName,
        `Results: ${resultsText}`
      );

      if (winners.length === 1) {
        await this.chatClient.say(
          channelName,
          `🏆 Winner: ${winners[0].optionText} (${winners[0].percentage}%)`
        );
      } else if (winners.length > 1) {
        const winnerNames = winners.map(w => w.optionText).join(', ');
        await this.chatClient.say(
          channelName,
          `🏆 Tie! Winners: ${winnerNames}`
        );
      } else {
        await this.chatClient.say(channelName, `No votes were cast.`);
      }

      logger.info('Poll ended', {
        channelId,
        pollId: poll.id,
        totalVotes: counts.totalVotes,
        winner: winners[0]?.optionText
      });

    } catch (error) {
      logger.error('Error ending poll', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to end poll.`);
    }
  }

  /**
   * Handle !pollresults command
   */
  async handlePollResults(channelId, channelName, userId, username, userInfo) {
    try {
      const poll = pollRepo.getActivePoll(channelId);
      if (!poll) {
        await this.chatClient.say(channelName, `@${username}, no active poll.`);
        return;
      }

      const counts = pollRepo.getVoteCounts(poll.id);

      const resultsText = counts.options
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4) // Top 4
        .map(o => `${o.optionText}: ${o.percentage}%`)
        .join(' | ');

      await this.chatClient.say(
        channelName,
        `📊 Current results (${counts.totalVotes} votes): ${resultsText}`
      );

    } catch (error) {
      logger.error('Error getting poll results', { channelId, error: error.message });
    }
  }

  /**
   * Handle !cancelpoll command (mod+)
   */
  async handleCancelPoll(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      const poll = pollRepo.getActivePoll(channelId);
      if (!poll) {
        await this.chatClient.say(channelName, `@${username}, no active poll to cancel.`);
        return;
      }

      pollRepo.cancelPoll(poll.id);

      await this.chatClient.say(channelName, `Poll "${poll.question}" has been cancelled.`);

      logger.info('Poll cancelled', { channelId, pollId: poll.id, cancelledBy: username });

    } catch (error) {
      logger.error('Error cancelling poll', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to cancel poll.`);
    }
  }

  /**
   * Handle incoming command
   */
  async handleCommand(command, channelId, channelName, userId, username, args, userInfo) {
    const cmd = command.toLowerCase();

    switch (cmd) {
      case 'poll':
        await this.handlePollCreate(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'vote':
        await this.handleVote(channelId, channelName, userId, username, args, userInfo);
        return true;

      case 'endpoll':
        await this.handleEndPoll(channelId, channelName, userId, username, userInfo);
        return true;

      case 'pollresults':
      case 'results':
        await this.handlePollResults(channelId, channelName, userId, username, userInfo);
        return true;

      case 'cancelpoll':
        await this.handleCancelPoll(channelId, channelName, userId, username, userInfo);
        return true;

      default:
        return false;
    }
  }
}

module.exports = PollHandler;
```

### Step 4: Create Web Routes and Views

Create routes and views for web-based poll creation and results viewing.

### Step 5: Integrate with Bot Core

Register the handler and connect to chat events.

## Testing Requirements

### Unit Tests
- Poll creation with options
- Vote casting and counting
- Weighted votes (subscriber)
- Winner determination (including ties)

### Integration Tests
- Full poll flow via chat
- Web interface
- Vote change (when allowed)

### Manual Testing
1. !poll Question? | A | B | C
2. Multiple users voting
3. !pollresults to see current state
4. !endpoll to end and show results
5. Test subscriber weight
6. Test vote changing

### Security Testing
- One vote per user
- Rate limiting
- Invalid option handling
- CSRF on web forms

## Git Commit

**Commit Message:**
```
feat(bot): add polls system

- Add migration 015_polls.sql
- Create poll-repo.js with vote management
- Create poll-handler.js for chat commands
- Implement !poll, !vote, !endpoll, !pollresults
- Support 2-6 options per poll
- Optional subscriber vote weight
- Percentage calculation and tie handling
- Web interface for poll management

Security: One vote per user, rate limiting, vote validation
Phase 4 Task 02: Polls System
```

## Acceptance Criteria

- [ ] !poll creates poll with question and options
- [ ] !vote registers user's vote
- [ ] One vote per user enforced
- [ ] !pollresults shows current standings
- [ ] !endpoll ends poll and shows final results
- [ ] Winner(s) announced correctly
- [ ] Ties handled properly
- [ ] Subscriber vote weighting works
- [ ] Vote change works when enabled
- [ ] Web interface shows poll management
- [ ] Rate limiting prevents spam
- [ ] All forms have CSRF protection
