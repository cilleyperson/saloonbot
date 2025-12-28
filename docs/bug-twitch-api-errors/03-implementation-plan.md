# Implementation Plan: Multi-User Auth Provider Pattern

## Phase 1: Database Schema Migration

### Step 1.1: Create Migration File

Create `migrations/012_auth_twitch_id.sql`:

```sql
-- Add twitch_user_id column to channel_auth table
ALTER TABLE channel_auth ADD COLUMN twitch_user_id TEXT;

-- Backfill from channels table
UPDATE channel_auth
SET twitch_user_id = (
  SELECT twitch_id FROM channels WHERE channels.id = channel_auth.channel_id
);

-- Add twitch_user_id column to bot_auth table (for consistency)
ALTER TABLE bot_auth ADD COLUMN twitch_user_id TEXT;
```

### Step 1.2: Update Schema Version

In `src/database/schema.js`:
- Increment `CURRENT_VERSION` to 12
- Add migration 12 to the migrations array

## Phase 2: Auth Repository Updates

### Step 2.1: Update `src/database/repositories/auth-repo.js`

**Add methods:**

```javascript
// Get Twitch user ID for a channel auth
getChannelTwitchId(channelId) {
  const row = this.db.prepare(`
    SELECT twitch_user_id FROM channel_auth WHERE channel_id = ?
  `).get(channelId);
  return row?.twitch_user_id || null;
}

// Update Twitch user ID for a channel auth
updateChannelTwitchId(channelId, twitchUserId) {
  this.db.prepare(`
    UPDATE channel_auth SET twitch_user_id = ? WHERE channel_id = ?
  `).run(twitchUserId, channelId);
}

// Get all channel auths with Twitch user IDs
getAllChannelAuthsWithTwitchId() {
  return this.db.prepare(`
    SELECT
      ca.channel_id,
      ca.twitch_user_id,
      ca.access_token,
      ca.refresh_token,
      ca.scopes,
      ca.expires_at,
      c.twitch_id as channel_twitch_id
    FROM channel_auth ca
    LEFT JOIN channels c ON c.id = ca.channel_id
  `).all();
}

// Save bot auth with Twitch user ID
saveBotAuthWithTwitchId(twitchUserId, accessToken, refreshToken, scopes) {
  // Encrypt tokens before saving
  const encryptedAccess = this.encryptToken(accessToken);
  const encryptedRefresh = this.encryptToken(refreshToken);

  this.db.prepare(`
    INSERT OR REPLACE INTO bot_auth
    (id, twitch_user_id, access_token, refresh_token, scopes)
    VALUES (1, ?, ?, ?, ?)
  `).run(twitchUserId, encryptedAccess, encryptedRefresh, scopes);
}

// Get bot auth with Twitch user ID
getBotAuthWithTwitchId() {
  const row = this.db.prepare(`
    SELECT twitch_user_id, access_token, refresh_token, scopes
    FROM bot_auth WHERE id = 1
  `).get();

  if (row) {
    return {
      ...row,
      access_token: this.decryptToken(row.access_token),
      refresh_token: this.decryptToken(row.refresh_token)
    };
  }
  return null;
}
```

**Update existing methods:**

```javascript
// Update saveChannelAuth to include twitch_user_id
saveChannelAuth(channelId, twitchUserId, accessToken, refreshToken, scopes) {
  const encryptedAccess = this.encryptToken(accessToken);
  const encryptedRefresh = this.encryptToken(refreshToken);

  this.db.prepare(`
    INSERT OR REPLACE INTO channel_auth
    (channel_id, twitch_user_id, access_token, refresh_token, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(channelId, twitchUserId, encryptedAccess, encryptedRefresh, scopes, null);
}
```

## Phase 3: Auth Manager Refactoring

### Step 3.1: Refactor `src/bot/auth-manager.js`

**Replace class structure:**

```javascript
class AuthManager {
  constructor() {
    this.authProvider = null;        // Single multi-user provider
    this.botTwitchId = null;         // Bot's Twitch user ID
    this.channelTwitchIds = new Set(); // Track registered channel IDs
    this.logger = createChildLogger('auth-manager');
  }

  /**
   * Initialize the single auth provider with all tokens
   */
  async initialize() {
    this.authProvider = new RefreshingAuthProvider({
      clientId: config.twitch.clientId,
      clientSecret: config.twitch.clientSecret
    });

    // Set up refresh callback for all users
    this.authProvider.onRefresh((userId, token) => {
      this._handleTokenRefresh(userId, token);
    });

    // Load bot token
    await this._loadBotAuth();

    // Load all channel tokens
    await this._loadAllChannelAuths();

    this.logger.info(`Initialized with ${this.channelTwitchIds.size} channel tokens`);
  }

  /**
   * Get the single auth provider (used by BotCore)
   */
  getAuthProvider() {
    return this.authProvider;
  }

  /**
   * Check if bot is authenticated
   */
  isBotAuthenticated() {
    return this.botTwitchId !== null;
  }

  /**
   * Get bot's Twitch user ID
   */
  getBotTwitchId() {
    return this.botTwitchId;
  }

  /**
   * Add or update bot's token
   */
  async addBotToken(twitchId, accessToken, refreshToken, scopes) {
    this.botTwitchId = twitchId;

    const scopeArray = Array.isArray(scopes) ? scopes : scopes.split(' ');

    this.authProvider.addUser(twitchId, {
      accessToken,
      refreshToken,
      scope: scopeArray,
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['chat']);  // Bot needs chat intents

    // Save to database
    authRepo.saveBotAuthWithTwitchId(twitchId, accessToken, refreshToken,
      scopeArray.join(' '));

    this.logger.info(`Added bot token for Twitch ID ${twitchId}`);
  }

  /**
   * Add or update channel's token
   */
  async addChannelToken(channelId, twitchId, accessToken, refreshToken, scopes) {
    const scopeArray = Array.isArray(scopes) ? scopes : scopes.split(' ');

    this.authProvider.addUser(twitchId, {
      accessToken,
      refreshToken,
      scope: scopeArray,
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['channel']);  // Channels don't need chat intents

    this.channelTwitchIds.add(twitchId);

    // Save to database
    authRepo.saveChannelAuth(channelId, twitchId, accessToken, refreshToken,
      scopeArray.join(' '));

    this.logger.info(`Added channel token for Twitch ID ${twitchId}`);
  }

  /**
   * Check if a channel has a registered token
   */
  hasChannelToken(twitchId) {
    return this.channelTwitchIds.has(twitchId);
  }

  /**
   * Handle token refresh (save to DB)
   */
  async _handleTokenRefresh(userId, token) {
    this.logger.debug(`Token refreshed for user ${userId}`);

    if (userId === this.botTwitchId) {
      authRepo.updateBotAuth(token.accessToken, token.refreshToken);
    } else {
      authRepo.updateChannelAuthByTwitchId(userId, token.accessToken, token.refreshToken);
    }
  }

  /**
   * Load bot auth from database
   */
  async _loadBotAuth() {
    const botAuth = authRepo.getBotAuthWithTwitchId();

    if (botAuth && botAuth.twitch_user_id) {
      this.botTwitchId = botAuth.twitch_user_id;

      this.authProvider.addUser(botAuth.twitch_user_id, {
        accessToken: botAuth.access_token,
        refreshToken: botAuth.refresh_token,
        scope: botAuth.scopes.split(' '),
        expiresIn: 0,
        obtainmentTimestamp: Date.now()
      }, ['chat']);

      this.logger.info(`Loaded bot token for Twitch ID ${botAuth.twitch_user_id}`);
    } else if (botAuth) {
      // Legacy bot auth without Twitch ID - need to fetch it
      this.logger.warn('Bot auth exists but missing Twitch ID - will be set on next OAuth');
    }
  }

  /**
   * Load all channel auths from database
   */
  async _loadAllChannelAuths() {
    const channelAuths = authRepo.getAllChannelAuthsWithTwitchId();

    for (const auth of channelAuths) {
      // Use stored twitch_user_id, fallback to channel.twitch_id
      const twitchId = auth.twitch_user_id || auth.channel_twitch_id;

      if (!twitchId) {
        this.logger.warn(`Channel ${auth.channel_id} has no Twitch ID - skipping`);
        continue;
      }

      // Update database if we used fallback
      if (!auth.twitch_user_id && auth.channel_twitch_id) {
        authRepo.updateChannelTwitchId(auth.channel_id, auth.channel_twitch_id);
      }

      this.authProvider.addUser(twitchId, {
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token,
        scope: auth.scopes.split(' '),
        expiresIn: 0,
        obtainmentTimestamp: Date.now()
      }, ['channel']);

      this.channelTwitchIds.add(twitchId);
    }

    this.logger.info(`Loaded ${this.channelTwitchIds.size} channel tokens`);
  }
}
```

## Phase 4: BotCore Integration

### Step 4.1: Update `src/bot/index.js`

**Update initialization:**

```javascript
async initialize() {
  // Initialize auth manager
  await authManager.initialize();

  if (!authManager.isBotAuthenticated()) {
    this.logger.warn('Bot is not authenticated - visit /auth/bot to authorize');
    return false;
  }

  // Create API client with the SHARED multi-user auth provider
  const authProvider = authManager.getAuthProvider();
  this.apiClient = new ApiClient({ authProvider });

  // Create Chat client (same auth provider, but uses bot's token for chat)
  this.chatClient = new ChatClient({
    authProvider,
    channels: [],
    isAlwaysMod: false
  });

  // Create EventSub listener (uses apiClient which has ALL tokens)
  this.eventSubListener = new EventSubWsListener({
    apiClient: this.apiClient
  });

  // ... rest of initialization
}
```

**Remove deprecated methods:**

- Remove `getChannelAuthProvider(channelId)` if exists
- Remove any channel-specific auth provider creation

## Phase 5: OAuth Callback Updates

### Step 5.1: Update `src/web/routes/auth.js`

**Update bot callback:**

```javascript
router.get('/callback', async (req, res) => {
  // ... existing validation ...

  try {
    const tokens = await exchangeCode(code, redirectUri);

    // Get user info to obtain Twitch ID
    const userInfo = await getUserInfo(tokens.accessToken);
    const twitchId = userInfo.id;

    if (authType === 'bot') {
      // Register bot token with Twitch ID
      await authManager.addBotToken(
        twitchId,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.scope
      );

      logger.info(`Bot authenticated as ${userInfo.login} (${twitchId})`);

    } else {
      // Channel authorization
      const channel = await channelRepo.findByTwitchId(twitchId);

      if (!channel) {
        // Create new channel
        const newChannel = await channelRepo.create({
          twitch_id: twitchId,
          twitch_username: userInfo.login,
          display_name: userInfo.displayName
        });

        await authManager.addChannelToken(
          newChannel.id,
          twitchId,
          tokens.accessToken,
          tokens.refreshToken,
          tokens.scope
        );
      } else {
        // Update existing channel
        await authManager.addChannelToken(
          channel.id,
          twitchId,
          tokens.accessToken,
          tokens.refreshToken,
          tokens.scope
        );
      }

      logger.info(`Channel ${userInfo.login} (${twitchId}) authorized`);
    }

    // Redirect to appropriate page
    res.redirect(authType === 'bot' ? '/dashboard' : '/channels');

  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect('/error?message=' + encodeURIComponent(error.message));
  }
});
```

**Add helper function:**

```javascript
async function getUserInfo(accessToken) {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': config.twitch.clientId
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get user info from Twitch');
  }

  const data = await response.json();
  return data.data[0];
}
```

## Phase 6: Channel Manager Updates

### Step 6.1: Update `src/bot/channel-manager.js`

**Verify token exists before subscribing:**

```javascript
async subscribeToEvents(channel) {
  const twitchId = channel.twitch_id;

  // Verify we have a token for this channel
  if (!authManager.hasChannelToken(twitchId)) {
    this.logger.warn(`No token found for channel ${twitchId} - skipping EventSub`);
    return;
  }

  try {
    // Subscribe to events (now token will be found!)
    const raidSub = await this.eventSubListener.onChannelRaidTo(twitchId, (event) => {
      this.eventHandler.onRaid(channel.id, event);
    });

    // ... other subscriptions

    this.logger.info(`EventSub subscriptions created for ${channel.twitch_username}`);

  } catch (error) {
    this.logger.error(`Failed to create EventSub subscriptions for ${channel.twitch_username}:`, error);
  }
}
```

## Phase 7: Backward Compatibility

### Step 7.1: Migration Script

Create `scripts/migrate-auth-twitch-ids.js`:

```javascript
#!/usr/bin/env node
/**
 * Backfill twitch_user_id for existing channel_auth entries
 */

const db = require('../src/database');
const authRepo = require('../src/database/repositories/auth-repo');
const channelRepo = require('../src/database/repositories/channel-repo');

async function migrate() {
  console.log('Backfilling twitch_user_id for channel_auth entries...\n');

  const channelAuths = db.prepare(`
    SELECT ca.channel_id, ca.twitch_user_id, c.twitch_id as channel_twitch_id
    FROM channel_auth ca
    LEFT JOIN channels c ON c.id = ca.channel_id
    WHERE ca.twitch_user_id IS NULL
  `).all();

  if (channelAuths.length === 0) {
    console.log('No entries need migration.');
    return;
  }

  console.log(`Found ${channelAuths.length} entries to migrate.\n`);

  for (const auth of channelAuths) {
    if (auth.channel_twitch_id) {
      db.prepare(`
        UPDATE channel_auth SET twitch_user_id = ? WHERE channel_id = ?
      `).run(auth.channel_twitch_id, auth.channel_id);

      console.log(`  Migrated channel_id ${auth.channel_id} -> twitch_user_id ${auth.channel_twitch_id}`);
    } else {
      console.log(`  WARNING: channel_id ${auth.channel_id} has no twitch_id in channels table`);
    }
  }

  console.log('\nMigration complete.');
}

migrate().catch(console.error);
```

## Implementation Order

Execute phases in this order to minimize risk:

1. **Phase 1**: Database migration (safe, additive)
2. **Phase 2**: Auth repo updates (backward compatible)
3. **Phase 7**: Run migration script to backfill data
4. **Phase 3**: Auth manager refactor (core change)
5. **Phase 4**: BotCore integration
6. **Phase 5**: OAuth callback updates
7. **Phase 6**: Channel manager updates

## Rollback Plan

If issues are discovered after deployment:

1. **Database**: The migration is additive only (new column). No data is removed.
2. **Code**: Can revert to previous commit if needed.
3. **Tokens**: Existing tokens remain valid; they just need re-registration with correct user ID.

## Verification Checklist

After each phase:

- [ ] Bot starts without errors
- [ ] Existing channels load properly
- [ ] New OAuth flows work
- [ ] EventSub subscriptions succeed
- [ ] Token refresh works correctly
- [ ] No regressions in chat functionality
