# Context Management Rules

## Signs of context degradation:
- Repeating the same question you already answered
- Forgetting a file path or decision made earlier in the session
- Proposing something that was already rejected
- Context window nearing its limit

## When context degrades — do this in order:
1. Update `.claude/SNAPSHOT.md` with current state immediately
2. Tell the user: "Context is getting long — I've updated the snapshot. Consider starting a fresh session."
3. Do NOT try to push through on a degraded context — quality drops fast

## At the start of every session:
- Read `.claude/SNAPSHOT.md` first
- Read `CLAUDE.md` if it's a new task area
- State in one sentence what you understand about the current state before taking any action

## Compaction:
- The PreCompact hook automatically injects SNAPSHOT.md into the compacted context
- After compaction, re-read the snapshot and confirm you understand where things stand
