#!/bin/bash
# Stop the Saloon Bot Docker containers
#
# Usage:
#   ./docker/scripts/stop.sh [--dev]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default to production compose file
COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.yml"

# Parse arguments
for arg in "$@"; do
    case $arg in
        --dev)
            COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.dev.yml"
            echo "Using development configuration..."
            ;;
    esac
done

echo "=== Stopping Saloon Bot ==="

docker compose -f "${COMPOSE_FILE}" down

echo ""
echo "=== Bot Stopped ==="
