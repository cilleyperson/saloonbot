# Technical Analysis: EventSub Token Authentication Failure

## 1. Error Trace Analysis

### Error Message Pattern
```
Tried to make an API call with a user context for user ID 582984779 but no token was found
```

### Affected EventSub Subscription Types
- `channel.raid.to.{userId}` - Incoming raid events
- `channel.subscribe.{userId}` - New subscription events
- `channel.subscription.message.{userId}` - Resub messages
- `channel.subscription.gift.{userId}` - Gift subscription events

### Error Origin in Twurple

The error originates in `@twurple/api` when making authenticated API calls:

```javascript
// In @twurple/api/lib/client/BaseApiClient.js
const accessToken = await authProvider.getAccessTokenForUser(
  contextUserId,  // Twitch ID like "582984779"
  options.scopes
);

if (!accessToken) {
  throw new Error(`Tried to make an API call with a user context for user ID ${contextUserId} but no token was found`);
}
```

## 2. Current Authentication Flow

### Bot Initialization (`src/bot/index.js`)

```javascript
// Line 46-47: Bot auth provider created
const botAuthProvider = authManager.getBotAuthProvider();
this.apiClient = new ApiClient({ authProvider: botAuthProvider });

// Line 57-59: EventSub uses bot's API client
this.eventSubListener = new EventSubWsListener({
  apiClient: this.apiClient  // Only has bot's tokens!
});
```

### Auth Manager Token Registration (`src/bot/auth-manager.js`)

```javascript
// Line 104: Tokens registered with EMPTY STRING user ID
authProvider.addUser('', {  // <-- PROBLEM: Should be Twitch user ID
  accessToken,
  refreshToken,
  scope: Array.isArray(scopes) ? scopes : scopes.split(' '),
  expiresIn: 0,
  obtainmentTimestamp: Date.now()
}, ['chat']);
```

### Channel Manager EventSub Subscription (`src/bot/channel-manager.js`)

```javascript
// Line 276-317: Subscribes to events using channel's Twitch ID
async subscribeToEvents(channel) {
  const twitchId = channel.twitch_id;  // e.g., "582984779"

  // These calls require token for twitchId, not bot
  const raidSub = this.eventSubListener.onChannelRaidTo(twitchId, (event) => {
    this.eventHandler.onRaid(channel.id, event);
  });
  // ... more subscriptions
}
```

## 3. Token Storage Architecture

### Database Schema

```sql
-- channels table
CREATE TABLE channels (
  id INTEGER PRIMARY KEY,
  twitch_id TEXT UNIQUE NOT NULL,      -- e.g., "582984779"
  twitch_username TEXT NOT NULL,
  display_name TEXT,
  is_active INTEGER DEFAULT 1
);

-- channel_auth table (tokens stored here)
CREATE TABLE channel_auth (
  channel_id INTEGER UNIQUE,           -- FK to channels.id
  access_token TEXT NOT NULL,          -- AES-256-GCM encrypted
  refresh_token TEXT NOT NULL,         -- AES-256-GCM encrypted
  scopes TEXT NOT NULL,
  expires_at INTEGER
);
```

### Current Token Flow

```
User OAuth Flow:
  1. User authorizes via /auth/callback
  2. Tokens saved to channel_auth table (encrypted)
  3. authManager.loadAllChannelAuths() creates separate auth providers
  4. Auth provider stored in Map: channelId -> authProvider
  5. Token added with empty string: addUser('', tokens)

EventSub Subscription:
  1. channel-manager calls eventSubListener.onChannelRaidTo(twitchId)
  2. EventSub creates subscription for channel.raid.to.{twitchId}
  3. Twurple calls API with userId context = twitchId
  4. API client asks authProvider.getAccessTokenForUser(twitchId)
  5. Bot's authProvider has no token for twitchId -> ERROR
```

## 4. Twurple RefreshingAuthProvider API

### Key Methods

```typescript
class RefreshingAuthProvider {
  // Add a user's token to this provider
  addUser(userId: string, tokenData: AccessTokenWithUserId, intents?: string[]): void;

  // Get token for a specific user
  getAccessTokenForUser(userId: string, scopes?: string[]): Promise<AccessToken | null>;

  // Get any available token (used when no user context needed)
  getAnyAccessToken(): Promise<AccessToken>;

  // Callback when token refreshes
  onRefresh(callback: (userId, token) => void): void;
}
```

### Multi-User Support

The `RefreshingAuthProvider` is designed to hold tokens for multiple users. Each user is identified by their Twitch user ID:

```javascript
// Correct usage for multi-user
authProvider.addUser('12345', { accessToken: '...', refreshToken: '...' });  // Bot
authProvider.addUser('582984779', { accessToken: '...', refreshToken: '...' });  // Channel
authProvider.addUser('999888', { accessToken: '...', refreshToken: '...' });  // Another channel
```

## 5. The Root Cause

### Problem Statement

Channel tokens are registered with an **empty string** user ID instead of the **actual Twitch user ID**:

```javascript
// Current (WRONG)
authProvider.addUser('', { ... });

// Should be (CORRECT)
authProvider.addUser(twitchUserId, { ... });
```

### Why This Matters

When EventSub subscribes to `channel.raid.to.582984779`, Twurple internally calls:

```javascript
await this._apiClient.eventSub.subscribeToChannelRaidEventsTo(
  '582984779',  // broadcaster ID
  transport,
  '582984779'   // userId context for API call
);
```

The API call requires the broadcaster's token. Twurple looks it up with:

```javascript
authProvider.getAccessTokenForUser('582984779', scopes);
```

But the token was registered under `''` (empty string), not `'582984779'`.

## 6. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CURRENT BROKEN FLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OAuth Callback                                                          │
│  ┌─────────────────┐                                                     │
│  │ User authorizes │ ──> Save to DB ──> Create AuthProvider              │
│  │ channel 582984779│     (encrypted)    for channelId=1                 │
│  └─────────────────┘                     addUser('', tokens)  ❌         │
│                                          ↓                               │
│                                   channelAuthProviders.set(1, provider)  │
│                                                                          │
│  EventSub Subscription                                                   │
│  ┌─────────────────┐                                                     │
│  │ Subscribe to    │ ──> Uses BOT's apiClient                            │
│  │ raid.to.582984779│    ↓                                               │
│  └─────────────────┘    BOT's authProvider.getAccessTokenForUser('582984779')
│                         ↓                                                │
│                         Token not found! ❌                              │
│                         (Bot provider has bot token under '', not 582984779)
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         CORRECTED FLOW                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OAuth Callback                                                          │
│  ┌─────────────────┐                                                     │
│  │ User authorizes │ ──> Save to DB ──> Add to SHARED AuthProvider       │
│  │ channel 582984779│     (encrypted)    addUser('582984779', tokens) ✅ │
│  └─────────────────┘                     ↓                               │
│                                   Single multi-user AuthProvider         │
│                                                                          │
│  EventSub Subscription                                                   │
│  ┌─────────────────┐                                                     │
│  │ Subscribe to    │ ──> Uses apiClient with multi-user provider         │
│  │ raid.to.582984779│    ↓                                               │
│  └─────────────────┘    authProvider.getAccessTokenForUser('582984779')  │
│                         ↓                                                │
│                         Token found! ✅                                  │
│                         (Token registered under correct Twitch ID)       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 7. Scope Requirements Analysis

### EventSub Subscription Scopes

| Subscription Type | Required Scope |
|-------------------|----------------|
| channel.raid.to | `moderator:read:followers` or `channel:read:raids` |
| channel.subscribe | `channel:read:subscriptions` |
| channel.subscription.message | `channel:read:subscriptions` |
| channel.subscription.gift | `channel:read:subscriptions` |

### Current Channel Scopes (from config)

```javascript
// src/config/index.js
channelScopes: [
  'channel:read:subscriptions',
  'moderator:read:followers',
  'moderator:manage:shoutouts'
]
```

The scopes are correct - the issue is purely token registration, not missing permissions.

## 8. Files Requiring Modification

| File | Changes Required |
|------|------------------|
| `src/bot/auth-manager.js` | Use single multi-user auth provider; register with Twitch ID |
| `src/bot/index.js` | Pass shared auth provider to EventSub |
| `src/database/repositories/auth-repo.js` | Store Twitch ID with tokens |
| `src/database/schema.js` | Add Twitch ID column to channel_auth |
| `migrations/011_auth_twitch_id.sql` | Migration for schema change |
