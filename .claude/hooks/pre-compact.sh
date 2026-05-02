#!/bin/bash
# Injected automatically before context compaction.
# stdout goes into the compacted context — Claude reads this after compaction.

SNAP="$(cd "$(dirname "$0")/.." && pwd)/SNAPSHOT.md"

if [ -f "$SNAP" ]; then
  echo "================================================================"
  echo "PROJECT SNAPSHOT — auto-injected before compaction. Read this."
  echo "================================================================"
  cat "$SNAP"
  echo "================================================================"
else
  echo "No SNAPSHOT.md found. Create .claude/SNAPSHOT.md to persist state."
fi
