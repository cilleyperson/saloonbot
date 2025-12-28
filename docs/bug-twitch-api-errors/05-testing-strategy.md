# Testing Strategy: EventSub Token Authentication Fix

## 1. Testing Levels

### Unit Tests

While this codebase doesn't have formal unit tests, we can verify individual components work correctly through isolated testing.

#### Auth Manager Tests

```javascript
// Test scenarios for auth-manager.js

// Test 1: Initialize with empty database
// Expected: authProvider created, no errors, isBotAuthenticated() returns false

// Test 2: Add bot token
// authManager.addBotToken('123456', 'access', 'refresh', ['chat:read', 'chat:edit'])
// Expected: isBotAuthenticated() returns true, getBotTwitchId() returns '123456'

// Test 3: Add channel token
// authManager.addChannelToken(1, '789012', 'access', 'refresh', ['channel:read:subscriptions'])
// Expected: hasChannelToken('789012') returns true

// Test 4: Token lookup
// const provider = authManager.getAuthProvider()
// await provider.getAccessTokenForUser('789012')
// Expected: Returns valid token object
```

#### Auth Repository Tests

```javascript
// Test scenarios for auth-repo.js

// Test 1: Save channel auth with Twitch ID
// authRepo.saveChannelAuth(1, '789012', 'encrypted_access', 'encrypted_refresh', 'scope1 scope2')
// Expected: Row inserted with twitch_user_id = '789012'

// Test 2: Get all channel auths
// authRepo.getAllChannelAuthsWithTwitchId()
// Expected: Returns array with twitch_user_id populated

// Test 3: Update by Twitch ID
// authRepo.updateChannelAuthByTwitchId('789012', 'new_access', 'new_refresh')
// Expected: Row updated, tokens encrypted
```

### Integration Tests

#### OAuth Flow Test

```
Test: Complete OAuth authorization flow

Steps:
1. Navigate to /auth/bot
2. Complete Twitch authorization
3. Verify redirect to /dashboard
4. Check database for bot_auth entry with twitch_user_id
5. Check authManager.isBotAuthenticated() returns true

Expected:
- bot_auth row has twitch_user_id populated
- Token is encrypted
- Bot can make API calls
```

#### EventSub Subscription Test

```
Test: EventSub subscription for authorized channel

Prerequisites:
- Bot is authenticated
- Channel 'testchannel' is authorized with Twitch ID '582984779'

Steps:
1. Start bot
2. Call channelManager.subscribeToEvents(channel)
3. Observe EventSub subscriptions

Expected:
- No "token not found" errors
- All subscription types succeed:
  - channel.raid.to.582984779 ✓
  - channel.subscribe.582984779 ✓
  - channel.subscription.message.582984779 ✓
  - channel.subscription.gift.582984779 ✓
```

#### Token Refresh Test

```
Test: Automatic token refresh persists correctly

Steps:
1. Start with valid bot token
2. Wait for or simulate token expiration
3. Make API call that triggers refresh
4. Verify token refresh callback fired
5. Check database for updated tokens

Expected:
- onRefresh callback receives correct userId
- Database updated with new encrypted tokens
- Subsequent API calls work
```

### End-to-End Tests

#### Full Lifecycle Test

```
Test: Complete bot lifecycle with EventSub

Steps:
1. Fresh start with empty database
2. Create admin user
3. Login to admin interface
4. Authorize bot account
5. Add a channel via OAuth
6. Enable channel
7. Verify EventSub subscriptions
8. Trigger a raid to the channel
9. Verify raid event received

Expected:
- All steps complete without errors
- EventSub events properly received
- No authentication errors in logs
```

## 2. Manual Testing Checklist

### Pre-Deployment Verification

- [ ] **Database Migration**
  - [ ] Migration runs without errors
  - [ ] channel_auth.twitch_user_id column exists
  - [ ] bot_auth.twitch_user_id column exists
  - [ ] Existing entries have twitch_user_id backfilled

- [ ] **Bot Startup**
  - [ ] Bot starts without errors
  - [ ] Auth manager initializes correctly
  - [ ] Existing channels loaded with tokens

- [ ] **Bot OAuth Flow**
  - [ ] /auth/bot redirects to Twitch
  - [ ] Callback processes correctly
  - [ ] Twitch user ID stored in bot_auth
  - [ ] Bot can send chat messages

- [ ] **Channel OAuth Flow**
  - [ ] /auth/channel redirects to Twitch
  - [ ] Callback processes correctly
  - [ ] Twitch user ID stored in channel_auth
  - [ ] EventSub subscriptions created

- [ ] **EventSub Functionality**
  - [ ] Raid events received (channel.raid.to)
  - [ ] Subscribe events received (channel.subscribe)
  - [ ] Resub messages received (channel.subscription.message)
  - [ ] Gift subs received (channel.subscription.gift)

- [ ] **Token Refresh**
  - [ ] Simulated refresh works
  - [ ] Database updated on refresh
  - [ ] Bot continues working after refresh

### Regression Testing

- [ ] **Chat Functionality**
  - [ ] Bot joins channels
  - [ ] Custom commands work
  - [ ] Counter commands work
  - [ ] Predefined commands work

- [ ] **Admin Interface**
  - [ ] Login/logout works
  - [ ] Channel management works
  - [ ] Command management works
  - [ ] Settings persist correctly

- [ ] **Object Detection** (if enabled)
  - [ ] Detection starts correctly
  - [ ] Detection stops correctly
  - [ ] Chat messages sent on detection

## 3. Error Scenarios

### Missing Token Handling

```
Scenario: Channel without authorized token tries to subscribe

Setup:
- Channel exists in channels table
- No entry in channel_auth table

Expected Behavior:
- Log warning: "No token found for channel {id} - skipping EventSub"
- No crash
- Other channels continue working
```

### Invalid/Expired Token Handling

```
Scenario: Token refresh fails due to revoked authorization

Expected Behavior:
- onRefresh callback catches error
- Error logged with details
- Other tokens continue working
- Bot doesn't crash
```

### Database Migration Failure Handling

```
Scenario: Migration fails due to locked database

Expected Behavior:
- Clear error message
- Bot exits cleanly
- No data corruption
```

## 4. Performance Testing

### Token Lookup Performance

```
Test: Token lookup time with many channels

Setup:
- Register 100 channel tokens in auth provider

Measure:
- Time to call getAccessTokenForUser() for each
- Memory usage with many tokens

Expected:
- < 10ms per lookup
- Linear memory growth with channel count
```

### Startup Performance

```
Test: Bot startup time with many channels

Setup:
- 100 channels in database with tokens

Measure:
- Time from start to "ready"
- Memory usage after startup

Expected:
- < 5 seconds startup
- Reasonable memory footprint
```

## 5. Log Verification

### Success Indicators

After successful implementation, logs should show:

```
[INFO] auth-manager: Initialized with 5 channel tokens
[INFO] auth-manager: Loaded bot token for Twitch ID 123456789
[INFO] auth-manager: Loaded 5 channel tokens
[INFO] channel-manager: EventSub subscriptions created for testchannel
[DEBUG] auth-manager: Token refreshed for user 582984779
```

### Error Indicators (Should NOT Appear)

After fix, these errors should NOT appear:

```
❌ Tried to make an API call with a user context for user ID xxx but no token was found
❌ Subscription channel.raid.to.xxx failed to subscribe
❌ Subscription channel.subscribe.xxx failed to subscribe
```

## 6. Test Data Setup

### SQL for Test Data

```sql
-- Create test channel
INSERT INTO channels (twitch_id, twitch_username, display_name, is_active)
VALUES ('582984779', 'testchannel', 'Test Channel', 1);

-- Create test channel auth (after migration)
INSERT INTO channel_auth (channel_id, twitch_user_id, access_token, refresh_token, scopes)
VALUES (
  (SELECT id FROM channels WHERE twitch_id = '582984779'),
  '582984779',
  'encrypted_access_token',
  'encrypted_refresh_token',
  'channel:read:subscriptions moderator:read:followers'
);
```

### Cleanup Script

```javascript
// Clean test data
const db = require('./src/database');

db.prepare('DELETE FROM channel_auth WHERE channel_id IN (SELECT id FROM channels WHERE twitch_username LIKE "test%")').run();
db.prepare('DELETE FROM channels WHERE twitch_username LIKE "test%"').run();
```

## 7. Monitoring After Deployment

### Key Metrics to Watch

1. **EventSub subscription success rate**
   - Track successful vs failed subscriptions
   - Alert if failure rate > 5%

2. **Token refresh success rate**
   - Track successful vs failed refreshes
   - Alert if refreshes fail

3. **API error rate**
   - Monitor for authentication-related errors
   - Alert on any "token not found" errors

### Log Queries

```bash
# Check for remaining token errors
grep -i "token.*found" logs/app.log

# Check EventSub subscription status
grep -i "EventSub" logs/app.log | grep -i "fail"

# Check token refresh activity
grep -i "Token refreshed" logs/app.log
```

## 8. Rollback Criteria

Rollback to previous version if:

1. EventSub subscriptions fail at higher rate than before
2. Token refresh causes errors
3. Bot cannot join channels
4. Admin interface stops working
5. Any security-related errors appear

### Rollback Steps

```bash
# Revert to previous commit
git revert HEAD

# Restart application
npm restart

# Verify functionality
npm run test:basic
```

Note: Database migration is additive and doesn't need rollback - the new column will simply be unused by older code.
