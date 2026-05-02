# /start — Re-initialize mid-session

Use this when you need to re-sync context mid-session (after a long break, after compaction, or when something feels off).

Runs the same init as the automatic session start in CLAUDE.md:

1. Read `.claude/SNAPSHOT.md` — report status, last done, next steps
2. `rtk git status`
3. `rtk git log --oneline -5`
4. `ssh -i ~/.ssh/checkers_deploy root@130.12.242.84 "docker ps --format 'table {{.Names}}\t{{.Status}}'" 2>&1`

Output:
```
## ✅ Re-synced — Checkers
**Status:** <one sentence from SNAPSHOT>
**Last done:** <top 2 items>
**Next up:** <top 2 items>
**Git:** <clean / N files>
**Server:** <all running / issues>
```
