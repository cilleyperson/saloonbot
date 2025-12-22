#!/bin/bash
# Clean up Docker resources for Saloon Bot
#
# Usage:
#   ./docker/scripts/cleanup.sh [--all]
#
# Options:
#   --all   Also remove volumes (WARNING: deletes database!)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

REMOVE_VOLUMES=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --all)
            REMOVE_VOLUMES=true
            ;;
    esac
done

echo "=== Cleaning Up Saloon Bot Docker Resources ==="

# Stop containers
echo "Stopping containers..."
docker compose -f "${PROJECT_ROOT}/docker/docker-compose.yml" down 2>/dev/null || true
docker compose -f "${PROJECT_ROOT}/docker/docker-compose.dev.yml" down 2>/dev/null || true

# Remove images
echo "Removing images..."
docker rmi saloon-bot:latest 2>/dev/null || true

if [[ "${REMOVE_VOLUMES}" == "true" ]]; then
    echo ""
    echo "WARNING: About to delete volumes including the database!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Removing volumes..."
        docker volume rm saloon-bot-data 2>/dev/null || true
        docker volume rm saloon-bot-logs 2>/dev/null || true
        docker volume rm saloon-bot-data-dev 2>/dev/null || true
        docker volume rm saloon-bot-logs-dev 2>/dev/null || true
        echo "Volumes removed."
    else
        echo "Volumes preserved."
    fi
fi

echo ""
echo "=== Cleanup Complete ==="
