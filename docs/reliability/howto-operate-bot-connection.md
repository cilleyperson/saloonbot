# How to operate the bot's Twitch connection

This guide covers the day-to-day operational tasks for keeping Saloon Bot
connected: reading the health panels, setting up alerts, responding to a
disconnect, and re-authenticating when the bot truly needs it. For how the
system works, see
[explanation-auth-resilience.md](./explanation-auth-resilience.md); for the
factual surface, see [reference-auth-resilience.md](./reference-auth-resilience.md).

## Prerequisites
- Admin access to the bot's web interface (the dashboard requires login).
- For alerts: the ability to create a Discord webhook and edit the bot's `.env`.

## Read the dashboard health panels

The dashboard (home page after login) has two panels:

- **Token Health** — one row per account (the bot and each channel) with a state
  badge and token expiry. Green "All healthy" = nothing to do. A red badge means
  one account needs attention; check its state:
  - `refreshing` / `transient_failure` — recovering on its own; no action.
  - `permanent_failure` — that account needs re-authentication (see below).
- **Chat Membership** — "Joined N of M expected". "Healthy" = the bot is in every
  chat it should be. "Drift detected" with a missing list means the bot is
  connected but absent from those chats; it should self-correct on the next
  reconnect. If it persists, re-authenticate.

For monitoring tools, the same data is available as JSON at `GET /health/auth`
(admin session required) — returns `200` when healthy, `503` when degraded.

## Configure operator alerts (optional but recommended)

Without this, auth failures are only written to the logs. With it, you get pushed
a Discord message the moment an account can't auto-recover.

1. In Discord: Server Settings → Integrations → Webhooks → New Webhook. Copy the
   webhook URL.
2. Add it to the bot's `.env`:

   ```bash
   DISCORD_ALERT_WEBHOOK=https://discord.com/api/webhooks/XXXX/YYYY
   ```

3. Restart the bot.

### Verification
Alerts are deduped per failure episode and never crash the bot if the webhook is
unreachable. To confirm wiring, you can temporarily point the webhook at a test
channel; you'll receive a `:rotating_light: Saloon Bot: ...` message the next time
an account hits `permanent_failure`.

## Respond to a disconnect

Most disconnects now self-heal. Use this order:

1. **Check Chat Membership.** If it shows drift ("joined 0 of 5"), the bot is
   reconnecting; give it a minute. The logs print `Chat membership health` on each
   connect.
2. **Check Token Health.** If an account is `transient_failure` or `refreshing`,
   it's recovering — wait. If it's `permanent_failure`, that account's token is
   revoked/invalid and will not recover on its own → re-authenticate it.
3. **Check the logs** for `Permanent auth failure ... manual re-authentication
   required` — that line names exactly which account needs action.

## Re-authenticate the bot or a channel

When an account shows `permanent_failure`:

1. Go to the dashboard.
2. For the **bot account**: click "Re-authenticate Bot" (Bot Account panel) and
   complete the Twitch OAuth flow.
3. For a **channel**: open that channel's page and re-run its OAuth authorization.
4. After re-auth, the account returns to `healthy` and any pending alert for it
   clears automatically.

### Verification
Token Health shows the account `healthy` with a fresh expiry; Chat Membership
returns to "joined M of M"; the bot responds in chat.

## Troubleshooting

- **Token Health is empty / "Not authenticated".** The bot has never been
  authenticated, or the process can't read its tokens. Authenticate via
  `/auth/bot`.
- **Chat Membership says "Drift detected" and never clears.** The bot is connected
  but can't join — usually a revoked bot token. Check Token Health; re-auth the
  bot if `permanent_failure`.
- **Object detection isn't firing in Docker.** Detection is opt-in in containers
  — the YOLO model is gitignored and mounted, not baked in. See the project's
  Docker docs; this is unrelated to auth health.
- **No alerts arriving.** `DISCORD_ALERT_WEBHOOK` is unset or wrong, or the
  failure was transient (alerts fire only on `permanent_failure` / retry
  exhaustion). Transient recoveries are logged, not alerted.

## Related
- [reference-auth-resilience.md](./reference-auth-resilience.md) — states, API, endpoints
- [explanation-auth-resilience.md](./explanation-auth-resilience.md) — why it works this way
