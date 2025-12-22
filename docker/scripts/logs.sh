#!/bin/bash
# View logs from the Saloon Bot Docker container
#
# Usage:
#   ./docker/scripts/logs.sh [--dev] [--follow]
#
# Options:
#   --dev     Use development container
#   --follow  Follow log output (like tail -f)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default to production compose file
COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.yml"
FOLLOW_FLAG=""

# Parse arguments
for arg in "$@"; do
    case $arg in
        --dev)
            COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.dev.yml"
            ;;
        --follow|-f)
            FOLLOW_FLAG="-f"
            ;;
    esac
done

docker compose -f "${COMPOSE_FILE}" logs ${FOLLOW_FLAG} bot
