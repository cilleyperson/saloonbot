# Saloon Bot

A feature-rich, multi-channel Twitch chatbot built with Node.js and the [Twurple](https://twurple.js.org/) library. Features a secure web-based admin interface with authentication, custom commands, counters, predefined fun commands, and real-time event handling.

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![Twitch](https://img.shields.io/badge/Twitch-API-9146FF?logo=twitch&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Security](#security)
- [Deployment](#deployment)
- [Admin Interface](#admin-interface)
- [Bot Commands](#bot-commands)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Core Features
- **Multi-Channel Support** - Connect to and manage multiple Twitch channels simultaneously
- **Custom Commands** - Create `!command` triggers with customizable responses, cooldowns, permission levels, emoji prefixes, and multiple response options
- **Counter Commands** - Track counts with `word++` syntax (e.g., `death++` for death counters) with optional emoji prefixes
- **Chat Memberships** - Join other channels' chats and enable commands across multiple chats
- **Automatic Token Refresh** - OAuth tokens are automatically refreshed to keep the bot connected

### Security Features
- **Admin Authentication** - Secure login with bcrypt password hashing and account lockout
- **Token Encryption** - OAuth tokens encrypted at rest using AES-256-GCM
- **CSRF Protection** - Cross-site request forgery protection on all forms
- **Security Headers** - Comprehensive HTTP security headers via Helmet
- **Rate Limiting** - Protection against brute force and DoS attacks
- **Session Security** - Secure cookie configuration with httpOnly and sameSite

### Predefined Commands (10 Commands)
- **Random Advice** (`!advice`) - Get random life advice from adviceslip.com
- **Magic 8 Ball** (`!ball`) - Get random fortune-telling responses
- **Bot Commands** (`!botcommands`) - List all enabled commands for the current chat
- **Dad Jokes** (`!dadjoke`) - Get random dad jokes from icanhazdadjoke.com
- **Dictionary** (`!define`) - Look up word definitions via API with custom overrides
- **Random Fact** (`!randomfact`) - Get random useless but interesting facts
- **Rock Paper Scissors** (`!rps`) - Play against the bot with persistent statistics
- **RPS Stats** (`!rpsstats`) - View your Rock Paper Scissors statistics
- **Trivia** (`!trivia`) - Answer trivia questions with a 30-second timer
- **Trivia Stats** (`!triviastats`) - View your trivia statistics and streak

### Event Handling
- **Raid Shoutouts** - Automatic thank-you messages when your channel receives a raid
- **Subscription Notifications** - Welcome new subs, resubs, and gift subs

### Admin Interface
- **Secure Web Dashboard** - Password-protected admin interface
- **Channel Management** - Add, remove, and configure channels
- **Real-time Status** - Monitor bot connection status and activity

---

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js 20.0.0 or higher** - [Download Node.js](https://nodejs.org/)
- **Twitch Developer Application** - [Create one here](https://dev.twitch.tv/console/apps)
- **Git** (optional) - For cloning the repository

### Twitch Application Setup

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Click "Register Your Application"
3. Fill in the details:
   - **Name**: Your bot's name (e.g., "Saloon Bot")
   - **OAuth Redirect URLs**: `http://localhost:3000/auth/callback`
   - **Category**: Chat Bot
4. Click "Create"
5. Note your **Client ID** and generate a **Client Secret**

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/twitch-saloonbot.git
cd twitch-saloonbot

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your Twitch credentials and secrets

# Create an admin user
npm run create-admin

# Start the bot
npm start
```

Then open `http://localhost:3000` in your browser, log in with your admin credentials, and authenticate the bot.

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/twitch-saloonbot.git
cd twitch-saloonbot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section).

### 4. Create Admin User

Create an admin user to access the web interface:

```bash
# Fully interactive (prompts for username and password)
npm run create-admin

# With username (password prompted securely)
npm run create-admin <username>
```

**Note:** Passwords are always entered interactively and never via command line to prevent exposure in shell history and process lists.

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### 5. Start the Bot

```bash
npm start
```

### 6. Complete Setup in Browser

1. Open `http://localhost:3000` in your browser
2. Log in with your admin credentials
3. Click "Authenticate Bot" to connect your bot's Twitch account
4. Add channels via the Channels page

---

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWITCH_CLIENT_ID` | Yes | - | Your Twitch application Client ID |
| `TWITCH_CLIENT_SECRET` | Yes | - | Your Twitch application Client Secret |
| `TWITCH_BOT_USERNAME` | No | - | The Twitch account username for the bot |
| `CALLBACK_URL` | Yes | - | OAuth callback URL (must match Twitch app settings) |
| `PORT` | No | `3000` | Web server port |
| `SESSION_SECRET` | Yes* | - | Random string for session encryption (32+ chars) |
| `TOKEN_ENCRYPTION_KEY` | Yes* | - | 64-character hex string for token encryption |
| `DATABASE_PATH` | No | `./data/bot.db` | Path to SQLite database file |
| `LOG_LEVEL` | No | `info` | Logging level: `error`, `warn`, `info`, `debug` |
| `NODE_ENV` | No | `development` | Environment: `development` or `production` |
| `HTTPS_ENABLED` | No | `false` | Enable HTTPS for the admin interface |
| `HTTPS_PORT` | No | `3443` | HTTPS server port |
| `HTTPS_KEY_PATH` | No | `./certs/server.key` | Path to SSL private key |
| `HTTPS_CERT_PATH` | No | `./certs/server.crt` | Path to SSL certificate |
| `HTTPS_REDIRECT_HTTP` | No | `true` | Redirect HTTP requests to HTTPS |

\* Required in production mode (`NODE_ENV=production`)

### Generate Token Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Example Configuration

```env
# Twitch Application Credentials
TWITCH_CLIENT_ID=abc123def456
TWITCH_CLIENT_SECRET=secret789xyz

# Bot Account Username
TWITCH_BOT_USERNAME=mycoolbot

# OAuth Callback URL
CALLBACK_URL=http://localhost:3000/auth/callback

# Web Server Configuration
PORT=3000
SESSION_SECRET=your-super-secret-random-string-here

# Security (required for production)
TOKEN_ENCRYPTION_KEY=your-64-character-hex-key-here

# Database Configuration
DATABASE_PATH=./data/bot.db

# Logging Level
LOG_LEVEL=info

# Environment
NODE_ENV=development
```

---

## Security

Saloon Bot includes comprehensive security features to protect your deployment.

### Admin Authentication

- Password-based login with bcrypt hashing (cost factor 12)
- Account lockout after 5 failed login attempts (15-minute duration)
- Session-based authentication with secure cookies
- Automatic session regeneration after login

### Token Encryption

OAuth tokens are encrypted at rest using AES-256-GCM:
- Unique IV generated per encryption operation
- Automatic encryption/decryption in the repository layer
- Backward compatible with existing unencrypted tokens

To migrate existing tokens to encrypted format:
```bash
# Preview migration
node scripts/migrate-tokens.js --dry-run

# Run migration
node scripts/migrate-tokens.js
```

### Security Headers

The following security headers are set via Helmet:
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security (when using HTTPS)
- Referrer-Policy

### Rate Limiting

- Global: 100 requests per 15 minutes
- Authentication routes: 10 requests per 15 minutes

### CSRF Protection

All POST forms are protected with CSRF tokens to prevent cross-site request forgery attacks.

---

## Deployment

### Development

For local development with auto-reload on file changes:

```bash
npm run dev
```

### Production

#### 1. Prepare the Environment

```bash
git clone https://github.com/yourusername/twitch-saloonbot.git
cd twitch-saloonbot
npm ci --only=production

# Configure environment
cp .env.example .env
# Edit .env with production values
```

#### 2. Set Production Environment Variables

```env
NODE_ENV=production
LOG_LEVEL=info
CALLBACK_URL=https://yourdomain.com/auth/callback
SESSION_SECRET=use-a-very-long-random-string
TOKEN_ENCRYPTION_KEY=your-64-character-hex-key
```

> **Important:** Both `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` are required in production mode.

#### 3. Create Admin User

```bash
npm run create-admin
```

#### 4. Start the Bot

Using a process manager (recommended):

**With PM2:**
```bash
npm install -g pm2
pm2 start index.js --name "saloon-bot"
pm2 save
pm2 startup
```

**With systemd:**

Create `/etc/systemd/system/saloon-bot.service`:

```ini
[Unit]
Description=Saloon Bot
After=network.target

[Service]
Type=simple
User=botuser
WorkingDirectory=/path/to/twitch-saloonbot
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl enable saloon-bot
sudo systemctl start saloon-bot
```

### Docker Deployment

#### Quick Start with Docker

```bash
cd twitch-saloonbot

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Build and start
cd docker
docker compose up -d

# Create admin user in container
docker compose exec bot node scripts/create-admin.js
```

#### Docker Commands

```bash
# Start (detached)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after code changes
docker compose build --no-cache && docker compose up -d
```

### HTTPS Configuration

#### Development (Self-Signed Certificates)

```bash
npm run generate-certs

# Enable in .env
HTTPS_ENABLED=true
HTTPS_PORT=3443
```

#### Production

Use certificates from a trusted CA like [Let's Encrypt](https://letsencrypt.org/), or use a reverse proxy like nginx for SSL termination.

---

## Admin Interface

Access the admin interface at `http://localhost:3000` (or `https://localhost:3443` if HTTPS is enabled).

### First-Time Setup

1. **Log In**
   - Enter your admin username and password created during installation

2. **Authenticate the Bot**
   - Click "Authenticate Bot" on the dashboard
   - Log in with your bot's Twitch account
   - Authorize the requested permissions

3. **Add a Channel**
   - Go to the Channels page
   - Click "Add Channel"
   - Authenticate with the channel owner's Twitch account
   - The bot will automatically join the channel

### Dashboard Features

| Section | Description |
|---------|-------------|
| **Dashboard** | Bot status, connected channels overview |
| **Channels** | Manage connected channels, view status |
| **Commands** | Create and manage custom `!commands` |
| **Counters** | Create and manage `word++` counters |
| **Predefined Commands** | Enable/configure built-in commands |
| **Chat Memberships** | Join additional chats for cross-channel commands |

---

## Bot Commands

### Custom Commands

Create your own commands through the admin interface:

| Example | Response |
|---------|----------|
| `!hello` | "Hello, {user}! Welcome to the stream!" |
| `!discord` | "Join our Discord: https://discord.gg/example" |

**Template Variables:**
- `{user}` - Username who triggered the command
- `{channel}` - Current channel name
- `{args}` - All arguments after the command
- `{arg1}`, `{arg2}`, `{arg3}` - Individual arguments

### Counter Commands

Track things with increment syntax:

| Trigger | Response Example |
|---------|------------------|
| `death++` | "death count: 42" |
| `fail++` | "fail count: 17" |

### Predefined Commands

| Command | Description |
|---------|-------------|
| `!advice` | Random life advice |
| `!ball [question]` | Magic 8 Ball responses |
| `!botcommands` | List enabled commands |
| `!dadjoke` | Random dad jokes |
| `!define <word>` | Dictionary lookup |
| `!randomfact` | Random useless facts |
| `!rps <choice>` | Rock Paper Scissors |
| `!rpsstats` | Your RPS statistics |
| `!trivia` | Start a trivia question |
| `!triviastats` | Your trivia statistics |

---

## Project Structure

```
twitch-saloonbot/
├── index.js                 # Application entry point
├── package.json             # Dependencies and scripts
├── .env.example             # Environment template
├── CLAUDE.md                # AI assistant context
├── README.md                # This file
├── LICENSE.md               # GPL-3.0 license
│
├── docker/                  # Docker configuration
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
│
├── migrations/              # Database migrations (7 total)
│   ├── 001_initial_schema.sql
│   ├── 002_chat_scope.sql
│   ├── 003_predefined_commands.sql
│   ├── 004_command_responses.sql
│   ├── 005_emoji_support.sql
│   ├── 006_trivia_stats.sql
│   └── 007_admin_users.sql
│
├── scripts/                 # Utility scripts
│   ├── generate-certs.sh    # Generate SSL certificates
│   ├── create-admin.js      # Create admin user
│   └── migrate-tokens.js    # Encrypt existing tokens
│
├── public/                  # Static web assets
│   └── css/style.css
│
├── src/
│   ├── bot/                 # Bot core functionality
│   │   ├── index.js         # BotCore class
│   │   ├── auth-manager.js  # OAuth handling
│   │   ├── channel-manager.js
│   │   ├── event-handler.js
│   │   └── handlers/        # Event handlers
│   │
│   ├── config/              # Configuration
│   │   └── index.js
│   │
│   ├── database/            # Data layer
│   │   ├── index.js         # SQLite connection
│   │   ├── schema.js        # Table definitions
│   │   └── repositories/    # Data access (13 repos)
│   │
│   ├── services/            # External API services
│   │   ├── advice-api.js
│   │   ├── dadjoke-api.js
│   │   ├── dictionary-api.js
│   │   ├── randomfact-api.js
│   │   └── trivia-api.js
│   │
│   ├── utils/               # Utilities
│   │   ├── api-client.js    # External API wrapper
│   │   ├── crypto.js        # Token encryption
│   │   ├── logger.js        # Winston logger
│   │   ├── message-splitter.js
│   │   └── template.js
│   │
│   └── web/                 # Web interface
│       ├── index.js         # Express app
│       ├── middleware/      # Express middleware
│       │   └── auth.js      # Authentication
│       ├── routes/          # HTTP routes
│       │   ├── auth.js      # OAuth routes
│       │   ├── login.js     # Login/logout
│       │   └── ...
│       └── views/           # EJS templates
│
└── docs/                    # Documentation
    └── sec-review-1/        # Security review docs
```

---

## Troubleshooting

### Common Issues

**Can't log in to admin interface**
- Ensure you've created an admin user with `npm run create-admin`
- Check password meets requirements (12+ chars, mixed case, numbers)
- Account may be locked after 5 failed attempts (wait 15 minutes)

**Bot won't connect to chat**
- Log in to the admin interface first
- Click "Authenticate Bot" on the dashboard
- Verify your Twitch application credentials

**Commands not working**
- Check if the command is enabled in the admin interface
- Verify the chat scope settings
- Check cooldown settings

**Token encryption errors**
- Ensure `TOKEN_ENCRYPTION_KEY` is set (64 hex characters)
- Run `node scripts/migrate-tokens.js` to encrypt existing tokens

### Logs

```bash
# Direct Node.js - logs to console

# PM2
pm2 logs saloon-bot

# Docker
docker compose logs -f

# systemd
journalctl -u saloon-bot -f
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test your changes
5. Commit (`git commit -m "Add amazing feature"`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Use `createChildLogger('component-name')` for logging
- Database operations go through the repository layer
- Follow existing patterns for handlers and routes
- Template variables use `{variable}` syntax

---

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0) - see the [LICENSE.md](LICENSE.md) file for details.

---

## Acknowledgments

- [Twurple](https://twurple.js.org/) - Twitch API library
- [Free Dictionary API](https://dictionaryapi.dev/) - Dictionary definitions
- [icanhazdadjoke](https://icanhazdadjoke.com/) - Dad jokes API
- [Advice Slip API](https://api.adviceslip.com/) - Random advice
- [Random Useless Facts](https://uselessfacts.jsph.pl/) - Random facts API
- [Open Trivia Database](https://opentdb.com/) - Trivia questions API

---

<p align="center">
  Made with &#10084; for the Twitch community
</p>
