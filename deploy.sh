#!/bin/bash
# Run this on the SERVER (130.12.242.84) after uploading the project folder.
# Usage: bash deploy.sh

set -e

echo "=== Copying latest HTML ==="
cp /opt/checkers/nginx/html/checkers-final.html /opt/checkers/nginx/html/checkers-final.html

echo "=== Building and starting containers ==="
cd /opt/checkers
docker compose pull nginx 2>/dev/null || true
docker compose up --build -d

echo "=== Status ==="
docker compose ps

echo ""
echo "✓ Done. Game available at http://$(curl -s ifconfig.me)/"
