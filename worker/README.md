# police-command-rooms (Cloudflare Worker + Durable Object)

WebSocket rooms for multiplayer Police Command.

- `GET /health` — health check
- `WS /room/:id` — join room, sync `incident` / `dispatch` / `state`

## Deploy

Needs:
1. `CLOUDFLARE_API_TOKEN` with Workers + Account Read + User Details Read + Durable Objects
2. `CLOUDFLARE_ACCOUNT_ID`

```bash
source ~/.config/cloudflare/env
export CLOUDFLARE_ACCOUNT_ID=...
cd worker && npx wrangler deploy
```

CORS allows `https://police-command.vercel.app` and `http://localhost:4173`.
