# Docker Setup for Saloon Bot

This directory contains Docker configuration and helper scripts for running the Saloon Bot in containers.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+

## Quick Start

### Production

```bash
# Build and start the bot
./docker/scripts/start.sh

# View logs
./docker/scripts/logs.sh --follow

# Stop the bot
./docker/scripts/stop.sh
```

### Development

```bash
# Start in development mode (with hot reload)
./docker/scripts/start.sh --dev

# View development logs
./docker/scripts/logs.sh --dev --follow
```

## Configuration

Before starting the bot, ensure you have a `.env` file in the project root with the required environment variables. See `.env.example` for reference.

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `TWITCH_CLIENT_ID` | Your Twitch application client ID |
| `TWITCH_CLIENT_SECRET` | Your Twitch application client secret |
| `BOT_USERNAME` | The Twitch username for the bot account |
| `SESSION_SECRET` | Secret for web session encryption |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Web interface port |
| `NODE_ENV` | production | Environment mode |
| `LOG_LEVEL` | info | Logging level |

## Scripts Reference

All scripts are located in `docker/scripts/` and should be run from the project root.

### `build.sh`

Builds the Docker image.

```bash
./docker/scripts/build.sh [--dev] [--no-cache]
```

Options:
- `--dev`: Build development image
- `--no-cache`: Build without using cache

### `start.sh`

Builds and starts the bot container.

```bash
./docker/scripts/start.sh [--dev] [--build]
```

Options:
- `--dev`: Use development configuration
- `--build`: Force rebuild before starting

### `stop.sh`

Stops running containers.

```bash
./docker/scripts/stop.sh [--dev]
```

Options:
- `--dev`: Stop development container

### `logs.sh`

View container logs.

```bash
./docker/scripts/logs.sh [--dev] [--follow]
```

Options:
- `--dev`: View development container logs
- `--follow` or `-f`: Follow log output (like `tail -f`)

### `shell.sh`

Open a shell in the running container.

```bash
./docker/scripts/shell.sh [--dev]
```

Options:
- `--dev`: Connect to development container

### `backup.sh`

Backup the database from the Docker volume.

```bash
./docker/scripts/backup.sh [output-file]
```

Examples:
```bash
# Backup with auto-generated filename
./docker/scripts/backup.sh

# Backup to specific file
./docker/scripts/backup.sh ~/my-backup.db
```

Backups are stored in the `backups/` directory by default.

### `restore.sh`

Restore a database backup to the Docker volume.

```bash
./docker/scripts/restore.sh <backup-file>
```

Example:
```bash
./docker/scripts/restore.sh backups/bot_backup_20240101_120000.db
```

**Warning**: This will overwrite the current database!

### `cleanup.sh`

Remove Docker resources.

```bash
./docker/scripts/cleanup.sh [--all]
```

Options:
- `--all`: Also remove volumes (deletes database!)

## Docker Compose Files

### `docker-compose.yml` (Production)

Production configuration with:
- Optimized multi-stage build
- Persistent volumes for data and logs
- Health checks
- Automatic restart policy
- Non-root user for security

### `docker-compose.dev.yml` (Development)

Development configuration with:
- Source code mounted as volume
- Hot reload with `--watch` flag
- Development-specific environment variables
- Separate volumes to avoid conflicts with production

## Volumes

| Volume | Purpose |
|--------|---------|
| `saloon-bot-data` | SQLite database (production) |
| `saloon-bot-logs` | Log files (production) |
| `saloon-bot-data-dev` | SQLite database (development) |
| `saloon-bot-logs-dev` | Log files (development) |

## Health Check

The production container includes a health check that verifies:
- The web interface is responding on port 3000
- Check interval: 30 seconds
- Timeout: 10 seconds
- Retries: 3

## Troubleshooting

### Container won't start

1. Check logs: `./docker/scripts/logs.sh`
2. Verify `.env` file exists and has required variables
3. Ensure ports aren't in use: `lsof -i :3000`

### Database issues

1. Backup current database: `./docker/scripts/backup.sh`
2. Check volume exists: `docker volume ls | grep saloon`
3. Inspect volume: `docker volume inspect saloon-bot-data`

### Permission issues

The container runs as a non-root user (UID 1001). If you encounter permission issues with mounted volumes:

```bash
# Fix ownership on the host
sudo chown -R 1001:1001 ./data ./logs
```

### Rebuilding after code changes

```bash
# Force rebuild
./docker/scripts/start.sh --build

# Or rebuild without cache
./docker/scripts/build.sh --no-cache
./docker/scripts/start.sh
```

## Security Notes

- The container runs as a non-root user
- Sensitive environment variables are passed via `.env` file (not in image)
- The `.env` file should never be committed to version control
- Database backups may contain sensitive data; store securely
