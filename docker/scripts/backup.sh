#!/bin/bash
# Backup the Saloon Bot database from Docker volume
#
# Usage:
#   ./docker/scripts/backup.sh [output-file]
#
# Example:
#   ./docker/scripts/backup.sh
#   ./docker/scripts/backup.sh ~/backups/bot-backup.db

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default backup location
BACKUP_DIR="${PROJECT_ROOT}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEFAULT_BACKUP_FILE="${BACKUP_DIR}/bot_backup_${TIMESTAMP}.db"

# Use provided filename or default
BACKUP_FILE="${1:-$DEFAULT_BACKUP_FILE}"

# Create backup directory if it doesn't exist
mkdir -p "$(dirname "${BACKUP_FILE}")"

echo "=== Backing Up Saloon Bot Database ==="

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "saloon-bot"; then
    # Copy from running container
    docker cp saloon-bot:/app/data/bot.db "${BACKUP_FILE}"
else
    # Copy from volume using temporary container
    docker run --rm \
        -v saloon-bot-data:/data \
        -v "$(dirname "${BACKUP_FILE}"):/backup" \
        alpine:latest \
        cp /data/bot.db "/backup/$(basename "${BACKUP_FILE}")"
fi

echo ""
echo "=== Backup Complete ==="
echo "Backup file: ${BACKUP_FILE}"
echo "Size: $(ls -lh "${BACKUP_FILE}" | awk '{print $5}')"
