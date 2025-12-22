# Saloon Bot

A feature-rich, multi-channel Twitch chatbot built with Node.js and the [Twurple](https://twurple.js.org/) library. Features a web-based admin interface, custom commands, counters, predefined fun commands, and real-time event handling.

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
- [Deployment](#deployment)
  - [Development](#development)
  - [Production](#production)
  - [Docker Deployment](#docker-deployment)
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
- **Web Dashboard** - Manage everything through an intuitive browser-based interface
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
# Edit .env with your Twitch credentials

# Start the bot
npm start
```

Then open `http://localhost:3000` in your browser to access the admin interface.

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

This will install all required packages including:
- `@twurple/*` - Twitch API and chat libraries
- `better-sqlite3` - SQLite database driver
- `express` - Web server framework
- `winston` - Logging library

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section).

### 4. Initialize Database

The database is automatically created and initialized on first run. No manual setup required.

### 5. Create Admin User

Create an admin user to access the web interface:

```bash
# Interactive mode (recommended)
npm run create-admin

# Command-line mode
npm run create-admin <username> <password>
```

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Example:**
```bash
npm run create-admin admin MySecurePass123
```

The script will:
- Validate password strength
- Hash the password with bcrypt (cost factor 12)
- Create the admin user in the database
- Display success confirmation

You can create multiple admin users by running the script again with different usernames.

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
| `SESSION_SECRET` | Yes | - | Random string for session encryption (32+ chars) |
| `DATABASE_PATH` | No | `./data/bot.db` | Path to SQLite database file |
| `LOG_LEVEL` | No | `info` | Logging level: `error`, `warn`, `info`, `debug` |
| `NODE_ENV` | No | `development` | Environment: `development` or `production` |
| `HTTPS_ENABLED` | No | `false` | Enable HTTPS for the admin interface |
| `HTTPS_PORT` | No | `3443` | HTTPS server port |
| `HTTPS_KEY_PATH` | No | `./certs/server.key` | Path to SSL private key |
| `HTTPS_CERT_PATH` | No | `./certs/server.crt` | Path to SSL certificate |
| `HTTPS_REDIRECT_HTTP` | No | `true` | Redirect HTTP requests to HTTPS |

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

# Database Configuration
DATABASE_PATH=./data/bot.db

# Logging Level
LOG_LEVEL=info

# Environment
NODE_ENV=development
```

---

## Deployment

### Development

For local development with auto-reload on file changes:

```bash
# Start with file watching
npm run dev
```

This uses Node.js's built-in `--watch` flag to restart the server when files change.

**Development features:**
- Detailed error messages
- Debug logging available
- No HTTPS required

### Production

For production deployment on a server:

#### 1. Prepare the Environment

```bash
# Clone and install
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
```

> **Important:** Update your Twitch application's OAuth Redirect URLs to include your production domain.

#### 3. Start the Bot

Using npm:
```bash
npm start
```

Using a process manager (recommended for production):

**With PM2:**
```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start index.js --name "saloon-bot"

# Save process list for auto-restart on reboot
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

Docker is the recommended deployment method for production.

#### Prerequisites
- Docker 20.10+
- Docker Compose v2+

#### Quick Start with Docker

```bash
# Navigate to project directory
cd twitch-saloonbot

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Build and start the container
cd docker
docker compose up -d
```

#### Docker Commands

```bash
# Start the bot (detached)
docker compose up -d

# View logs
docker compose logs -f

# Stop the bot
docker compose down

# Rebuild after code changes
docker compose build --no-cache && docker compose up -d

# View container status
docker compose ps

# Access container shell
docker compose exec bot sh
```

#### Development with Docker

For development with file watching:

```bash
cd docker
docker compose -f docker-compose.dev.yml up -d
```

The development compose file mounts your source code as a volume for live reloading.

#### Docker Volumes

The Docker setup creates two persistent volumes:

| Volume | Purpose |
|--------|---------|
| `saloon-bot-data` | SQLite database storage |
| `saloon-bot-logs` | Application logs |

To backup your data:
```bash
docker run --rm -v saloon-bot-data:/data -v $(pwd):/backup alpine tar czf /backup/bot-data-backup.tar.gz -C /data .
```

#### Docker Health Checks

The container includes a health check that verifies the web server is responding. View health status with:

```bash
docker inspect --format='{{.State.Health.Status}}' saloon-bot
```

### HTTPS Configuration

For secure connections to the admin interface, you can enable HTTPS support.

#### Development (Self-Signed Certificates)

For development and testing, generate self-signed certificates:

```bash
# Generate self-signed SSL certificates
npm run generate-certs

# Enable HTTPS in your .env file
HTTPS_ENABLED=true
HTTPS_PORT=3443
```

Then start the bot normally. Access the admin interface at `https://localhost:3443`.

> **Note:** Your browser will show a security warning for self-signed certificates. Click "Advanced" and proceed to accept the certificate.

#### Production (Proper Certificates)

For production, use certificates from a trusted Certificate Authority like [Let's Encrypt](https://letsencrypt.org/).

**Option 1: Direct SSL**

```env
HTTPS_ENABLED=true
HTTPS_PORT=443
HTTPS_KEY_PATH=/path/to/privkey.pem
HTTPS_CERT_PATH=/path/to/fullchain.pem
```

**Option 2: Reverse Proxy (Recommended)**

Use nginx or another reverse proxy to handle SSL termination:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### HTTPS with Docker

Mount your certificates as volumes and configure the environment:

```yaml
# docker-compose.yml additions
services:
  bot:
    volumes:
      - ./certs:/app/certs:ro
    environment:
      - HTTPS_ENABLED=true
      - HTTPS_PORT=3443
    ports:
      - "3443:3443"
```

---

## Admin Interface

Access the admin interface at `http://localhost:3000` (or `https://localhost:3443` if HTTPS is enabled).

### First-Time Setup

1. **Authenticate the Bot**
   - Navigate to `http://localhost:3000/auth/bot`
   - Log in with your bot's Twitch account
   - Authorize the requested permissions

2. **Add a Channel**
   - Go to the Channels page
   - Click "Add Channel"
   - Authenticate with the channel owner's Twitch account
   - The bot will automatically join the channel

### Dashboard Features

| Section | Description |
|---------|-------------|
| **Dashboard** | Bot status, connected channels overview |
| **Channels** | Manage connected channels, view status |
| **Commands** | Create and manage custom `!commands` with emoji and multiple responses |
| **Counters** | Create and manage `word++` counters with emoji |
| **Predefined Commands** | Enable/configure 10 built-in commands (advice, ball, botcommands, dadjoke, define, randomfact, rps, rpsstats, trivia, triviastats) |
| **Chat Memberships** | Join additional chats for cross-channel commands |

---

## Bot Commands

### Custom Commands

Create your own commands through the admin interface:

| Example | Response |
|---------|----------|
| `!hello` | "Hello, {user}! Welcome to the stream!" |
| `!discord` | "Join our Discord: https://discord.gg/example" |
| `!uptime` | "Stream has been live for {uptime}" |

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

Built-in commands that can be enabled per channel:

| Command | Description | Example |
|---------|-------------|---------|
| `!advice` | Random life advice | `!advice` → "💡 Don't be afraid to ask questions." |
| `!ball [question]` | Magic 8 Ball responses | `!ball Will I win?` → "🎱 Signs point to yes." |
| `!botcommands` | List enabled commands | `!botcommands` → "📋 Built-in: !ball | Custom: !hello" |
| `!dadjoke` | Random dad jokes | `!dadjoke` → "👨 Why don't scientists trust atoms?..." |
| `!define <word>` | Dictionary lookup | `!define serendipity` → "📖 serendipity (noun): ..." |
| `!randomfact` | Random useless facts | `!randomfact` → "🧠 Honey never spoils..." |
| `!rps <choice>` | Rock Paper Scissors | `!rps rock` → "🎮 🪨 vs ✂️ - You win!" |
| `!rpsstats` | View your RPS statistics | "📊 5W-3L-2T (62%)" |
| `!trivia` | Start a trivia question | "🎯 What is the capital of France? A: ... B: ..." |
| `!triviastats` | View your trivia statistics | "📊 5 correct, 2 incorrect (71%)" |

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
├── migrations/              # Database migrations (6 total)
│   ├── 001_initial_schema.sql
│   ├── 002_chat_scope.sql
│   ├── 003_predefined_commands.sql
│   ├── 004_command_emoji.sql
│   ├── 005_command_responses.sql
│   └── 006_trivia_stats.sql
│
├── scripts/                 # Utility scripts
│   └── generate-certs.sh   # Generate SSL certificates
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
│   │       ├── command-handler.js
│   │       ├── predefined-command-handler.js
│   │       ├── raid-handler.js
│   │       └── sub-handler.js
│   │
│   ├── config/              # Configuration
│   │   └── index.js
│   │
│   ├── database/            # Data layer
│   │   ├── index.js         # SQLite connection
│   │   ├── schema.js        # Table definitions
│   │   └── repositories/    # Data access (12 repos)
│   │
│   ├── services/            # External API services (5 services)
│   │   ├── advice-api.js    # adviceslip.com
│   │   ├── dadjoke-api.js   # icanhazdadjoke.com
│   │   ├── dictionary-api.js # Free Dictionary API
│   │   ├── randomfact-api.js # uselessfacts.jsph.pl
│   │   └── trivia-api.js     # Open Trivia Database
│   │
│   ├── utils/               # Utilities
│   │   ├── logger.js
│   │   ├── message-splitter.js
│   │   └── template.js
│   │
│   └── web/                 # Web interface
│       ├── index.js         # Express app (HTTP/HTTPS)
│       ├── routes/          # HTTP routes
│       └── views/           # EJS templates
│
└── docs/                    # Documentation
    └── dev-phase-2/         # Phase 2 development docs
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**

2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make your changes**
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed

4. **Test your changes**
   ```bash
   npm test
   ```

5. **Commit your changes**
   ```bash
   git commit -m "Add amazing feature"
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```

7. **Open a Pull Request**

### Development Guidelines

- Use `createChildLogger('component-name')` for logging
- Database operations go through the repository layer
- Follow the existing patterns for handlers and routes
- Template variables use `{variable}` syntax

---

## Troubleshooting

### Common Issues

**Bot won't connect to chat**
- Ensure the bot account is authenticated via `/auth/bot`
- Check that the channel is authenticated and active
- Verify your Twitch application credentials

**Commands not working**
- Check if the command is enabled in the admin interface
- Verify the chat scope settings (All Chats vs Selected Chats)
- Check cooldown settings

**Database errors**
- Ensure the data directory exists and is writable
- Check `DATABASE_PATH` in your `.env` file
- For Docker, verify volume mounts are correct

**OAuth errors**
- Verify `CALLBACK_URL` matches your Twitch application settings
- Ensure `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are correct
- Check that required scopes are approved

### Logs

View logs based on your deployment method:

```bash
# Direct Node.js
# Logs output to console

# PM2
pm2 logs saloon-bot

# Docker
docker compose logs -f

# systemd
journalctl -u saloon-bot -f
```

---

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0) - see the [LICENSE.md](LICENSE.md) file for details.

---

## Acknowledgments

- [Twurple](https://twurple.js.org/) - Excellent Twitch API library
- [Free Dictionary API](https://dictionaryapi.dev/) - Dictionary definitions
- [icanhazdadjoke](https://icanhazdadjoke.com/) - Dad jokes API
- [Advice Slip API](https://api.adviceslip.com/) - Random advice
- [Random Useless Facts](https://uselessfacts.jsph.pl/) - Random facts API
- [Open Trivia Database](https://opentdb.com/) - Trivia questions API
- [Express.js](https://expressjs.com/) - Web framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite driver

---

<p align="center">
  Made with ❤️ for the Twitch community
</p>
