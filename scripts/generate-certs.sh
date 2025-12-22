#!/bin/bash
#
# Generate self-signed SSL certificates for development
#
# Usage: ./scripts/generate-certs.sh [hostname]
#
# This creates certificates valid for localhost and optionally an additional hostname.
# For production, use properly signed certificates from a CA like Let's Encrypt.
#

set -e

# Configuration
CERTS_DIR="./certs"
KEY_FILE="$CERTS_DIR/server.key"
CERT_FILE="$CERTS_DIR/server.crt"
DAYS_VALID=365
KEY_SIZE=2048

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Additional hostname (optional)
ADDITIONAL_HOST="${1:-}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   SSL Certificate Generator${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Check if OpenSSL is available
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}Error: OpenSSL is not installed.${NC}"
    echo "Please install OpenSSL and try again."
    exit 1
fi

# Create certs directory if it doesn't exist
if [ ! -d "$CERTS_DIR" ]; then
    echo "Creating certificates directory: $CERTS_DIR"
    mkdir -p "$CERTS_DIR"
fi

# Check if certificates already exist
if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    echo -e "${YELLOW}Warning: Certificates already exist.${NC}"
    read -p "Do you want to overwrite them? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Build Subject Alternative Names
SAN="DNS:localhost,IP:127.0.0.1"
if [ -n "$ADDITIONAL_HOST" ]; then
    SAN="$SAN,DNS:$ADDITIONAL_HOST"
    echo "Including additional hostname: $ADDITIONAL_HOST"
fi

echo "Generating SSL certificates..."
echo "  Key size: $KEY_SIZE bits"
echo "  Valid for: $DAYS_VALID days"
echo "  Hostnames: localhost, 127.0.0.1${ADDITIONAL_HOST:+, $ADDITIONAL_HOST}"
echo

# Generate private key and certificate
openssl req -x509 \
    -newkey rsa:$KEY_SIZE \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days $DAYS_VALID \
    -nodes \
    -subj "/C=US/ST=Local/L=Local/O=Development/OU=SaloonBot/CN=localhost" \
    -addext "subjectAltName=$SAN" \
    2>/dev/null

# Verify the certificate was created
if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    echo -e "${GREEN}Certificates generated successfully!${NC}"
    echo
    echo "Files created:"
    echo "  Private key: $KEY_FILE"
    echo "  Certificate: $CERT_FILE"
    echo
    echo -e "${YELLOW}Certificate details:${NC}"
    openssl x509 -in "$CERT_FILE" -noout -subject -dates -ext subjectAltName 2>/dev/null | head -10
    echo
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Add these lines to your .env file:"
    echo "   HTTPS_ENABLED=true"
    echo "   HTTPS_PORT=3443"
    echo
    echo "2. Start the bot: npm start"
    echo
    echo "3. Access the admin interface at: https://localhost:3443"
    echo
    echo -e "${YELLOW}Note:${NC} Your browser will show a security warning because"
    echo "this is a self-signed certificate. Click 'Advanced' and"
    echo "proceed to accept the certificate for development."
    echo
else
    echo -e "${RED}Error: Failed to generate certificates.${NC}"
    exit 1
fi
