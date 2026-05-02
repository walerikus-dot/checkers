# /finish — Session Wrap-up

Run this at the end of every work session.

## Steps (execute in order, no confirmation needed):

1. Run `rtk git status` — check for uncommitted changes
2. If there are staged/unstaged changes: ask the user "Should I commit these changes?"
3. Update `.claude/SNAPSHOT.md`:
   - Status: one sentence on project health
   - Last done: what was completed this session (max 5 bullets)
   - In progress: anything started but unfinished
   - Next steps: logical next 2–3 tasks
   - Key files changed: paths that matter for next session
   - Known issues: noticed but not fixed
4. Confirm: "Snapshot updated. Session closed."

## Rules:
- Never commit without user confirmation
- Keep SNAPSHOT.md under 40 lines
- Write in English
