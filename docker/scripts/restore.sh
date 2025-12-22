#!/bin/bash
# Restore the Saloon Bot database to Docker volume
#
# Usage:
#   ./docker/scripts/restore.sh <backup-file>
#
# Example:
#   ./docker/scripts/restore.sh ~/backups/bot-backup.db

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Check for backup file argument
if [[ -z "$1" ]]; then
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "Available backups:"
    ls -la "${PROJECT_ROOT}/backups/"*.db 2>/dev/null || echo "  No backups found in ${PROJECT_ROOT}/backups/"
    exit 1
fi

BACKUP_FILE="$1"

# Verify backup file exists
if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "=== Restoring Saloon Bot Database ==="
echo "Backup file: ${BACKUP_FILE}"
echo ""
echo "WARNING: This will overwrite the current database!"
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 0
fi

# Stop the bot if running
if docker ps --format '{{.Names}}' | grep -q "saloon-bot"; then
    echo "Stopping bot..."
    docker compose -f "${PROJECT_ROOT}/docker/docker-compose.yml" down
    WAS_RUNNING=true
else
    WAS_RUNNING=false
fi

# Restore using temporary container
docker run --rm \
    -v saloon-bot-data:/data \
    -v "$(dirname "$(realpath "${BACKUP_FILE}")"):/backup:ro" \
    alpine:latest \
    cp "/backup/$(basename "${BACKUP_FILE}")" /data/bot.db

echo ""
echo "=== Restore Complete ==="

# Restart if it was running
if [[ "${WAS_RUNNING}" == "true" ]]; then
    echo "Restarting bot..."
    docker compose -f "${PROJECT_ROOT}/docker/docker-compose.yml" up -d
fi
