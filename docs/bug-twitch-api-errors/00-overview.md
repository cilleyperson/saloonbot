# Bug Resolution Plan: EventSub Authentication Token Error

## Error Summary

```
[2025-12-28T02:09:28.809Z] twurple:eventsub ERROR Subscription channel.subscription.message.582984779 failed to subscribe:
Tried to make an API call with a user context for user ID 582984779 but no token was found
```

## Root Cause Analysis

The EventSub listener is configured with only the **bot's API client**, which contains only the bot's OAuth tokens. When attempting to subscribe to channel events (raids, subscriptions, etc.), EventSub requires the **channel owner's OAuth tokens** to make API calls on their behalf.

### The Authentication Architecture Gap

1. **Current Implementation**: Each channel has its own `RefreshingAuthProvider` stored in `authManager.channelAuthProviders` with tokens registered under an empty string user ID (`addUser('', {...})`)

2. **EventSub Requirement**: When subscribing to events for a channel, Twurple's EventSub calls `authProvider.getAccessTokenForUser(twitchId, scopes)` where `twitchId` is the channel owner's Twitch ID (e.g., "582984779")

3. **The Gap**: The bot's auth provider has no tokens for channel owner IDs - only for the bot itself. The channel tokens exist but are inaccessible to EventSub.

## Affected Components

| File | Issue |
|------|-------|
| `src/bot/auth-manager.js` | Creates separate auth providers per channel with empty user ID |
| `src/bot/index.js` | EventSub listener uses only bot's API client |
| `src/bot/channel-manager.js` | Subscribes to events assuming token availability |

## Solution Strategy

Implement a **Multi-User Auth Provider Pattern** where:
1. A single auth provider manages tokens for both the bot AND all connected channels
2. Tokens are registered with their actual Twitch user ID (not empty string)
3. EventSub can find the correct token when making API calls for any channel

## Implementation Documents

| Document | Purpose |
|----------|---------|
| [01-technical-analysis.md](./01-technical-analysis.md) | Detailed code analysis and flow diagrams |
| [02-solution-architecture.md](./02-solution-architecture.md) | Proposed solution design |
| [03-implementation-plan.md](./03-implementation-plan.md) | Step-by-step implementation guide |
| [04-agent-tasks.md](./04-agent-tasks.md) | Parallel agent task definitions |
| [05-testing-strategy.md](./05-testing-strategy.md) | Test plan and validation steps |
| [06-security-considerations.md](./06-security-considerations.md) | Security review and token handling |

## Priority

**HIGH** - This bug prevents EventSub subscriptions from working, meaning raid notifications, subscription alerts, and other real-time features are non-functional for channels without proper token registration.

## Success Criteria

1. All EventSub subscriptions succeed without token errors
2. Channel tokens are properly registered with their Twitch user IDs
3. Token refresh works correctly for all users
4. No regression in existing chat functionality
5. Database migration handles existing tokens correctly
