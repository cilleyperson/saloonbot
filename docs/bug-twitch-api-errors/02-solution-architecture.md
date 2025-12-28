# Solution Architecture: Multi-User Auth Provider Pattern

## 1. Chosen Solution: Unified Multi-User Auth Provider

After analyzing three potential approaches, the **Unified Multi-User Auth Provider** pattern is recommended for the following reasons:

### Alternative Solutions Considered

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **A: Separate EventSub per Channel** | Each channel gets its own EventSub listener | Isolation | Resource intensive, complex management |
| **B: Proxy Auth Provider** | Wrapper that delegates to appropriate provider | Minimal changes | Added complexity, potential race conditions |
| **C: Unified Multi-User Provider** | Single provider holds all tokens | Clean architecture, Twurple-native | Requires refactoring auth-manager |

### Why Unified Multi-User Provider

1. **Twurple Design Intent**: `RefreshingAuthProvider` is explicitly designed for multi-user scenarios
2. **Resource Efficiency**: Single WebSocket connection for all EventSub subscriptions
3. **Simplified Token Management**: One place to add/remove/refresh tokens
4. **Native Support**: No custom wrapper code needed
5. **Consistent Behavior**: Token refresh handled uniformly

## 2. Architecture Overview

### Current Architecture (Broken)

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTH MANAGER                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ botAuthProvider (RefreshingAuthProvider)                    ││
│  │   └── User '' (empty) -> Bot's tokens                       ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ channelAuthProviders (Map<channelId, RefreshingAuthProvider>││
│  │   ├── channelId=1 -> Provider with User '' -> Channel1 tokens│
│  │   ├── channelId=2 -> Provider with User '' -> Channel2 tokens│
│  │   └── channelId=3 -> Provider with User '' -> Channel3 tokens│
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BOT CORE                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ apiClient (ApiClient)                                       ││
│  │   └── authProvider: botAuthProvider  ◄─── Only bot tokens! ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ eventSubListener (EventSubWsListener)                       ││
│  │   └── apiClient: apiClient  ◄─── Uses bot's provider only   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### New Architecture (Fixed)

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTH MANAGER                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ authProvider (RefreshingAuthProvider) - SINGLE PROVIDER     ││
│  │   ├── User 'BOT_USER_ID' -> Bot's tokens (chat intents)     ││
│  │   ├── User '582984779'   -> Channel1 tokens (channel intents)│
│  │   ├── User '12345678'    -> Channel2 tokens (channel intents)│
│  │   └── User '99887766'    -> Channel3 tokens (channel intents)│
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Methods:                                                        │
│   - addBotToken(token) -> adds under bot's Twitch ID           │
│   - addChannelToken(twitchId, token) -> adds under channel ID  │
│   - removeChannelToken(twitchId) -> removes channel            │
│   - getAuthProvider() -> returns the single provider            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BOT CORE                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ apiClient (ApiClient)                                       ││
│  │   └── authProvider: authManager.getAuthProvider()           ││
│  │       (Has ALL tokens - bot + all channels)                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ eventSubListener (EventSubWsListener)                       ││
│  │   └── apiClient: apiClient                                  ││
│  │       (Can find token for any registered channel)           ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 3. Database Schema Changes

### New Column in channel_auth

```sql
-- Migration: 011_auth_twitch_id.sql
ALTER TABLE channel_auth ADD COLUMN twitch_user_id TEXT;

-- Backfill from channels table
UPDATE channel_auth
SET twitch_user_id = (
  SELECT twitch_id FROM channels WHERE channels.id = channel_auth.channel_id
);

-- Add NOT NULL constraint after backfill (if needed, via table recreation)
```

### Updated Schema

```sql
CREATE TABLE channel_auth (
  channel_id INTEGER UNIQUE,
  twitch_user_id TEXT NOT NULL,      -- NEW: Twitch user ID for token lookup
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at INTEGER,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
```

## 4. Auth Manager Refactoring

### New Interface

```javascript
class AuthManager {
  constructor() {
    this.authProvider = null;  // Single multi-user provider
    this.botTwitchId = null;   // Bot's Twitch user ID
  }

  // Initialize the single auth provider
  async initialize() {
    this.authProvider = new RefreshingAuthProvider({
      clientId: config.twitch.clientId,
      clientSecret: config.twitch.clientSecret
    });

    // Set up refresh callback
    this.authProvider.onRefresh((userId, token) => {
      this._handleTokenRefresh(userId, token);
    });

    // Load bot token
    await this._loadBotAuth();

    // Load all channel tokens
    await this._loadAllChannelAuths();
  }

  // Get the single auth provider (used by BotCore)
  getAuthProvider() {
    return this.authProvider;
  }

  // Add bot's token
  async addBotToken(twitchId, accessToken, refreshToken, scopes) {
    this.botTwitchId = twitchId;
    this.authProvider.addUser(twitchId, {
      accessToken,
      refreshToken,
      scope: scopes,
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['chat']);  // Bot needs chat intents

    // Save to database
    authRepo.saveBotAuth(twitchId, accessToken, refreshToken, scopes);
  }

  // Add channel's token
  async addChannelToken(channelId, twitchId, accessToken, refreshToken, scopes) {
    this.authProvider.addUser(twitchId, {
      accessToken,
      refreshToken,
      scope: scopes,
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['channel']);  // Channels don't need chat intents

    // Save to database
    authRepo.saveChannelAuth(channelId, twitchId, accessToken, refreshToken, scopes);
  }

  // Remove channel's token (when channel is disconnected)
  removeChannelToken(twitchId) {
    // Note: RefreshingAuthProvider doesn't have removeUser()
    // We handle this by not including on reload
  }

  // Check if bot is authenticated
  isBotAuthenticated() {
    return this.botTwitchId !== null;
  }

  // Handle token refresh (save to DB)
  async _handleTokenRefresh(userId, token) {
    if (userId === this.botTwitchId) {
      authRepo.updateBotAuth(userId, token.accessToken, token.refreshToken);
    } else {
      authRepo.updateChannelAuthByTwitchId(userId, token.accessToken, token.refreshToken);
    }
  }
}
```

## 5. Token Registration Flow

### OAuth Callback Flow

```javascript
// In src/web/routes/auth.js
router.get('/callback', async (req, res) => {
  // ... validate state, get tokens from Twitch ...

  // Get user info to obtain Twitch ID
  const userInfo = await getUserInfo(accessToken);
  const twitchId = userInfo.id;  // e.g., "582984779"

  if (authType === 'bot') {
    // Register bot token with Twitch ID
    await authManager.addBotToken(twitchId, accessToken, refreshToken, scopes);
  } else {
    // Register channel token with Twitch ID
    const channel = await createOrUpdateChannel(twitchId, userInfo.login, userInfo.display_name);
    await authManager.addChannelToken(channel.id, twitchId, accessToken, refreshToken, scopes);
  }

  // Token is now available for EventSub
});
```

### Startup Flow

```javascript
// In AuthManager.initialize()
async _loadBotAuth() {
  const botAuth = authRepo.getBotAuth();
  if (botAuth) {
    this.botTwitchId = botAuth.twitch_user_id;
    this.authProvider.addUser(botAuth.twitch_user_id, {
      accessToken: botAuth.access_token,
      refreshToken: botAuth.refresh_token,
      scope: botAuth.scopes.split(' '),
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['chat']);
  }
}

async _loadAllChannelAuths() {
  const channelAuths = authRepo.getAllChannelAuths();
  for (const auth of channelAuths) {
    this.authProvider.addUser(auth.twitch_user_id, {
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      scope: auth.scopes.split(' '),
      expiresIn: 0,
      obtainmentTimestamp: Date.now()
    }, ['channel']);
  }
}
```

## 6. BotCore Integration

### Updated Initialization

```javascript
// In src/bot/index.js
async initialize() {
  // Initialize auth manager
  await authManager.initialize();

  if (!authManager.isBotAuthenticated()) {
    logger.warn('Bot is not authenticated');
    return false;
  }

  // Create API client with the SHARED auth provider
  const authProvider = authManager.getAuthProvider();
  this.apiClient = new ApiClient({ authProvider });

  // Create Chat client (same auth provider)
  this.chatClient = new ChatClient({
    authProvider,
    channels: [],
    isAlwaysMod: false
  });

  // Create EventSub listener (uses apiClient which has all tokens)
  this.eventSubListener = new EventSubWsListener({
    apiClient: this.apiClient
  });

  // ... rest of initialization
}
```

## 7. EventSub Subscription Flow (After Fix)

```
1. User authorizes channel via OAuth
2. authManager.addChannelToken('582984779', tokens) called
3. Token registered in authProvider under user '582984779'
4. channel-manager.subscribeToEvents(channel) called
5. eventSubListener.onChannelRaidTo('582984779', handler) called
6. Twurple makes API call with userId='582984779'
7. authProvider.getAccessTokenForUser('582984779') called
8. Token found! ✅
9. EventSub subscription created successfully
```

## 8. Backward Compatibility

### Migration Strategy

1. **Database Migration**: Add `twitch_user_id` column, backfill from channels table
2. **Runtime Handling**: If `twitch_user_id` is NULL, look up from channels table
3. **Gradual Transition**: New OAuth flows save Twitch ID; existing channels work via lookup

### Fallback for Missing Twitch IDs

```javascript
async _loadAllChannelAuths() {
  const channelAuths = authRepo.getAllChannelAuths();
  for (const auth of channelAuths) {
    let twitchId = auth.twitch_user_id;

    // Fallback: look up from channels table if not stored
    if (!twitchId) {
      const channel = channelRepo.findById(auth.channel_id);
      if (channel) {
        twitchId = channel.twitch_id;
        // Optionally update the database
        authRepo.updateTwitchId(auth.channel_id, twitchId);
      }
    }

    if (twitchId) {
      this.authProvider.addUser(twitchId, { ... });
    }
  }
}
```

## 9. Component Interaction Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                           OAUTH FLOW                                    │
│                                                                        │
│  ┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │  User    │───>│  Twitch  │───>│ auth.js     │───>│ AuthManager  │  │
│  │ Browser  │    │  OAuth   │    │ /callback   │    │ addChannel   │  │
│  └──────────┘    └──────────┘    └─────────────┘    │ Token()      │  │
│                                         │           └──────────────┘  │
│                                         │                  │          │
│                                         ▼                  ▼          │
│                                  ┌─────────────┐   ┌──────────────┐   │
│                                  │ auth-repo   │   │ authProvider │   │
│                                  │ saveChannel │   │ .addUser()   │   │
│                                  │ Auth()      │   └──────────────┘   │
│                                  └─────────────┘                      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                         EVENTSUB FLOW                                   │
│                                                                        │
│  ┌──────────────┐    ┌─────────────────┐    ┌────────────────────┐    │
│  │ Channel      │───>│ EventSubWs      │───>│ Twitch EventSub    │    │
│  │ Manager      │    │ Listener        │    │ API                │    │
│  │ .subscribe   │    │ .onChannelRaid  │    │ create subscription│    │
│  │ ToEvents()   │    │ To(twitchId)    │    │                    │    │
│  └──────────────┘    └─────────────────┘    └────────────────────┘    │
│         │                    │                        │               │
│         │                    ▼                        │               │
│         │           ┌─────────────────┐               │               │
│         │           │ apiClient       │<──────────────┘               │
│         │           │ (with shared    │                               │
│         │           │  authProvider)  │                               │
│         │           └─────────────────┘                               │
│         │                    │                                        │
│         │                    ▼                                        │
│         │           ┌─────────────────┐                               │
│         │           │ authProvider    │                               │
│         │           │ .getAccessToken │                               │
│         └──────────>│ ForUser(twitchId│                               │
│                     │ )               │                               │
│                     │ ─────────────── │                               │
│                     │ Token FOUND! ✅ │                               │
│                     └─────────────────┘                               │
└────────────────────────────────────────────────────────────────────────┘
```
