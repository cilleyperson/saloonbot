# Security Considerations: EventSub Token Authentication Fix

## 1. Token Security

### Current Security Measures (Maintained)

The existing token security measures remain in place and are enhanced by this fix:

| Measure | Implementation | Status |
|---------|----------------|--------|
| Encryption at Rest | AES-256-GCM | ✓ Maintained |
| Unique IV per Operation | crypto.randomBytes(12) | ✓ Maintained |
| Sensitive Data Redaction | Winston logger | ✓ Maintained |
| HTTPS Support | TLS 1.2+ | ✓ Maintained |

### New Security Considerations

#### Twitch User ID Exposure

**Risk**: Twitch user IDs are stored in plaintext in the database.

**Mitigation**:
- Twitch user IDs are public information (visible on every channel page)
- They are not sensitive authentication credentials
- Encrypting them would add complexity without security benefit

**Decision**: Store Twitch user IDs in plaintext.

#### Multi-User Token Access

**Risk**: Single auth provider has access to all tokens.

**Mitigation**:
- This is the intended Twurple design pattern
- Tokens are isolated by user ID within the provider
- Access control happens at the auth provider level
- Only authorized code paths can request tokens

**Decision**: Use single multi-user provider as designed by Twurple.

## 2. Token Handling Best Practices

### Token Registration

```javascript
// SECURE: Register with actual Twitch user ID
authProvider.addUser(twitchId, {
  accessToken: accessToken,      // Will be managed by provider
  refreshToken: refreshToken,    // Will be managed by provider
  scope: scopes,
  expiresIn: 0,                 // Treat as expired to force refresh check
  obtainmentTimestamp: Date.now()
}, ['channel']);

// SECURE: Save encrypted to database
authRepo.saveChannelAuth(channelId, twitchId,
  encryptToken(accessToken),     // AES-256-GCM encrypted
  encryptToken(refreshToken),    // AES-256-GCM encrypted
  scopes
);
```

### Token Refresh Handling

```javascript
// SECURE: Refresh callback encrypts before database save
authProvider.onRefresh(async (userId, token) => {
  // Token object contains plaintext - encrypt before storage
  await authRepo.updateChannelAuthByTwitchId(
    userId,
    encryptToken(token.accessToken),
    encryptToken(token.refreshToken)
  );
});
```

### Token Retrieval

```javascript
// SECURE: Tokens decrypted only when needed
async _loadChannelAuths() {
  const auths = authRepo.getAllChannelAuthsWithTwitchId();

  for (const auth of auths) {
    // Decrypt only when loading into memory
    this.authProvider.addUser(auth.twitch_user_id, {
      accessToken: decryptToken(auth.access_token),
      refreshToken: decryptToken(auth.refresh_token),
      // ...
    });
  }
}
```

## 3. OAuth Flow Security

### Callback Validation

The OAuth callback must validate:

1. **State parameter** - Prevents CSRF attacks
2. **Authorization code** - One-time use, short expiration
3. **Redirect URI match** - Configured in Twitch Developer Console

```javascript
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Validate state matches session
  if (state !== req.session.oauthState) {
    logger.warn('OAuth state mismatch - possible CSRF attempt');
    return res.redirect('/error?message=Invalid+state');
  }

  // Clear state after use
  delete req.session.oauthState;

  // Exchange code for tokens (Twitch validates code)
  // ...
});
```

### User Info Verification

When fetching user info, validate the response:

```javascript
async function getUserInfo(accessToken) {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': config.twitch.clientId
    }
  });

  if (!response.ok) {
    throw new Error('Failed to verify user with Twitch');
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    throw new Error('No user data returned from Twitch');
  }

  return data.data[0];
}
```

## 4. Database Security

### Column-Level Security

The new `twitch_user_id` column does not require encryption because:

1. It's a public identifier
2. It's used for lookup, not authentication
3. It maps to publicly visible information

### Query Safety

All database operations use parameterized queries:

```javascript
// SECURE: Parameterized query
db.prepare(`
  UPDATE channel_auth
  SET access_token = ?, refresh_token = ?
  WHERE twitch_user_id = ?
`).run(encryptedAccess, encryptedRefresh, twitchUserId);

// INSECURE: Never do this
db.prepare(`UPDATE channel_auth SET ... WHERE twitch_user_id = '${twitchUserId}'`);
```

### Sensitive Data in Logs

The logger already redacts sensitive fields. Verify these remain protected:

```javascript
// In src/utils/logger.js
const sensitiveFields = [
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'authorization',
  'password',
  'secret'
];
```

The `twitch_user_id` field is NOT considered sensitive and can be logged.

## 5. Attack Surface Analysis

### Before Fix

| Attack Vector | Risk | Notes |
|---------------|------|-------|
| Token interception | Medium | Tokens in memory, encrypted at rest |
| EventSub impersonation | Low | Twitch validates subscriptions |
| Token enumeration | N/A | Tokens not accessible externally |

### After Fix

| Attack Vector | Risk | Notes |
|---------------|------|-------|
| Token interception | Medium | Same as before |
| EventSub impersonation | Low | Same as before |
| Token enumeration | N/A | Same as before |
| Multi-user token access | Low | Controlled by code, not external input |

**Conclusion**: The fix does not increase the attack surface.

## 6. Scope and Permission Analysis

### OAuth Scopes Requested

| Scope | Purpose | Risk Level |
|-------|---------|------------|
| `channel:read:subscriptions` | Read sub events | Low |
| `moderator:read:followers` | Read raid events | Low |
| `moderator:manage:shoutouts` | Send shoutouts | Medium |

These scopes are read-focused with limited write capabilities. The `moderator:manage:shoutouts` scope is the only one allowing actions, and it's limited to shoutouts.

### Scope Verification

When loading tokens, verify scopes match expected:

```javascript
async _loadChannelAuths() {
  const auths = authRepo.getAllChannelAuthsWithTwitchId();

  for (const auth of auths) {
    const scopes = auth.scopes.split(' ');

    // Warn if missing expected scopes
    const expectedScopes = ['channel:read:subscriptions', 'moderator:read:followers'];
    const missing = expectedScopes.filter(s => !scopes.includes(s));

    if (missing.length > 0) {
      this.logger.warn(`Channel ${auth.twitch_user_id} missing scopes: ${missing.join(', ')}`);
    }

    // Still load the token - EventSub will fail for unsupported scopes
    this.authProvider.addUser(auth.twitch_user_id, { ... });
  }
}
```

## 7. Token Lifecycle Security

### Token Storage Timeline

```
1. OAuth callback receives tokens
   └── Tokens exist in memory only

2. User info fetched from Twitch
   └── Validates token is legitimate

3. Tokens encrypted
   └── AES-256-GCM with unique IV

4. Encrypted tokens saved to database
   └── Secure at rest

5. Tokens added to auth provider
   └── In-memory for API calls

6. Token refresh occurs
   └── New tokens encrypted and saved
```

### Token Expiration

Twitch access tokens expire after ~4 hours. The `RefreshingAuthProvider` handles this automatically:

1. Before each API call, provider checks expiration
2. If expired, refresh token used to get new access token
3. New tokens passed to `onRefresh` callback
4. Application encrypts and saves new tokens

## 8. Security Audit Checklist

Before deployment, verify:

- [ ] All tokens encrypted before database storage
- [ ] No tokens logged in plaintext
- [ ] OAuth state validated on callback
- [ ] Parameterized queries used everywhere
- [ ] Twitch user info validated after OAuth
- [ ] Token refresh properly encrypts new tokens
- [ ] No sensitive data in error messages
- [ ] HTTPS enabled in production

## 9. Incident Response

### Token Compromise Detection

Monitor for:
- Unusual API activity patterns
- Failed authentication attempts
- Token refresh failures
- EventSub subscription errors

### Token Compromise Response

If a token is suspected compromised:

1. **Revoke via Twitch** - User can revoke from Twitch settings
2. **Delete from database** - Remove the channel_auth entry
3. **Remove from auth provider** - Restart bot to clear memory
4. **Re-authorize** - Have user go through OAuth again

```javascript
// Emergency token revocation
async revokeChannelToken(channelId, twitchId) {
  // Remove from database
  authRepo.deleteChannelAuth(channelId);

  // Note: RefreshingAuthProvider doesn't have removeUser()
  // Token will be cleared on next restart
  this.logger.warn(`Revoked token for ${twitchId} - restart required`);
}
```

## 10. Compliance Notes

### Data Handling

- Twitch user IDs are considered public data
- Access tokens are considered sensitive data
- Refresh tokens are considered highly sensitive data

### Retention

- Tokens should be removed when channels are disconnected
- Periodic audit of orphaned tokens recommended
- Consider adding "last used" timestamp for cleanup

### Third-Party Dependencies

The security of this implementation relies on:

1. **Twurple** - Token management library
2. **Node.js crypto** - Encryption implementation
3. **better-sqlite3** - Database operations

Keep these dependencies updated for security patches.
