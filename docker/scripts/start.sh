#!/bin/bash
# Start the Saloon Bot using Docker Compose
#
# Usage:
#   ./docker/scripts/start.sh [--dev] [--build]
#
# Options:
#   --dev    Use development configuration
#   --build  Rebuild the image before starting

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default to production compose file
COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.yml"
BUILD_FLAG=""

# Parse arguments
for arg in "$@"; do
    case $arg in
        --dev)
            COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.dev.yml"
            echo "Using development configuration..."
            ;;
        --build)
            BUILD_FLAG="--build"
            echo "Will rebuild image..."
            ;;
    esac
done

# Check for .env file
if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
    echo "WARNING: No .env file found!"
    echo "Please copy .env.example to .env and configure your settings."
    echo ""
    echo "  cp .env.example .env"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "=== Starting Saloon Bot ==="
echo "Compose file: ${COMPOSE_FILE}"

# Start the container
docker compose -f "${COMPOSE_FILE}" up -d ${BUILD_FLAG}

echo ""
echo "=== Bot Started ==="
echo "Web interface: http://localhost:${PORT:-3000}"
echo ""
echo "View logs: ./docker/scripts/logs.sh"
echo "Stop bot:  ./docker/scripts/stop.sh"
