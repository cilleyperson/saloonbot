# Explanation: Why Auth Resilience Works This Way

The bot used to disconnect and stay disconnected until a human noticed and
manually re-authenticated it. This page explains what was actually breaking, why
the fix is shaped the way it is, and what was traded off. For the factual surface
(states, methods, endpoints), see
[reference-auth-resilience.md](./reference-auth-resilience.md).

## The problem

Symptom: "the bot is logged out / not responding in chat; re-authenticating fixes
it." It looked like a token-refresh bug. It mostly was not.

Two distinct failure modes were in play:

1. **Reconnect without rejoin (the main one).** The chat client is created with
   `channels: []` and joins channels dynamically after connecting. Twurple's
   `ChatClient` already auto-reconnects on its own — both on network drops and,
   after `onAuthenticationFailure`, on a Fibonacci backoff. But on reconnect, the
   underlying IRC client only rejoins previously-joined channels if
   `rejoinChannelsOnReconnect` is set; otherwise it rejoins the *original*
   `channels` config, which is empty. Result: after any reconnect the bot is
   connected to IRC but present in **zero** channels — "looks connected, silent
   in chat." A manual restart masked it because startup re-runs the dynamic joins.

2. **Stale-token reconnect loop / no active recovery.** Twurple's
   `RefreshingAuthProvider` refreshes a token lazily — only when a token is
   requested and found expired *by timestamp*. If a token is dead but not yet
   past its expiry timestamp, the reconnect loop keeps presenting the same bad
   token. And the failure handlers only logged; nothing forced a refresh or made
   the failure visible.

On top of both: failures were **silent**. The only signal was a log line nobody
watched, so recovery depended on a human noticing.

## The approach

### Fix the rejoin first
Set `rejoinChannelsOnReconnect: true` on the `ChatClient`, plus a belt-and-
suspenders `rejoinMissing()` on `onConnect` that re-joins anything still absent.
This was shipped and observed on its own before the rest, because it was the
single highest-probability cause of the reported symptom.

### Refresh proactively, don't wait for breakage
A 5-minute sweep refreshes any token within 15 minutes of expiry. This removes
the window where a stale-but-not-timestamp-expired token reaches Twitch and gets
rejected. Lazy refresh still exists underneath; the sweep just gets ahead of it.

### Recover by refreshing the token, not by reconnecting
On `onAuthenticationFailure`, the bot forces a token refresh (`recoverUser`) and
lets twurple's *existing* reconnect pick up the fresh token. It deliberately does
**not** start its own reconnect loop — a second loop fighting twurple's built-in
one causes double reconnects, dropped joins, and thrash.

### Single-flight every manual refresh
`refreshAccessTokenForUser` bypasses twurple's internal serialization queue. If
the sweep and a lazy refresh fire concurrently on the same refresh token, one
succeeds and the other 400s — and twurple then **caches that failure and disables
the user** until it's re-added. So every manual refresh path (sweep, recovery,
startup) goes through a per-user single-flight lock that collapses concurrent
callers onto one refresh. Without this, the recovery machinery could *cause* the
outage it exists to prevent.

### Tell permanent and transient failures apart
A network blip or a Twitch 5xx is worth retrying with backoff. A revoked token
(`invalid_grant`, `CachedRefreshFailureError`) is not — retrying just delays the
alert and hammers Twitch's token endpoint. Permanent failures alert the operator
immediately and stop retrying; transient ones keep the existing backoff.

### Make it visible
Token Health and Chat Membership panels on the dashboard, an admin `/health/auth`
endpoint for monitoring, and an optional Discord webhook that fires on permanent
failure. Silent death was the real pain; visibility is part of the fix, not an
afterthought.

```
                 ┌──────────────── proactive sweep (5 min) ───────────────┐
                 ▼                                                         │
   token < 15 min to expiry ──▶ singleflight refresh ──▶ onRefresh persists, mark healthy
                                                                          │
 onAuthenticationFailure ─▶ recoverUser ─▶ reAdd from DB ─▶ singleflight refresh
                                                                          │
                                            ┌─────────────────────────────┴───────┐
                                         success                                failure
                                            │                                       │
                              twurple reconnect uses fresh token        permanent? ─▶ alert + mark FAILED (no retry)
                              rejoinChannelsOnReconnect rejoins chats    transient? ─▶ backoff retry (x8) ─▶ exhausted ─▶ alert
```

## Trade-offs

- **Lazy refresh is still there.** The sweep reduces the window but doesn't
  replace twurple's on-demand refresh. We layer on top rather than reimplement
  the provider — less code, less risk, but two refresh paths exist (hence the
  single-flight lock).
- **A 15-minute lead + 5-minute sweep means a token can be refreshed up to ~15
  min early.** Slightly more refreshes than strictly necessary, in exchange for
  never serving a stale token.
- **`onDisconnect` only logs** (doesn't force recovery). Twurple owns reconnect;
  forcing a refresh on every network blip would hammer the token endpoint. We act
  only on the auth-specific signal (`onAuthenticationFailure`).
- **Permanent failures stop retrying.** If a "permanent" classification is wrong
  (a revoked-looking error that was actually transient), the bot waits for the
  operator instead of recovering itself. We accept that to avoid retry storms
  against a genuinely dead token.

## Alternatives considered

- **A parallel reconnect loop in our code** — rejected: it fights twurple's
  built-in reconnect. The fix is token-centric (refresh, then let twurple
  reconnect), confirmed by reading twurple's `ChatClient`/`IrcClient` source.
- **Per-token setTimeout scheduler instead of a sweep** — rejected: more timers
  to manage and leak; a single periodic sweep is simpler and self-correcting.
- **Switching the auth provider entirely** — rejected: the provider is sound; the
  gaps were around it (recovery, proactivity, visibility), not in it.

## Related
- [reference-auth-resilience.md](./reference-auth-resilience.md) — states, API, endpoints
- [howto-operate-bot-connection.md](./howto-operate-bot-connection.md) — operating the connection
