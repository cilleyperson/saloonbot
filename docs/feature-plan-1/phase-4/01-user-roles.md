# Task 01: User Roles System

## Task ID
`P4-T01`

## Prerequisites
- Phase 3 completed
- Loyalty Points System (P3-T01) for auto-promotion feature

## Objective
Implement a user role system that allows channels to designate "regular" viewers with special privileges, including automatic promotion based on watch time and manual assignment.

## Agent Type
`javascript-typescript:nodejs-backend-patterns` and `frontend-mobile-development:frontend-developer`

## Security Requirements
- Validate role assignments (only valid roles)
- Prevent unauthorized privilege escalation
- Rate limit role commands
- Audit all role changes
- Verify channel ownership on all operations
- Use parameterized queries only

## Implementation Steps

### Step 1: Create Database Migration

Create `migrations/014_user_roles.sql`:

```sql
-- Migration: 014_user_roles.sql
-- Description: User roles system (Regulars)

CREATE TABLE IF NOT EXISTS user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT DEFAULT 'regular',
  auto_promoted INTEGER DEFAULT 0,
  promoted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  promoted_by TEXT,
  notes TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE(channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS role_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL UNIQUE,
  auto_promote_enabled INTEGER DEFAULT 0,
  auto_promote_hours INTEGER DEFAULT 10,
  regular_exempt_links INTEGER DEFAULT 1,
  regular_exempt_caps INTEGER DEFAULT 1,
  regular_exempt_symbols INTEGER DEFAULT 1,
  regular_cooldown_reduction INTEGER DEFAULT 50,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_roles_channel ON user_roles(channel_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(channel_id, role);
```

### Step 2: Create User Role Repository

Create `src/database/repositories/user-role-repo.js`:

```javascript
/**
 * User Role Repository
 * Data access layer for user roles (regulars) system
 */
const { getDb } = require('../index');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('user-role-repo');

// Valid roles
const ROLES = {
  REGULAR: 'regular'
};

// ============================================
// Settings Functions
// ============================================

/**
 * Get role settings for a channel
 * @param {number} channelId - Channel ID
 * @returns {Object} Settings with defaults
 */
function getSettings(channelId) {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM role_settings WHERE channel_id = ?').get(channelId);

  if (!settings) {
    return {
      channel_id: channelId,
      auto_promote_enabled: 0,
      auto_promote_hours: 10,
      regular_exempt_links: 1,
      regular_exempt_caps: 1,
      regular_exempt_symbols: 1,
      regular_cooldown_reduction: 50
    };
  }

  return settings;
}

/**
 * Update role settings
 * @param {number} channelId - Channel ID
 * @param {Object} settings - Settings to update
 */
function updateSettings(channelId, settings) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM role_settings WHERE channel_id = ?').get(channelId);

  if (existing) {
    db.prepare(`
      UPDATE role_settings SET
        auto_promote_enabled = ?,
        auto_promote_hours = ?,
        regular_exempt_links = ?,
        regular_exempt_caps = ?,
        regular_exempt_symbols = ?,
        regular_cooldown_reduction = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE channel_id = ?
    `).run(
      settings.autoPromoteEnabled ? 1 : 0,
      settings.autoPromoteHours || 10,
      settings.regularExemptLinks ? 1 : 0,
      settings.regularExemptCaps ? 1 : 0,
      settings.regularExemptSymbols ? 1 : 0,
      settings.regularCooldownReduction || 50,
      channelId
    );
  } else {
    db.prepare(`
      INSERT INTO role_settings (
        channel_id, auto_promote_enabled, auto_promote_hours,
        regular_exempt_links, regular_exempt_caps, regular_exempt_symbols,
        regular_cooldown_reduction
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      channelId,
      settings.autoPromoteEnabled ? 1 : 0,
      settings.autoPromoteHours || 10,
      settings.regularExemptLinks ? 1 : 0,
      settings.regularExemptCaps ? 1 : 0,
      settings.regularExemptSymbols ? 1 : 0,
      settings.regularCooldownReduction || 50
    );
  }
}

// ============================================
// Role Functions
// ============================================

/**
 * Get user's role for a channel
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {Object|undefined} Role record or undefined
 */
function getUserRole(channelId, userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM user_roles
    WHERE channel_id = ? AND user_id = ?
  `).get(channelId, userId);
}

/**
 * Check if user has a specific role
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} role - Role to check
 * @returns {boolean} Has role
 */
function hasRole(channelId, userId, role) {
  const userRole = getUserRole(channelId, userId);
  return userRole && userRole.role === role;
}

/**
 * Check if user is a regular
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {boolean} Is regular
 */
function isRegular(channelId, userId) {
  return hasRole(channelId, userId, ROLES.REGULAR);
}

/**
 * Get all users with a specific role
 * @param {number} channelId - Channel ID
 * @param {string} role - Role to filter by (or null for all)
 * @returns {Array} Users with role
 */
function getUsersByRole(channelId, role = null) {
  const db = getDb();

  if (role) {
    return db.prepare(`
      SELECT * FROM user_roles
      WHERE channel_id = ? AND role = ?
      ORDER BY username ASC
    `).all(channelId, role);
  }

  return db.prepare(`
    SELECT * FROM user_roles
    WHERE channel_id = ?
    ORDER BY role, username ASC
  `).all(channelId);
}

/**
 * Get all regulars for a channel
 * @param {number} channelId - Channel ID
 * @returns {Array} Regular users
 */
function getRegulars(channelId) {
  return getUsersByRole(channelId, ROLES.REGULAR);
}

/**
 * Get regular count for a channel
 * @param {number} channelId - Channel ID
 * @returns {number} Count
 */
function getRegularCount(channelId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM user_roles
    WHERE channel_id = ? AND role = ?
  `).get(channelId, ROLES.REGULAR);
  return result.count;
}

/**
 * Add a role to a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {string} role - Role to add
 * @param {Object} options - Additional options
 * @returns {boolean} Success (false if already has role)
 */
function addRole(channelId, userId, username, role, options = {}) {
  const db = getDb();

  // Validate role
  if (!Object.values(ROLES).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  // Check if already has role
  const existing = getUserRole(channelId, userId);
  if (existing) {
    return false;
  }

  db.prepare(`
    INSERT INTO user_roles (channel_id, user_id, username, role, auto_promoted, promoted_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    channelId,
    userId,
    username,
    role,
    options.autoPromoted ? 1 : 0,
    options.promotedBy || null,
    options.notes || null
  );

  return true;
}

/**
 * Remove a role from a user
 * @param {number} channelId - Channel ID
 * @param {string} userId - User ID
 * @returns {boolean} Success
 */
function removeRole(channelId, userId) {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM user_roles
    WHERE channel_id = ? AND user_id = ?
  `).run(channelId, userId);
  return result.changes > 0;
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
    SELECT * FROM user_roles
    WHERE channel_id = ? AND username LIKE ?
    ORDER BY username ASC
    LIMIT 50
  `).all(channelId, `%${search}%`);
}

/**
 * Check and auto-promote users based on watch time
 * @param {number} channelId - Channel ID
 * @returns {Array} Newly promoted users
 */
function checkAutoPromotions(channelId) {
  const db = getDb();
  const settings = getSettings(channelId);

  if (!settings.auto_promote_enabled || settings.auto_promote_hours <= 0) {
    return [];
  }

  const requiredMinutes = settings.auto_promote_hours * 60;

  // Find users eligible for promotion (from loyalty system)
  const eligible = db.prepare(`
    SELECT up.user_id, up.username, up.watch_time_minutes
    FROM user_points up
    LEFT JOIN user_roles ur ON up.channel_id = ur.channel_id AND up.user_id = ur.user_id
    WHERE up.channel_id = ?
      AND up.watch_time_minutes >= ?
      AND ur.id IS NULL
  `).all(channelId, requiredMinutes);

  const promoted = [];

  for (const user of eligible) {
    const added = addRole(channelId, user.user_id, user.username, ROLES.REGULAR, {
      autoPromoted: true,
      notes: `Auto-promoted at ${user.watch_time_minutes} minutes watch time`
    });

    if (added) {
      promoted.push(user);
    }
  }

  return promoted;
}

module.exports = {
  ROLES,
  // Settings
  getSettings,
  updateSettings,
  // Roles
  getUserRole,
  hasRole,
  isRegular,
  getUsersByRole,
  getRegulars,
  getRegularCount,
  addRole,
  removeRole,
  searchUsers,
  checkAutoPromotions
};
```

### Step 3: Create Role Handler

Create `src/bot/handlers/role-handler.js`:

```javascript
/**
 * Role Handler
 * Handles chat commands for user roles
 */
const { createChildLogger } = require('../../utils/logger');
const userRoleRepo = require('../../database/repositories/user-role-repo');
const loyaltyRepo = require('../../database/repositories/loyalty-repo');

const logger = createChildLogger('role-handler');

// Rate limiting
const commandCooldowns = new Map();
const COMMAND_COOLDOWN_MS = 5000;

class RoleHandler {
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
   * Handle !regular add command (mod+)
   */
  async handleRegularAdd(channelId, channelName, userId, username, args, userInfo) {
    if (!this.isModerator(userInfo)) return;

    if (args.length === 0) {
      await this.chatClient.say(channelName, `@${username}, usage: !regular add <username>`);
      return;
    }

    const targetUsername = args[0].replace('@', '').toLowerCase();

    try {
      // Find user in loyalty system (to get user ID)
      const targetUsers = loyaltyRepo.searchUsers(channelId, targetUsername);
      if (targetUsers.length === 0) {
        await this.chatClient.say(
          channelName,
          `@${username}, user "${targetUsername}" not found. They need to chat first.`
        );
        return;
      }

      const target = targetUsers[0];

      // Add role
      const added = userRoleRepo.addRole(channelId, target.user_id, target.username, 'regular', {
        promotedBy: username
      });

      if (!added) {
        await this.chatClient.say(channelName, `@${username}, ${target.username} is already a regular!`);
        return;
      }

      await this.chatClient.say(
        channelName,
        `@${username}, @${target.username} is now a regular! 🌟`
      );

      logger.info('User promoted to regular', {
        channelId,
        target: target.user_id,
        promotedBy: username
      });

    } catch (error) {
      logger.error('Error adding regular', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to add regular.`);
    }
  }

  /**
   * Handle !regular remove command (mod+)
   */
  async handleRegularRemove(channelId, channelName, userId, username, args, userInfo) {
    if (!this.isModerator(userInfo)) return;

    if (args.length === 0) {
      await this.chatClient.say(channelName, `@${username}, usage: !regular remove <username>`);
      return;
    }

    const targetUsername = args[0].replace('@', '').toLowerCase();

    try {
      // Find user in role system
      const targetUsers = userRoleRepo.searchUsers(channelId, targetUsername);
      if (targetUsers.length === 0) {
        await this.chatClient.say(channelName, `@${username}, ${targetUsername} is not a regular.`);
        return;
      }

      const target = targetUsers[0];

      // Remove role
      const removed = userRoleRepo.removeRole(channelId, target.user_id);

      if (!removed) {
        await this.chatClient.say(channelName, `@${username}, ${target.username} is not a regular.`);
        return;
      }

      await this.chatClient.say(
        channelName,
        `@${username}, @${target.username} is no longer a regular.`
      );

      logger.info('User demoted from regular', {
        channelId,
        target: target.user_id,
        removedBy: username
      });

    } catch (error) {
      logger.error('Error removing regular', { channelId, error: error.message });
      await this.chatClient.say(channelName, `@${username}, failed to remove regular.`);
    }
  }

  /**
   * Handle !regular list command (mod+)
   */
  async handleRegularList(channelId, channelName, userId, username, userInfo) {
    if (!this.isModerator(userInfo)) return;

    try {
      const regulars = userRoleRepo.getRegulars(channelId);

      if (regulars.length === 0) {
        await this.chatClient.say(channelName, `@${username}, no regulars set for this channel.`);
        return;
      }

      // Show first 10
      const preview = regulars.slice(0, 10).map(r => r.username).join(', ');
      const moreText = regulars.length > 10 ? ` ... and ${regulars.length - 10} more` : '';

      await this.chatClient.say(
        channelName,
        `🌟 Regulars (${regulars.length}): ${preview}${moreText}`
      );

    } catch (error) {
      logger.error('Error listing regulars', { channelId, error: error.message });
    }
  }

  /**
   * Handle !regular check command
   */
  async handleRegularCheck(channelId, channelName, userId, username, args, userInfo) {
    // Rate limit
    const cooldownKey = `${channelId}:${userId}`;
    const lastCommand = commandCooldowns.get(cooldownKey);
    if (lastCommand && Date.now() - lastCommand < COMMAND_COOLDOWN_MS) {
      return;
    }
    commandCooldowns.set(cooldownKey, Date.now());

    try {
      let targetUserId = userId;
      let targetUsername = username;

      // Mods can check other users
      if (args.length > 0 && this.isModerator(userInfo)) {
        const searchName = args[0].replace('@', '').toLowerCase();
        const found = loyaltyRepo.searchUsers(channelId, searchName);
        if (found.length > 0) {
          targetUserId = found[0].user_id;
          targetUsername = found[0].username;
        }
      }

      const isRegular = userRoleRepo.isRegular(channelId, targetUserId);

      if (targetUserId === userId) {
        await this.chatClient.say(
          channelName,
          `@${username}, you ${isRegular ? 'are' : 'are not'} a regular! ${isRegular ? '🌟' : ''}`
        );
      } else {
        await this.chatClient.say(
          channelName,
          `@${username}, ${targetUsername} ${isRegular ? 'is' : 'is not'} a regular! ${isRegular ? '🌟' : ''}`
        );
      }

    } catch (error) {
      logger.error('Error checking regular status', { channelId, error: error.message });
    }
  }

  /**
   * Handle !regular command routing
   */
  async handleRegular(channelId, channelName, userId, username, args, userInfo) {
    if (args.length === 0) {
      // Show own status
      await this.handleRegularCheck(channelId, channelName, userId, username, [], userInfo);
      return;
    }

    const subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case 'add':
        await this.handleRegularAdd(channelId, channelName, userId, username, args.slice(1), userInfo);
        break;

      case 'remove':
      case 'delete':
        await this.handleRegularRemove(channelId, channelName, userId, username, args.slice(1), userInfo);
        break;

      case 'list':
        await this.handleRegularList(channelId, channelName, userId, username, userInfo);
        break;

      case 'check':
        await this.handleRegularCheck(channelId, channelName, userId, username, args.slice(1), userInfo);
        break;

      default:
        // Assume it's a username to check
        await this.handleRegularCheck(channelId, channelName, userId, username, args, userInfo);
    }
  }

  /**
   * Handle incoming command
   */
  async handleCommand(command, channelId, channelName, userId, username, args, userInfo) {
    if (command.toLowerCase() === 'regular') {
      await this.handleRegular(channelId, channelName, userId, username, args, userInfo);
      return true;
    }

    return false;
  }

  /**
   * Check user's effective exemptions based on role
   * @param {number} channelId - Channel ID
   * @param {string} userId - User ID
   * @returns {Object} Exemptions
   */
  getUserExemptions(channelId, userId) {
    const isRegular = userRoleRepo.isRegular(channelId, userId);

    if (!isRegular) {
      return {
        isRegular: false,
        exemptLinks: false,
        exemptCaps: false,
        exemptSymbols: false,
        cooldownReduction: 0
      };
    }

    const settings = userRoleRepo.getSettings(channelId);

    return {
      isRegular: true,
      exemptLinks: settings.regular_exempt_links === 1,
      exemptCaps: settings.regular_exempt_caps === 1,
      exemptSymbols: settings.regular_exempt_symbols === 1,
      cooldownReduction: settings.regular_cooldown_reduction || 0
    };
  }
}

module.exports = RoleHandler;
```

### Step 4: Integrate with Moderation System

Update the moderation handler to check for regular exemptions when processing messages.

### Step 5: Create Web Routes and Views

Create routes and views for managing regulars and role settings.

### Step 6: Create Auto-Promotion Job

Create a scheduled job to check for auto-promotions periodically (e.g., every hour).

## Testing Requirements

### Unit Tests
- Role assignment and removal
- Auto-promotion logic
- Exemption checking
- Settings persistence

### Integration Tests
- Full flow via chat commands
- Web interface management
- Moderation exemptions

### Manual Testing
1. !regular add username
2. Verify user is regular
3. Test moderation exemptions
4. !regular remove username
5. Test auto-promotion (requires loyalty system)

### Security Testing
- Privilege escalation attempts
- Rate limiting
- Authorization checks
- CSRF on forms

## Git Commit

**Commit Message:**
```
feat(bot): add user roles system (regulars)

- Add migration 014_user_roles.sql
- Create user-role-repo.js for role management
- Create role-handler.js for chat commands
- Implement !regular add/remove/list/check
- Support auto-promotion based on watch time
- Add moderation exemptions for regulars
- Web interface for role management

Security: Authorization checks, role validation, rate limiting
Phase 4 Task 01: User Roles System
```

## Acceptance Criteria

- [ ] !regular add promotes user to regular (mod+)
- [ ] !regular remove demotes user (mod+)
- [ ] !regular list shows all regulars (mod+)
- [ ] !regular check shows own or other's status
- [ ] Auto-promotion works based on watch time
- [ ] Regulars exempt from configured spam filters
- [ ] Regulars get reduced command cooldowns
- [ ] Web interface manages regulars
- [ ] Role changes are logged
- [ ] Rate limiting prevents spam
- [ ] All forms have CSRF protection
