#!/bin/bash
# PostToolUse hook — runs after Edit/Write operations.
# Warns when uncommitted changes accumulate.

# Consume stdin (tool output JSON — not needed here)
cat > /dev/null

# Count uncommitted files
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

if [ -z "$UNCOMMITTED" ] || [ "$UNCOMMITTED" -eq 0 ]; then exit 0; fi

if [ "$UNCOMMITTED" -ge 15 ]; then
  echo "⚠️  $UNCOMMITTED uncommitted files. Update SNAPSHOT.md and consider committing before continuing."
elif [ "$UNCOMMITTED" -ge 8 ]; then
  echo "ℹ️  $UNCOMMITTED uncommitted files accumulating."
fi

exit 0
