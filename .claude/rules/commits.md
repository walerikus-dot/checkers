# Commit Rules

## Never commit unless the user explicitly asks.

## When asked to commit:
- Stage only files relevant to the current change — never `git add -A` blindly
- Write a concise message: imperative mood, max 72 chars, focus on "why" not "what"
- Always append: `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`
- Use rtk prefix: `rtk git add ...`, `rtk git commit ...`

## Never commit:
- `.env` files or anything containing secrets
- `node_modules/`, build artifacts, `*.tar.gz`
- `settings.local.json`

## After committing:
- Run `rtk git status` to confirm clean working tree
- Do NOT push unless the user explicitly says "push"
