# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Twitch chatbot called "Saloon Bot" built with Node.js and the Twurple library (v8.x). The bot supports multiple Twitch channels with per-channel configuration, custom commands with emoji support, counters, predefined commands (Magic 8 Ball, Dad Jokes, Dictionary, Rock Paper Scissors, Trivia, Random Facts, Advice, Bot Commands List), and automatic notifications. Features a secure web-based admin interface with authentication, two-factor authentication (TOTP), token encryption, CSRF protection, and HTTPS support.

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

# Run tests with watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Generate SSL certificates for HTTPS
npm run generate-certs

# Create admin user (required for web interface)
npm run create-admin

# Migrate existing tokens to encrypted format
node scripts/migrate-tokens.js
node scripts/migrate-tokens.js --dry-run  # Preview only

# Docker (development)
cd docker && docker compose -f docker-compose.dev.yml up -d

# Docker (production)
cd docker && docker compose up -d
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
│   │   └── repositories/      # Data access layer (13 repos)
│   │       ├── admin-user-repo.js    # Admin user authentication
│   │       ├── auth-repo.js          # OAuth tokens (encrypted)
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
│   │   ├── advice-api.js      # zenquotes.io integration (quotes/advice)
│   │   ├── dadjoke-api.js     # icanhazdadjoke.com integration
│   │   ├── dictionary-api.js  # Free Dictionary API integration
│   │   ├── randomfact-api.js  # uselessfacts.jsph.pl integration
│   │   └── trivia-api.js      # Open Trivia Database integration
│   │
│   ├── utils/
│   │   ├── api-client.js      # External API wrapper with timeout
│   │   ├── crypto.js          # AES-256-GCM token encryption
│   │   ├── logger.js          # Winston logger with sensitive data redaction
│   │   ├── message-splitter.js # Twitch message length splitting
│   │   ├── template.js        # Message template formatting
│   │   └── totp.js            # TOTP utilities for two-factor auth
│   │
│   └── web/
│       ├── index.js           # Express app setup with security middleware
│       ├── middleware/        # Express middleware
│       │   └── auth.js        # Authentication (requireAuth, setLocals)
│       ├── routes/            # HTTP route handlers (9 routes)
│       │   ├── auth.js        # Twitch OAuth routes
│       │   ├── channels.js
│       │   ├── chat-memberships.js
│       │   ├── commands.js    # Includes bulk import with multer
│       │   ├── counters.js
│       │   ├── dashboard.js
│       │   ├── login.js       # Admin login/logout with 2FA
│       │   ├── predefined-commands.js
│       │   └── two-factor.js  # 2FA setup and management
│       └── views/             # EJS templates for admin UI
│           ├── layout.ejs
│           ├── login.ejs
│           ├── 2fa-challenge.ejs  # 2FA verification during login
│           ├── dashboard.ejs
│           ├── error.ejs
│           ├── account/       # Account security settings
│           │   ├── security.ejs
│           │   ├── 2fa-setup.ejs
│           │   └── 2fa-verify-action.ejs
│           ├── channels/
│           ├── chat-memberships/
│           ├── commands/
│           ├── counters/
│           └── predefined-commands/
│
├── migrations/                # Database migrations (8 migrations)
│   ├── 001_initial_schema.sql
│   ├── 002_chat_scope.sql
│   ├── 003_predefined_commands.sql
│   ├── 004_command_responses.sql
│   ├── 005_emoji_support.sql
│   ├── 006_trivia_stats.sql
│   ├── 007_admin_users.sql    # Admin authentication
│   └── 008_two_factor_auth.sql # TOTP and backup codes
│
├── docker/                    # Docker configuration
│   ├── Dockerfile            # Non-root user, security hardened
│   ├── docker-compose.yml    # Production with security_opt
│   └── docker-compose.dev.yml
│
├── scripts/                   # Utility scripts
│   ├── generate-certs.sh     # Generate self-signed SSL certificates
│   ├── create-admin.js       # Create admin user (interactive)
│   └── migrate-tokens.js     # Encrypt existing OAuth tokens
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
├── tests/                     # Jest test suite
│   ├── setup.js              # Test configuration
│   ├── unit/                 # Unit tests
│   │   └── totp.test.js
│   └── integration/          # Integration tests
│       └── two-factor.test.js
│
└── docs/                      # Documentation
    └── sec-review-1/         # Security review documentation
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

### Security Architecture

The application includes comprehensive security features:

**Authentication:**
- Admin users stored with bcrypt-hashed passwords (cost factor 12)
- Session-based authentication with secure cookies
- Account lockout after 5 failed attempts (15-minute duration)
- Session regeneration after login
- Two-factor authentication (TOTP) with RFC 6238 compliance
- Backup codes (10 codes, 8 hex chars each, bcrypt hashed)

**Token Encryption:**
- OAuth tokens encrypted at rest using AES-256-GCM
- Unique IV per encryption operation
- Key configured via `TOKEN_ENCRYPTION_KEY` environment variable
- Backward compatible with unencrypted legacy tokens

**Web Security:**
- Helmet middleware for security headers (CSP, X-Frame-Options, etc.)
- CSRF protection via @dr.pogodin/csurf (maintained fork)
- Rate limiting (100 req/15min global, 10 req/15min auth)
- Body parser limits (10kb)
- Sensitive data redaction in logs
- Multipart form CSRF validation via query string for file uploads
- Path traversal protection on file uploads

**Docker Security:**
- Non-root user in container
- `security_opt: no-new-privileges:true`
- `cap_drop: ALL`

### Database

SQLite database with better-sqlite3. Current schema version: 8

**Core Tables:**
- `schema_version` - Tracks applied migrations
- `channels` - Registered Twitch channels
- `channel_auth` - OAuth tokens per channel (encrypted)
- `channel_settings` - Per-channel feature configuration
- `custom_commands` - !command definitions (with emoji support)
- `counter_commands` - word++ counter definitions (with emoji support)
- `bot_auth` - Bot account OAuth tokens (encrypted)
- `admin_users` - Admin user credentials with 2FA fields (totp_secret, totp_enabled, backup_codes)

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

Express.js server with EJS templates and comprehensive security:
- Login required for all admin routes
- Two-factor authentication (TOTP) with QR code setup
- Dashboard with bot status
- Channel management (add/remove/configure)
- Chat membership management
- Command CRUD with cooldowns, user levels, emoji, chat scopes, and multiple responses
- Bulk import of command responses from text files
- Counter management with emoji and chat scopes
- Predefined command configuration (10 commands)
- Magic 8 Ball response management
- Custom dictionary definitions
- RPS leaderboard and stats
- Trivia leaderboard and stats
- Account security settings (2FA management, backup codes)

## Environment Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWITCH_CLIENT_ID` | Yes | - | From Twitch Developer Console |
| `TWITCH_CLIENT_SECRET` | Yes | - | From Twitch Developer Console |
| `TWITCH_BOT_USERNAME` | No | - | Bot account username |
| `CALLBACK_URL` | Yes | - | OAuth callback URL |
| `PORT` | No | 3000 | HTTP web server port |
| `SESSION_SECRET` | Yes* | - | Session encryption secret |
| `TOKEN_ENCRYPTION_KEY` | Yes* | - | 64-char hex key for token encryption |
| `DATABASE_PATH` | No | ./data/bot.db | SQLite database path |
| `LOG_LEVEL` | No | info | error/warn/info/debug |
| `NODE_ENV` | No | development | development/production |
| `HTTPS_ENABLED` | No | false | Enable HTTPS for admin interface |
| `HTTPS_PORT` | No | 3443 | HTTPS web server port |
| `HTTPS_KEY_PATH` | No | ./certs/server.key | Path to SSL private key |
| `HTTPS_CERT_PATH` | No | ./certs/server.crt | Path to SSL certificate |
| `HTTPS_REDIRECT_HTTP` | No | true | Redirect HTTP to HTTPS |

\* Required in production mode

**Generate encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Development Guidelines

- All Twitch OAuth scopes are defined in `src/config/index.js`
- Database operations go through repository layer, not direct queries
- Use `createChildLogger('component-name')` for component-specific logging
- Templates use `{variable}` syntax, processed by `src/utils/template.js`
- Settings are per-channel, stored in `channel_settings` table
- Predefined commands check settings before custom commands
- Use `splitMessage()` from `src/utils/message-splitter.js` for long responses
- Migrations run automatically on startup via `initializeSchema()`
- Token encryption/decryption is automatic in auth-repo.js
- Never log sensitive data - logger redacts known sensitive fields

### Template Pattern in EJS

Templates use JavaScript template literals for the body:
```ejs
<%- include('../layout', { body: `
  <div>Content here</div>
  <form>
    <input type="hidden" name="_csrf" value="${csrfToken}">
  </form>
` }) %>
```

Note: Use `${variable}` for JavaScript interpolation inside template literals, NOT `<%= variable %>`.
The only exception is `login.ejs` which uses traditional EJS syntax.

### Adding a New Predefined Command

1. Add command name to `PREDEFINED_COMMANDS` array in `predefined-settings-repo.js`
2. Add command info to `getCommandInfo()` function in same file
3. Create API service in `src/services/` if needed (use `fetchWithTimeout` from `api-client.js`)
4. Add handler method in `predefined-command-handler.js`
5. Add case to switch statement in `handleCommand()` method
6. Test the command and commit

## Dependencies

```json
{
  "@dr.pogodin/csurf": "^1.16.6",
  "@twurple/api": "^8.0.2",
  "@twurple/auth": "^8.0.2",
  "@twurple/chat": "^8.0.2",
  "@twurple/eventsub-ws": "^8.0.2",
  "bcrypt": "^6.0.0",
  "better-sqlite3": "^12.5.0",
  "cookie-parser": "^1.4.7",
  "dotenv": "^17.2.3",
  "ejs": "^3.1.10",
  "express": "^5.2.1",
  "express-rate-limit": "^8.2.1",
  "express-session": "^1.18.2",
  "helmet": "^8.1.0",
  "multer": "^2.0.2",
  "otpauth": "^9.4.1",
  "qrcode": "^1.5.4",
  "winston": "^3.19.0"
}
```

**Dev Dependencies:**
```json
{
  "jest": "^30.2.0",
  "supertest": "^7.1.4"
}
```

**Requires:** Node.js 20.0.0 or higher

## External APIs

### Twitch (Twurple)
- OAuth scopes defined in `src/config/index.js`
- Bot scopes: `chat:read`, `chat:edit`, `user:read:email`
- Channel scopes: `channel:read:subscriptions`, `moderator:read:followers`, `moderator:manage:shoutouts`

### External API Services
All services use `fetchWithTimeout` from `src/utils/api-client.js` for consistent timeout handling (10 seconds).

- **ZenQuotes API** (`src/services/advice-api.js`) - `https://zenquotes.io/api/random` (quotes with author attribution)
- **icanhazdadjoke** (`src/services/dadjoke-api.js`) - Random dad jokes
- **Free Dictionary API** (`src/services/dictionary-api.js`) - `https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
- **Random Useless Facts** (`src/services/randomfact-api.js`) - `https://uselessfacts.jsph.pl/api/v2/facts/random`
- **Open Trivia Database** (`src/services/trivia-api.js`) - `https://opentdb.com/api.php`

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

## Docker

The project includes Docker configuration in the `docker/` directory with security hardening:

```bash
# Development (with file watching)
cd docker && docker compose -f docker-compose.dev.yml up -d

# Production
cd docker && docker compose up -d

# Create admin user in container
docker compose exec bot node scripts/create-admin.js

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
