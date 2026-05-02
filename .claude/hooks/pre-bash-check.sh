#!/bin/bash
# PreToolUse hook — runs before every Bash call.
# Reads tool input JSON from stdin, blocks destructive commands.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

if [ -z "$COMMAND" ]; then exit 0; fi

# Patterns that require explicit user confirmation
DANGEROUS=$(echo "$COMMAND" | grep -Ei \
  'rm -rf[[:space:]]*/[^t]|rm -rf[[:space:]]*\.|DROP[[:space:]]+TABLE|DROP[[:space:]]+DATABASE|DELETE[[:space:]]+FROM[[:space:]]+\w+[[:space:]]*;|truncate[[:space:]]+table|\bformat\b[[:space:]]*/|\bmkfs\b|git[[:space:]]+push[[:space:]]+--force')

if [ -n "$DANGEROUS" ]; then
  echo "⛔ BLOCKED: Destructive command detected:"
  echo "   $COMMAND"
  echo "Confirm with the user before proceeding."
  exit 2
fi

exit 0
