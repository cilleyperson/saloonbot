#!/bin/bash
# Open a shell in the running Saloon Bot container
#
# Usage:
#   ./docker/scripts/shell.sh [--dev]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default container name
CONTAINER_NAME="saloon-bot"

# Parse arguments
for arg in "$@"; do
    case $arg in
        --dev)
            CONTAINER_NAME="saloon-bot-dev"
            ;;
    esac
done

echo "Opening shell in ${CONTAINER_NAME}..."
docker exec -it "${CONTAINER_NAME}" /bin/sh
