# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Twitch chatbot called "Saloon Bot" built with Node.js and the Twurple library (v8.x). The bot supports multiple Twitch channels with per-channel configuration, custom commands with emoji support, counters, predefined commands (Magic 8 Ball, Dad Jokes, Dictionary, Rock Paper Scissors, Trivia, Random Facts, Advice, Bot Commands List), and automatic notifications. Features a web-based admin interface with optional HTTPS support.

## Commands

```bash
# Install dependencies
npm install

# Run the bot (production)
npm start

# Run with file watching (development)
npm run dev

# Run tests
npm test

# Generate SSL certificates for HTTPS
npm run generate-certs

# Docker (development)
cd docker && docker compose up -d

# Docker (production)
cd docker && docker compose -f docker-compose.yml up -d
```

## Project Structure

```
twitch-saloonbot/
├── index.js                 # Application entry point
├── package.json             # Dependencies and scripts
├── .env.example             # Environment template
├── CLAUDE.md                # AI assistant context (this file)
├── README.md                # User documentation
├── LICENSE.md               # GPL-3.0 license
│
├── src/
│   ├── bot/                    # Bot core functionality
│   │   ├── index.js           # BotCore class - main bot lifecycle
│   │   ├── auth-manager.js    # OAuth and token management
│   │   ├── channel-manager.js # Multi-channel connection handling
│   │   ├── event-handler.js   # Event routing
│   │   └── handlers/
│   │       ├── command-handler.js           # !commands and word++ counters
│   │       ├── predefined-command-handler.js # Predefined commands
│   │       ├── raid-handler.js              # Raid shoutout logic
│   │       └── sub-handler.js               # Subscription notifications
│   │
│   ├── config/
│   │   └── index.js           # Configuration loader with validation
│   │
│   ├── database/
│   │   ├── index.js           # SQLite connection (better-sqlite3)
│   │   ├── schema.js          # Table creation and migrations
│   │   └── repositories/      # Data access layer (12 repos)
│   │       ├── auth-repo.js
│   │       ├── channel-repo.js
│   │       ├── chat-membership-repo.js
│   │       ├── command-repo.js
│   │       ├── command-responses-repo.js  # Multi-response command support
│   │       ├── counter-repo.js
│   │       ├── dictionary-repo.js
│   │       ├── magic-8ball-repo.js
│   │       ├── predefined-settings-repo.js
│   │       ├── rps-stats-repo.js
│   │       ├── settings-repo.js
│   │       └── trivia-stats-repo.js       # Trivia game statistics
│   │
│   ├── services/               # External API integrations (5 services)
│   │   ├── advice-api.js      # adviceslip.com integration
│   │   ├── dadjoke-api.js     # icanhazdadjoke.com integration
│   │   ├── dictionary-api.js  # Free Dictionary API integration
│   │   ├── randomfact-api.js  # uselessfacts.jsph.pl integration
│   │   └── trivia-api.js      # Open Trivia Database integration
│   │
│   ├── utils/
│   │   ├── logger.js          # Winston logger configuration
│   │   ├── message-splitter.js # Twitch message length splitting
│   │   └── template.js        # Message template formatting
│   │
│   └── web/
│       ├── index.js           # Express app setup with HTTPS support
│       ├── routes/            # HTTP route handlers
│       │   ├── auth.js
│       │   ├── channels.js
│       │   ├── chat-memberships.js
│       │   ├── commands.js
│       │   ├── counters.js
│       │   ├── dashboard.js
│       │   └── predefined-commands.js
│       └── views/             # EJS templates for admin UI
│           ├── layout.ejs
│           ├── dashboard.ejs
│           ├── error.ejs
│           ├── channels/
│           ├── chat-memberships/
│           ├── commands/
│           ├── counters/
│           └── predefined-commands/
│
├── migrations/                # Database migrations (6 migrations)
│   ├── 001_initial_schema.sql
│   ├── 002_chat_scope.sql
│   ├── 003_predefined_commands.sql
│   ├── 004_command_emoji.sql       # Emoji support for commands/counters
│   ├── 005_command_responses.sql   # Multi-response commands
│   └── 006_trivia_stats.sql        # Trivia game statistics
│
├── docker/                    # Docker configuration
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
│
├── scripts/                   # Utility scripts
│   └── generate-certs.sh     # Generate self-signed SSL certificates
│
├── public/                    # Static web assets
│   └── css/style.css
│
├── data/                      # Runtime data (gitignored)
│   └── bot.db                # SQLite database
│
├── certs/                     # SSL certificates (gitignored)
│   ├── server.key
│   └── server.crt
│
└── docs/                      # Documentation
    └── dev-phase-2/          # Phase 2 development notes
```

## Architecture

### Twurple Integration

The project uses **Twurple** (https://twurple.js.org/), the modern Twitch API library:

- `@twurple/auth` - Authentication with RefreshingAuthProvider (automatic token refresh)
- `@twurple/api` - Twitch API client
- `@twurple/chat` - Chat client for sending messages
- `@twurple/eventsub-ws` - WebSocket EventSub for real-time events

### Key Classes

- **BotCore** (`src/bot/index.js`) - Main singleton managing all bot operations
- **AuthManager** (`src/bot/auth-manager.js`) - Handles OAuth for bot and channels with automatic token refresh
- **ChannelManager** (`src/bot/channel-manager.js`) - Channel lifecycle, EventSub, and multi-chat support
- **EventHandler** (`src/bot/event-handler.js`) - Routes events to appropriate handlers
- **CommandHandler** (`src/bot/handlers/command-handler.js`) - Custom commands and counters
- **PredefinedCommandHandler** (`src/bot/handlers/predefined-command-handler.js`) - Built-in commands

### Database

SQLite database with better-sqlite3. Current schema version: 6

**Core Tables:**
- `schema_version` - Tracks applied migrations
- `channels` - Registered Twitch channels
- `channel_auth` - OAuth tokens per channel
- `channel_settings` - Per-channel feature configuration
- `custom_commands` - !command definitions (with emoji support)
- `counter_commands` - word++ counter definitions (with emoji support)
- `bot_auth` - Bot account OAuth tokens

**Chat Membership Tables:**
- `channel_chat_memberships` - Channels the bot should join for a connected channel
- `command_chat_scopes` - Which chats a command is enabled for
- `counter_chat_scopes` - Which chats a counter is enabled for

**Command Response Tables:**
- `command_responses` - Multiple responses per command (random selection)

**Predefined Command Tables:**
- `predefined_command_settings` - Per-channel predefined command config
- `predefined_command_chat_scopes` - Chat scope selections
- `magic_8ball_responses` - Global response pool (20 seeded)
- `custom_definitions` - Per-channel custom word definitions
- `rps_user_stats` - Per-user per-channel RPS statistics
- `trivia_user_stats` - Per-user per-channel trivia statistics

### Admin Web Interface

Express.js server with EJS templates. Supports HTTP (default) and HTTPS:
- Dashboard with bot status
- Channel management (add/remove/configure)
- Chat membership management
- Command CRUD with cooldowns, user levels, emoji, chat scopes, and multiple responses
- Counter management with emoji and chat scopes
- Predefined command configuration (10 commands)
- Magic 8 Ball response management
- Custom dictionary definitions
- RPS leaderboard and stats
- Trivia leaderboard and stats

## Features

### Predefined Commands

Built-in commands that can be enabled per-channel. Available commands defined in `PREDEFINED_COMMANDS` array in `predefined-settings-repo.js`:

Current list: `['advice', 'ball', 'botcommands', 'dadjoke', 'define', 'randomfact', 'rps', 'rpsstats', 'trivia', 'triviastats']`

**Random Advice (`!advice`)**
```
User: !advice
Bot: 💡 Here's some advice: Don't be afraid to ask questions.
```
- Uses adviceslip.com API

**Magic 8 Ball (`!ball`)**
```
User: !ball Will I have a good day?
Bot: 🎱 @User, the Magic 8 Ball says: Signs point to yes.
```

**Bot Commands (`!botcommands`)**
```
User: !botcommands
Bot: 📋 Commands available: Built-in: !ball, !dadjoke | Custom: !hello, !discord | Counters: death++, fail++
```
- Lists all enabled predefined, custom commands, and counters for the current chat

**Dad Jokes (`!dadjoke`)**
```
User: !dadjoke
Bot: 👨 Why don't scientists trust atoms? Because they make up everything!
```
- Uses icanhazdadjoke.com API
- Long jokes automatically split into multiple messages

**Dictionary (`!define`)**
```
User: !define serendipity
Bot: 📖 serendipity (noun): The occurrence of events by chance in a happy way.
```
- Uses Free Dictionary API (https://api.dictionaryapi.dev)
- Custom definitions override API lookups
- Long definitions automatically split into multiple messages

**Random Fact (`!randomfact`)**
```
User: !randomfact
Bot: 🧠 Did you know? Honey never spoils and is edible even after thousands of years.
```
- Uses uselessfacts.jsph.pl API

**Rock Paper Scissors (`!rps`, `!rpsstats`)**
```
User: !rps rock
Bot: 🎮 🪨 Rock vs ✂️ Scissors - You win, @User! 🎉 (W:5 L:3)

User: !rpsstats
Bot: 📊 @User's RPS Stats: 5W-3L-2T (50%) | Games: 10 | Best Streak: 3
```
- Accepts aliases: `r`/`p`/`s`, full words, or emojis
- Persistent statistics per user per channel

**Trivia (`!trivia`, `!triviastats`)**
```
User: !trivia
Bot: 🎯 Trivia Time! (General Knowledge - easy)
Bot: What is the capital of France? | A: London | B: Paris | C: Berlin | D: Madrid
Bot: Answer with A, B, C, or D within 30 seconds!
User: B
Bot: 🎉 @User got it right! The answer was B: Paris | Streak: 3 🔥

User: !triviastats
Bot: 📊 @User's Trivia Stats: 5 correct, 2 incorrect (71%) | Current Streak: 3 | Best: 5
```
- Uses Open Trivia Database API (opentdb.com)
- General Knowledge category, multiple choice questions
- 30-second timer for answers
- Tracks correct/incorrect answers, streaks per user per channel

### Chat Scoping

Commands and counters can be scoped to specific chats:
- **All Chats**: Works everywhere the bot is present
- **Selected Chats**: Only works in specified chats (own chat + membership chats)

### Chat Memberships

Channels can configure the bot to join other chats:
- Add target channels via the admin interface
- Commands/counters can work in membership chats
- Use `__own__` special value for the channel's own chat

### Event Notifications

**Raid Shoutouts** - Automatic message when channel receives a raid. Template variables:
- `{raider}`, `{raider_display}`, `{viewers}`, `{game}`

**Subscription Notifications** - Thank-you messages for subs, resubs, and gift subs. Template variables:
- `{subscriber}`, `{tier}`, `{months}`, `{streak}`, `{message}`, `{gifter}`

### Custom Commands
`!commandname` triggers configured response. Features:
- **Emoji prefix**: Optional emoji displayed before the response
- **Multiple responses**: Commands can have multiple responses (one chosen randomly)
- **Template variables**: `{user}`, `{channel}`, `{args}`, `{arg1}`, `{arg2}`, `{arg3}`

### Counter Commands
`word++` increments counter and shows count. Features:
- **Emoji prefix**: Optional emoji displayed before the count
- **Template variables**: `{counter}`, `{count}`, `{user}`

## External APIs

### Twitch (Twurple)
- OAuth scopes defined in `src/config/index.js`
- Bot scopes: `chat:read`, `chat:edit`, `user:read:email`
- Channel scopes: `channel:read:subscriptions`, `moderator:read:followers`, `moderator:manage:shoutouts`

### Advice Slip API
- No authentication required
- Endpoint: `https://api.adviceslip.com/advice`
- Returns random advice in JSON format
- Service: `src/services/advice-api.js`

### icanhazdadjoke.com
- No authentication required
- Returns random dad jokes in JSON format
- Service: `src/services/dadjoke-api.js`

### Free Dictionary API
- No authentication required
- Endpoint: `https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
- Service: `src/services/dictionary-api.js`

### Random Useless Facts API
- No authentication required
- Endpoint: `https://uselessfacts.jsph.pl/api/v2/facts/random`
- Returns random facts in JSON format
- Service: `src/services/randomfact-api.js`

### Open Trivia Database
- No authentication required
- Endpoint: `https://opentdb.com/api.php?amount=1&category=9&type=multiple`
- Returns trivia questions with multiple choice answers
- 15-second timeout for API requests
- Service: `src/services/trivia-api.js`

## Twurple Documentation

Reference documentation for the Twurple library:
- General: https://twurple.js.org/
- @twurple/api: https://twurple.js.org/reference/api/
- @twurple/auth: https://twurple.js.org/reference/auth/
- @twurple/chat: https://twurple.js.org/reference/chat/
- @twurple/eventsub-ws: https://twurple.js.org/reference/eventsub-ws/

### Twurple Patterns

When implementing Twitch functionality:
- Use `RefreshingAuthProvider` for token management with automatic refresh
- Create `ApiClient` from the auth provider for API calls
- Use `ChatClient` for sending messages to channels
- Use `EventSubWsListener` for real-time events (raids, subs, etc.)
- Chat messages for commands come through ChatClient's `onMessage` event

## Environment Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWITCH_CLIENT_ID` | Yes | - | From Twitch Developer Console |
| `TWITCH_CLIENT_SECRET` | Yes | - | From Twitch Developer Console |
| `TWITCH_BOT_USERNAME` | No | - | Bot account username |
| `CALLBACK_URL` | Yes | - | OAuth callback URL |
| `PORT` | No | 3000 | HTTP web server port |
| `SESSION_SECRET` | Yes | - | Session encryption secret |
| `DATABASE_PATH` | No | ./data/bot.db | SQLite database path |
| `LOG_LEVEL` | No | info | error/warn/info/debug |
| `NODE_ENV` | No | development | development/production |
| `HTTPS_ENABLED` | No | false | Enable HTTPS for admin interface |
| `HTTPS_PORT` | No | 3443 | HTTPS web server port |
| `HTTPS_KEY_PATH` | No | ./certs/server.key | Path to SSL private key |
| `HTTPS_CERT_PATH` | No | ./certs/server.crt | Path to SSL certificate |
| `HTTPS_REDIRECT_HTTP` | No | true | Redirect HTTP to HTTPS |

## Development Guidelines

- All Twitch OAuth scopes are defined in `src/config/index.js`
- Database operations go through repository layer, not direct queries
- Use `createChildLogger('component-name')` for component-specific logging
- Templates use `{variable}` syntax, processed by `src/utils/template.js`
- Settings are per-channel, stored in `channel_settings` table
- Predefined commands check settings before custom commands
- Use `splitMessage()` from `src/utils/message-splitter.js` for long responses
- Migrations run automatically on startup via `initializeSchema()`

### Adding a New Predefined Command

1. Add command name to `PREDEFINED_COMMANDS` array in `predefined-settings-repo.js`
2. Add command info to `getCommandInfo()` function in same file
3. Create API service in `src/services/` if needed
4. Add handler method in `predefined-command-handler.js`
5. Add case to switch statement in `handleCommand()` method
6. Test the command and commit

## Docker

The project includes Docker configuration in the `docker/` directory:

```bash
# Development (with file watching)
cd docker && docker compose -f docker-compose.dev.yml up -d

# Production
cd docker && docker compose up -d

# Rebuild after code changes
docker compose build --no-cache && docker compose up -d
```

Environment variables for Docker are configured in `docker/.env`.

## HTTPS Support

Enable secure connections to the admin interface:

```bash
# Generate self-signed certificates for development
npm run generate-certs

# Configure in .env
HTTPS_ENABLED=true
HTTPS_PORT=3443
```

The server supports three modes:
- **HTTP only** (default): Standard HTTP on configured port
- **HTTPS with redirect**: HTTPS on HTTPS_PORT, HTTP redirects to HTTPS
- **Dual mode**: Both HTTP and HTTPS serve the app (set `HTTPS_REDIRECT_HTTP=false`)

## Dependencies

```json
{
  "@twurple/api": "^8.0.2",
  "@twurple/auth": "^8.0.2",
  "@twurple/chat": "^8.0.2",
  "@twurple/eventsub-ws": "^8.0.2",
  "better-sqlite3": "^11.6.0",
  "dotenv": "^16.4.7",
  "ejs": "^3.1.10",
  "express": "^4.21.2",
  "express-session": "^1.18.1",
  "winston": "^3.17.0"
}
```

**Requires:** Node.js 20.0.0 or higher
