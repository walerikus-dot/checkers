# Checkers Project Wiki

> Live game: **[https://chashki.duckdns.org/checkers-final.html](https://chashki.duckdns.org/checkers-final.html)**

## Pages

| # | Page | What it covers |
|---|------|----------------|
| [01](01-overview.md) | **Overview** | What the project is, current status, tech stack, quick-start |
| [02](02-architecture.md) | **Architecture** | System diagram, layers, entry points, nginx, Docker, DB schema |
| [03](03-game-engine.md) | **Game Engine** | Board representation, rulesets, move generation, AI (minimax), multi-capture, win detection |
| [04](04-api-reference.md) | **API Reference** | REST endpoints, WebSocket /game + /guest events, room lifecycle |
| [05](05-ui-client.md) | **UI Client** | Standalone HTML client, hamburger menu, piece/board customisation, online UI, translations |
| [06](06-deployment.md) | **Deployment** | Production server layout, nginx config, Docker relay, update commands |
| [07](07-development.md) | **Development** | Local setup, launch configs, common issues, RTK commands |

## Quick Reference

```bash
# Update live game (no restart needed — bind mount)
scp -i ~/.ssh/checkers_deploy "C:/Users/valer/Documents/Claude/Projects/Checkers/index.html" \
  root@130.12.242.84:/opt/checkers/nginx/html/checkers-final.html

# Run guest relay locally (no DB needed)
cd backend && npm run start:guest

# Check server health
ssh -i ~/.ssh/checkers_deploy root@130.12.242.84 \
  "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

## Project Root

```
CLAUDE.md           ← schema, architecture decisions, server info
TESTING.md          ← test scenarios and commands
deploy.sh           ← server deploy helper
wiki/               ← you are here
backend/src/guest/  ← WebSocket relay (no auth, in-memory rooms)
checkers-final.html ← standalone game (Desktop)
```
