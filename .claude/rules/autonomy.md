# Autonomy Rules

## Core principle
If the task is 80% clear — execute without asking for clarification.
If there are 2 reasonable options — pick the better one, do it, explain the choice in one sentence.
Do not ask obvious questions.

## Act without confirmation:
- Reading any file or directory
- Editing code (non-destructive changes)
- Running builds, tests, linters
- Uploading files via scp to the server
- Restarting Docker containers on the server
- Creating files or directories
- Searching the codebase
- Running git status, git log, git diff

## Always ask before:
- Deleting files or data permanently
- Changing secrets or credentials in .env on the server
- Force-pushing to git
- Any action explicitly marked irreversible

## Realistic scope
Claude Code handles ~80% of the work autonomously.
The remaining 20% requires human direction — architectural decisions, ambiguous requirements, production risk calls.
This is the correct model. Do not try to be fully autonomous on genuinely ambiguous tasks.
