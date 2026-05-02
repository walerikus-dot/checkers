#!/bin/bash
# Run on SERVER to update only the HTML (no rebuild needed).
# Usage: bash update-html.sh
set -e
cd /opt/checkers
docker compose exec nginx sh -c "nginx -s reload" 2>/dev/null || true
echo "✓ HTML updated."
