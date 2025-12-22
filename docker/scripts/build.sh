#!/bin/bash
# Build the Docker image for Saloon Bot
#
# Usage:
#   ./docker/scripts/build.sh [--no-cache]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=== Building Saloon Bot Docker Image ==="
echo "Project root: ${PROJECT_ROOT}"

# Check if --no-cache flag is passed
NO_CACHE=""
if [[ "$1" == "--no-cache" ]]; then
    NO_CACHE="--no-cache"
    echo "Building without cache..."
fi

# Build the image
docker build \
    ${NO_CACHE} \
    -t saloon-bot:latest \
    -f "${PROJECT_ROOT}/docker/Dockerfile" \
    "${PROJECT_ROOT}"

echo ""
echo "=== Build Complete ==="
echo "Image: saloon-bot:latest"
echo ""
echo "To run the container:"
echo "  ./docker/scripts/start.sh"
