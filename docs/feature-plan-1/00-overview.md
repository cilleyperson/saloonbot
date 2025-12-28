# Feature Plan 1 - Implementation Overview

## Executive Summary

This plan implements features identified in Feature Review 1 to bring Saloon Bot to feature parity with leading Twitch chatbots. Implementation is divided into 4 phases with atomic tasks optimized for Claude Code agent execution.

## Guiding Principles

1. **Security First** - All inputs validated, outputs sanitized, queries parameterized
2. **Preserve Existing** - No breaking changes to current functionality
3. **Test Everything** - Unit tests, integration tests, manual verification
4. **Commit Logically** - Atomic commits with clear boundaries
5. **Document Changes** - Update CLAUDE.md and README.md as needed

## Phase Summary

| Phase | Focus | Tasks | Est. Duration |
|-------|-------|-------|---------------|
| 1 | Admin Interface Modernization | 6 | 2-3 weeks |
| 2 | Core Bot Features | 3 | 3-4 weeks |
| 3 | Engagement Features | 3 | 4-5 weeks |
| 4 | Advanced Features | 2 | 2-3 weeks |

## Branch Strategy

```
master
  └── feature/phase-1-ui-modernization
        ├── phase-1-css-foundation
        ├── phase-1-layout
        ├── phase-1-components
        ├── phase-1-theme
        ├── phase-1-pages
        └── phase-1-polish

  └── feature/phase-2-core-features
        ├── phase-2-timers
        ├── phase-2-moderation
        └── phase-2-quotes

  └── feature/phase-3-engagement
        ├── phase-3-loyalty
        ├── phase-3-giveaways
        └── phase-3-queue

  └── feature/phase-4-advanced
        ├── phase-4-roles
        └── phase-4-polls
```

## Database Migration Sequence

```
migrations/
├── 001_initial_schema.sql       (existing)
├── 002_chat_scope.sql           (existing)
├── 003_predefined_commands.sql  (existing)
├── 004_command_responses.sql    (existing)
├── 005_emoji_support.sql        (existing)
├── 006_trivia_stats.sql         (existing)
├── 007_admin_users.sql          (existing)
├── 008_timers.sql               (Phase 2)
├── 009_moderation.sql           (Phase 2)
├── 010_quotes.sql               (Phase 2)
├── 011_loyalty.sql              (Phase 3)
├── 012_giveaways.sql            (Phase 3)
├── 013_queue.sql                (Phase 3)
├── 014_user_roles.sql           (Phase 4)
└── 015_polls.sql                (Phase 4)
```

## File Naming Conventions

### Repositories
```
src/database/repositories/{feature}-repo.js
Example: timer-repo.js, moderation-repo.js
```

### Handlers
```
src/bot/handlers/{feature}-handler.js
Example: timer-handler.js, moderation-handler.js
```

### Managers (for complex state)
```
src/bot/managers/{feature}-manager.js
Example: timer-manager.js, loyalty-manager.js
```

### Web Routes
```
src/web/routes/{feature}.js
Example: timers.js, moderation.js
```

### Views
```
src/web/views/{feature}/
  ├── list.ejs
  ├── form.ejs
  ├── detail.ejs (if needed)
  └── settings.ejs (if needed)
```

## Security Checklist (Apply to Every Task)

### Input Validation
- [ ] Validate all request body fields
- [ ] Validate all URL parameters
- [ ] Validate all query parameters
- [ ] Check data types and ranges
- [ ] Sanitize strings for XSS

### Database Security
- [ ] Use parameterized queries only
- [ ] Validate foreign key references exist
- [ ] Check channel ownership before operations
- [ ] Use transactions for multi-table operations

### Authentication & Authorization
- [ ] Require authentication on all routes
- [ ] Verify channel ownership/access
- [ ] Check user permission levels
- [ ] Include CSRF token on all forms

### Output Security
- [ ] Escape all dynamic content in templates
- [ ] Set appropriate Content-Type headers
- [ ] Use security headers (already configured via Helmet)

## Testing Checklist (Apply to Every Task)

### Unit Tests
- [ ] Test all handler functions
- [ ] Test edge cases (empty inputs, max values)
- [ ] Test error conditions
- [ ] Mock external dependencies

### Integration Tests
- [ ] Test database operations end-to-end
- [ ] Test API endpoints
- [ ] Test with realistic data volumes

### Manual Testing
- [ ] Test UI on desktop browser
- [ ] Test UI on mobile device
- [ ] Test with screen reader (accessibility)
- [ ] Test dark mode appearance

### Security Testing
- [ ] Test with invalid CSRF token
- [ ] Test with missing authentication
- [ ] Test with SQL injection attempts
- [ ] Test with XSS payloads

## Common Patterns

### Repository Pattern
```javascript
// Example: src/database/repositories/timer-repo.js
const { getDb } = require('../index');

function getTimersByChannel(channelId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM channel_timers
    WHERE channel_id = ?
    ORDER BY name
  `).all(channelId);
}

function createTimer(channelId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO channel_timers (channel_id, name, message, interval_minutes)
    VALUES (?, ?, ?, ?)
  `).run(channelId, data.name, data.message, data.intervalMinutes);
  return result.lastInsertRowid;
}

module.exports = {
  getTimersByChannel,
  createTimer,
  // ... other functions
};
```

### Handler Pattern
```javascript
// Example: src/bot/handlers/timer-handler.js
const { createChildLogger } = require('../../utils/logger');
const timerRepo = require('../../database/repositories/timer-repo');

const logger = createChildLogger('timer-handler');

class TimerHandler {
  constructor(chatClient) {
    this.chatClient = chatClient;
    this.activeTimers = new Map();
  }

  async startTimersForChannel(channelId, channelName) {
    const timers = timerRepo.getTimersByChannel(channelId);
    // ... implementation
  }

  // ... other methods
}

module.exports = TimerHandler;
```

### Route Pattern
```javascript
// Example: src/web/routes/timers.js
const express = require('express');
const router = express.Router();
const timerRepo = require('../../database/repositories/timer-repo');
const channelRepo = require('../../database/repositories/channel-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('timers-route');

// Middleware to verify channel access
router.use('/:channelId', async (req, res, next) => {
  const channel = channelRepo.getById(req.params.channelId);
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

// GET /timers/:channelId - List timers
router.get('/:channelId', (req, res) => {
  const timers = timerRepo.getTimersByChannel(req.channel.id);
  res.render('timers/list', {
    title: 'Timers',
    channel: req.channel,
    timers
  });
});

// ... other routes

module.exports = router;
```

### EJS Template Pattern
```ejs
<%- include('../layout', { body: `
<div class="page">
  ${(function() {
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    return `
    <div class="page-header">
      <h1>Page Title</h1>
    </div>
    <div class="page-content">
      <!-- Content here -->
    </div>
    `;
  })()}
</div>
` }) %>
```

## Error Handling Pattern

```javascript
// In routes
router.post('/:channelId', async (req, res) => {
  try {
    // Validate input
    const { name, message, intervalMinutes } = req.body;

    if (!name || !message || !intervalMinutes) {
      req.flash('error', 'All fields are required');
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    // Validate data types
    const interval = parseInt(intervalMinutes, 10);
    if (isNaN(interval) || interval < 1 || interval > 60) {
      req.flash('error', 'Interval must be between 1 and 60 minutes');
      return res.redirect(`/timers/${req.channel.id}/add`);
    }

    // Create record
    timerRepo.createTimer(req.channel.id, { name, message, intervalMinutes: interval });

    req.flash('success', 'Timer created successfully');
    res.redirect(`/timers/${req.channel.id}`);

  } catch (error) {
    logger.error('Error creating timer', { error: error.message });
    req.flash('error', 'An error occurred while creating the timer');
    res.redirect(`/timers/${req.channel.id}`);
  }
});
```

## Agent Execution Commands

### Starting a Phase
```bash
# Create feature branch
git checkout -b feature/phase-N-description

# Run existing tests to ensure baseline
npm test
```

### Completing a Task
```bash
# Run tests
npm test

# Stage files
git add [files specified in task]

# Commit with message from task
git commit -m "[message from task]"
```

### Completing a Phase
```bash
# Ensure all tests pass
npm test

# Merge to master (or create PR)
git checkout master
git merge feature/phase-N-description

# Tag the release
git tag vX.Y.Z-phase-N
```
