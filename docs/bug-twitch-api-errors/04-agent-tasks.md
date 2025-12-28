# Agent Task Definitions: Parallel Implementation

## Overview

This document defines the tasks that can be executed by Claude Code agents in parallel. Each task is self-contained with clear inputs, outputs, and acceptance criteria.

## Task Dependencies Graph

```
                    ┌─────────────────┐
                    │  Task 1         │
                    │  DB Migration   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Task 2         │
                    │  Auth Repo      │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Task 3         │ │  Task 4         │ │  Task 5         │
│  Auth Manager   │ │  OAuth Routes   │ │  Channel Mgr    │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Task 6         │
                    │  BotCore        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Task 7         │
                    │  Integration    │
                    └─────────────────┘
```

## Parallel Execution Groups

| Group | Tasks | Can Run In Parallel |
|-------|-------|---------------------|
| 1 | Task 1 | No (foundation) |
| 2 | Task 2 | No (depends on 1) |
| 3 | Tasks 3, 4, 5 | Yes (all depend on 2) |
| 4 | Task 6 | No (depends on 3) |
| 5 | Task 7 | No (final integration) |

---

## Task 1: Database Migration

### Description
Create the SQL migration file to add `twitch_user_id` column to auth tables.

### Files to Create/Modify
- `migrations/012_auth_twitch_id.sql` (CREATE)
- `src/database/schema.js` (MODIFY)

### Implementation Details

**Create `migrations/012_auth_twitch_id.sql`:**
```sql
-- Migration 012: Add twitch_user_id to auth tables
-- This enables proper token lookup by Twitch user ID

-- Add twitch_user_id column to channel_auth
ALTER TABLE channel_auth ADD COLUMN twitch_user_id TEXT;

-- Backfill from channels table
UPDATE channel_auth
SET twitch_user_id = (
  SELECT twitch_id FROM channels WHERE channels.id = channel_auth.channel_id
);

-- Add twitch_user_id column to bot_auth
ALTER TABLE bot_auth ADD COLUMN twitch_user_id TEXT;
```

**Update `src/database/schema.js`:**
- Change `CURRENT_VERSION` from 11 to 12
- Add migration 12 to the migrations object

### Acceptance Criteria
- [ ] Migration file exists and is valid SQL
- [ ] Schema version incremented
- [ ] Running migrations succeeds
- [ ] Existing channel_auth rows have twitch_user_id populated

### Estimated Complexity
Low - Straightforward schema change

---

## Task 2: Auth Repository Updates

### Description
Add new methods and update existing methods in auth-repo.js to support Twitch user ID storage and retrieval.

### Files to Modify
- `src/database/repositories/auth-repo.js`

### Implementation Details

**New methods to add:**
1. `getChannelTwitchId(channelId)` - Get Twitch ID for a channel
2. `updateChannelTwitchId(channelId, twitchUserId)` - Update Twitch ID
3. `getAllChannelAuthsWithTwitchId()` - Get all auths with Twitch IDs
4. `saveBotAuthWithTwitchId(twitchUserId, accessToken, refreshToken, scopes)`
5. `getBotAuthWithTwitchId()` - Get bot auth with Twitch ID
6. `updateChannelAuthByTwitchId(twitchUserId, accessToken, refreshToken)` - Update by Twitch ID

**Existing methods to update:**
1. `saveChannelAuth()` - Add twitchUserId parameter

### Acceptance Criteria
- [ ] All new methods implemented with proper encryption/decryption
- [ ] Existing `saveChannelAuth` updated with new parameter
- [ ] Fallback behavior for legacy data without twitch_user_id
- [ ] Token encryption applied to all token storage operations

### Estimated Complexity
Medium - Multiple methods with encryption logic

---

## Task 3: Auth Manager Refactoring

### Description
Completely refactor AuthManager to use a single multi-user RefreshingAuthProvider instead of separate providers per channel.

### Files to Modify
- `src/bot/auth-manager.js`

### Implementation Details

**Remove:**
- `channelAuthProviders` Map
- Separate provider creation per channel
- `getChannelAuthProvider()` method
- `getBotAuthProvider()` method (replace with `getAuthProvider()`)

**Add:**
- Single `authProvider` property (RefreshingAuthProvider)
- `botTwitchId` property
- `channelTwitchIds` Set for tracking
- `getAuthProvider()` method
- `addBotToken(twitchId, accessToken, refreshToken, scopes)`
- `addChannelToken(channelId, twitchId, accessToken, refreshToken, scopes)`
- `hasChannelToken(twitchId)`
- `_handleTokenRefresh(userId, token)`
- `_loadBotAuth()`
- `_loadAllChannelAuths()`

**Key behavior changes:**
- All tokens registered with actual Twitch user ID (not empty string)
- Bot tokens use `['chat']` intents
- Channel tokens use `['channel']` intents
- Token refresh callback saves to correct location

### Acceptance Criteria
- [ ] Single auth provider manages all tokens
- [ ] Tokens registered with actual Twitch user IDs
- [ ] Bot can retrieve tokens for any registered user
- [ ] Token refresh persists to database correctly
- [ ] Backward compatibility with existing auth entries

### Estimated Complexity
High - Core architectural change

---

## Task 4: OAuth Routes Updates

### Description
Update OAuth callback routes to properly store Twitch user ID with tokens and use the new AuthManager API.

### Files to Modify
- `src/web/routes/auth.js`

### Implementation Details

**Add helper function:**
```javascript
async function getUserInfo(accessToken) {
  // Fetch from Twitch Helix API /users endpoint
}
```

**Update `/callback` route:**
1. After token exchange, call `getUserInfo(accessToken)` to get Twitch ID
2. For bot auth: Call `authManager.addBotToken(twitchId, ...)`
3. For channel auth: Call `authManager.addChannelToken(channelId, twitchId, ...)`

**Error handling:**
- Handle case where user info fetch fails
- Log appropriate messages for debugging

### Acceptance Criteria
- [ ] Bot callback stores Twitch ID
- [ ] Channel callback stores Twitch ID
- [ ] Twitch API errors handled gracefully
- [ ] Existing OAuth flow works correctly

### Estimated Complexity
Medium - API integration with error handling

---

## Task 5: Channel Manager Updates

### Description
Update ChannelManager to verify token existence before creating EventSub subscriptions.

### Files to Modify
- `src/bot/channel-manager.js`

### Implementation Details

**Update `subscribeToEvents(channel)`:**
1. Before creating subscriptions, check `authManager.hasChannelToken(twitchId)`
2. If no token, log warning and skip subscriptions
3. Keep existing subscription logic otherwise

**Update error handling:**
- Catch and log subscription errors
- Don't crash on individual subscription failures

### Acceptance Criteria
- [ ] Token check before EventSub creation
- [ ] Graceful handling of missing tokens
- [ ] Proper error logging
- [ ] Existing functionality preserved for valid tokens

### Estimated Complexity
Low - Validation and error handling

---

## Task 6: BotCore Integration

### Description
Update BotCore to use the new AuthManager API and shared auth provider.

### Files to Modify
- `src/bot/index.js`

### Implementation Details

**Update `initialize()`:**
1. Replace `authManager.getBotAuthProvider()` with `authManager.getAuthProvider()`
2. Use single auth provider for ApiClient, ChatClient, and EventSubWsListener
3. Update authentication check to use `authManager.isBotAuthenticated()`

**Remove deprecated code:**
- Any references to channel-specific auth providers
- Multiple auth provider patterns

### Acceptance Criteria
- [ ] All clients use shared auth provider
- [ ] Bot initializes correctly
- [ ] EventSub has access to all channel tokens
- [ ] Chat functionality works

### Estimated Complexity
Medium - Integration of multiple components

---

## Task 7: Integration Testing

### Description
Verify the complete flow works end-to-end after all components are updated.

### Test Scenarios

1. **Fresh Bot Start**
   - Start with empty database
   - Authorize bot account
   - Verify bot token stored with Twitch ID

2. **Channel Authorization**
   - Add new channel via OAuth
   - Verify channel token stored with Twitch ID
   - Verify EventSub subscription succeeds

3. **Existing Data Migration**
   - Start with existing channel_auth entries
   - Verify Twitch IDs backfilled from channels table
   - Verify EventSub works for existing channels

4. **Token Refresh**
   - Force token expiration/refresh
   - Verify refreshed token saved correctly
   - Verify EventSub continues working

5. **EventSub Subscriptions**
   - Subscribe to raid events
   - Subscribe to subscription events
   - Verify no "token not found" errors

### Acceptance Criteria
- [ ] All test scenarios pass
- [ ] No regression in existing functionality
- [ ] Error logs are clean
- [ ] EventSub events received correctly

### Estimated Complexity
High - End-to-end verification

---

## Agent Prompts

### Prompt for Task 1 (Database Migration)
```
Create a database migration for the EventSub token fix:

1. Create migrations/012_auth_twitch_id.sql:
   - Add twitch_user_id TEXT column to channel_auth table
   - Backfill twitch_user_id from channels.twitch_id
   - Add twitch_user_id TEXT column to bot_auth table

2. Update src/database/schema.js:
   - Increment CURRENT_VERSION to 12
   - Add migration 12 to the migrations object

Follow existing migration patterns in the codebase.
```

### Prompt for Task 2 (Auth Repository)
```
Update src/database/repositories/auth-repo.js to support Twitch user ID storage:

1. Add new methods:
   - getChannelTwitchId(channelId)
   - updateChannelTwitchId(channelId, twitchUserId)
   - getAllChannelAuthsWithTwitchId()
   - saveBotAuthWithTwitchId(twitchUserId, accessToken, refreshToken, scopes)
   - getBotAuthWithTwitchId()
   - updateChannelAuthByTwitchId(twitchUserId, accessToken, refreshToken)

2. Update saveChannelAuth() to accept twitchUserId parameter

3. Ensure all token operations use encryption/decryption

Reference the existing code patterns for encryption.
```

### Prompt for Task 3 (Auth Manager)
```
Refactor src/bot/auth-manager.js to use a single multi-user RefreshingAuthProvider:

See 02-solution-architecture.md and 03-implementation-plan.md for:
- New class structure
- Method implementations
- Token registration with Twitch user IDs
- Intent configuration (['chat'] for bot, ['channel'] for channels)

Key changes:
- Replace multiple providers with single authProvider
- Add botTwitchId and channelTwitchIds tracking
- Update all token operations to use actual Twitch IDs
```

### Prompt for Task 4 (OAuth Routes)
```
Update src/web/routes/auth.js for the new auth architecture:

1. Add getUserInfo(accessToken) helper to fetch user from Twitch Helix API

2. Update /callback route:
   - Call getUserInfo to get Twitch user ID
   - For bot: authManager.addBotToken(twitchId, ...)
   - For channel: authManager.addChannelToken(channelId, twitchId, ...)

3. Add proper error handling for API calls

Reference existing route patterns and error handling.
```

### Prompt for Task 5 (Channel Manager)
```
Update src/bot/channel-manager.js to verify tokens before EventSub:

1. In subscribeToEvents(channel):
   - Check authManager.hasChannelToken(channel.twitch_id)
   - If no token, log warning and skip subscriptions
   - Otherwise proceed with existing subscription logic

2. Add try/catch around subscription creation with logging

Keep existing subscription handlers and logic intact.
```

### Prompt for Task 6 (BotCore)
```
Update src/bot/index.js for the new auth architecture:

1. Replace getBotAuthProvider() with getAuthProvider()
2. Use shared authProvider for:
   - ApiClient creation
   - ChatClient creation
   - EventSubWsListener creation
3. Update auth check to use isBotAuthenticated()

Remove any channel-specific auth provider code.
```
