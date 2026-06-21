# Reference: Auth & Connection Resilience

The auth-resilience system keeps the bot connected to Twitch without manual
intervention. It proactively refreshes OAuth tokens before they expire, recovers
from auth failures and dropped connections on its own, rejoins chat channels
after a reconnect, classifies failures as recoverable vs. fatal, and surfaces all
of this to the operator. This page is the factual surface: states, methods,
endpoints, config. For *why* it works this way, see
[explanation-auth-resilience.md](./explanation-auth-resilience.md). To operate it,
see [howto-operate-bot-connection.md](./howto-operate-bot-connection.md).

## Components

| File | Responsibility |
|------|----------------|
| `src/bot/auth-manager.js` | Token lifecycle: refresh, recovery, proactive sweep, failure classification, health |
| `src/bot/channel-manager.js` | Chat membership health, rejoin, EventSub re-subscription |
| `src/bot/index.js` | Wires chat/EventSub events to recovery; `rejoinChannelsOnReconnect` |
| `src/bot/personality-chat-client.js` | Proxies `currentChannels` / `isConnected` for health checks |
| `src/utils/alert.js` | Operator alerts (Discord webhook), deduped, non-throwing |
| `src/web/routes/dashboard.js` | Dashboard panels + `/health/auth` JSON |

## Health states

Every registered user (the bot account and each channel) has an auth health
state, tracked in `AuthManager`:

| State | Meaning |
|-------|---------|
| `healthy` | Token valid; last refresh succeeded |
| `refreshing` | A recovery/refresh is in progress |
| `transient_failure` | Refresh failed for a recoverable reason (network, 5xx); retrying with backoff |
| `permanent_failure` | Token revoked / `invalid_grant` / retries exhausted; **manual re-auth required** |

A successful refresh always returns the user to `healthy` and clears any pending
alert for that user.

## AuthManager API (`src/bot/auth-manager.js`)

The module exports a singleton instance.

### `recoverUser(userId): Promise<boolean>`
Recover one user whose token went bad: reloads the latest token from the DB
(preserving the correct intents), then forces a single refresh through the
per-user singleflight lock. For a channel user, fires the recovery hook (EventSub
re-subscription) on success. Returns `true` if the refresh succeeded. Never
throws.

### `getAuthHealth(): object[]`
Snapshot for the admin surface. Returns one entry per registered user:

```js
{
  userId: "12345678",        // Twitch user ID
  label: "bot (@saloonbot)", // or "channel <id>"
  isBot: true,
  state: "healthy",          // see Health states
  expiresAt: "2026-06-21T23:00:00.000Z", // token expiry, or null if unknown
  since: "2026-06-21T19:00:00.000Z",     // when this state was set, or null
  detail: null               // error message for failure states
}
```

Never includes token values — states and timestamps only.

### `setRecoveryHook(fn)`
Register `fn(twitchId)` called after a **channel** user's token recovers, so the
caller can re-create EventSub subscriptions. `BotCore` wires this to
`channelManager.resubscribeByTwitchId`.

### Other public methods
`getAuthProvider()`, `isBotAuthenticated()`, `getBotTwitchId()`,
`getBotUsername()`, `hasChannelToken(twitchId)`, `isChannelAuthenticated(channelId)`,
`saveBotAuth(...)`, `addChannelAuth(...)`, `removeChannelAuth(channelId)`,
`shutdown()` (clears the sweep interval, pending retries, and in-flight refresh
tracking).

## Timing constants (`src/bot/auth-manager.js`)

| Constant | Value | Effect |
|----------|-------|--------|
| `SWEEP_INTERVAL_MS` | 5 min | How often the proactive refresh sweep runs |
| `REFRESH_LEAD_MS` | 15 min | Refresh any token within this window of expiry |
| `RETRY_BASE_DELAY_MS` | 5 s | Base of the exponential backoff for transient failures |
| `MAX_RETRY_ATTEMPTS` | 8 | After this many transient retries, the user is marked `permanent_failure` and alerted |

## ChannelManager API (`src/bot/channel-manager.js`)

### `getMembershipHealth(): object`
Compares intended joins (`joinedChats`) against the live IRC connection
(`ChatClient.currentChannels`):

```js
{
  connected: true,          // or false / null if unknown
  expectedCount: 5,
  joinedCount: 5,
  missing: [],              // expected but not joined -> the "absent from chat" bug
  extra: [],                // joined but not expected
  healthy: true,            // missing.length === 0
  expected: ["alice", "bob"],
  actual: ["alice", "bob"]
}
```

### `rejoinMissing(): Promise<string[]>`
Joins any expected chat not currently joined. Idempotent; a no-op when healthy.
Returns the channels re-joined.

### `resubscribeByTwitchId(twitchId): Promise<void>`
Stops and re-creates the EventSub subscriptions for the channel with this Twitch
ID. Called by the auth recovery hook.

## Chat client configuration (`src/bot/index.js`)

The `ChatClient` is created with `rejoinChannelsOnReconnect: true`. On `onConnect`,
after a 3-second settle, the bot calls `rejoinMissing()` and logs membership
health. `onAuthenticationFailure(text, retryCount)` triggers `recoverUser(botId)`
(it does **not** start a parallel reconnect loop — twurple already reconnects).
`onSubscriptionCreateFailure` triggers `recoverUser` for the affected channel.

## HTTP endpoints

| Endpoint | Auth | Returns |
|----------|------|---------|
| `/healthz` | public | Bare liveness: `200 {"status":"ok"}`. No auth detail. |
| `/health/auth` | admin (session) | `200` `{status:"ok", auth:[...], chat:{...}}` when all healthy; `503` `{status:"degraded", ...}` if any token is non-healthy or chat membership has drift. Never includes token values. |

`getAuthHealth()` feeds the `auth` field; `getMembershipHealth()` feeds `chat`.

## Dashboard panels (`src/web/views/dashboard.ejs`)

- **Token Health** — table of each account's state + expiry. Badge: green if all
  healthy, red otherwise.
- **Chat Membership** — "joined N of M expected", flags drift and lists the
  missing channels.

## Configuration

| Env var | Required | Default | Effect |
|---------|----------|---------|--------|
| `DISCORD_ALERT_WEBHOOK` | No | (none) | Discord webhook URL for operator alerts. If unset, alerts are logged only (no push). |

Backed by `config.alerts.discordWebhookUrl` (`src/config/index.js`).

## Alerts API (`src/utils/alert.js`)

- `sendAlert(message, { dedupeKey })` — POSTs to the Discord webhook if
  configured; always logs. De-duped per `dedupeKey` (the bot uses
  `auth-fail-<userId>`) so one failure episode doesn't spam. Never throws.
- `clearAlert(dedupeKey)` — clears a dedupe key so the next alert fires again
  (called on recovery).

## Related
- [explanation-auth-resilience.md](./explanation-auth-resilience.md) — why this design
- [howto-operate-bot-connection.md](./howto-operate-bot-connection.md) — operating the bot's connection
- [reference-ci-security-pipeline.md](./reference-ci-security-pipeline.md) — CI/security pipeline
