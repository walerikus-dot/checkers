# Snapshot Rule

## When to update .claude/SNAPSHOT.md:
- After completing any significant feature or fix
- When the user ends a session
- When context feels close to its limit

## Canonical format (keep under 30 lines, write in English):

```
# Project Snapshot
_Updated: YYYY-MM-DD_

## Done
- <what was completed>

## In progress
- <started but unfinished>

## Problems
- <known bugs, blockers, tech debt noticed>

## Next steps
- <logical next 2–3 tasks>

## Key files
- <paths that matter for next session>

## Infra
- <server/deploy state if relevant>
```

## Rules:
- Dense, not verbose. One line per item.
- No preamble, no commentary — just facts.
- Update in place, not appended.
