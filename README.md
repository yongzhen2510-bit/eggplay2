# 玩擲

Expo (SDK 55) app with a Node API and Postgres. `npm start`, then press `w` for web or `a` for Android.

```
index.js                 Expo entry
src/
  App.js                 Providers, tabs and navigation
  screens/               One file per page
  games/views/           The game screens, one file per game type
  games/catalog.js       20-game catalog, built-in questions, Gemini question loaders
  components/            ui.js (UI kit and springs), icons.js (all SVG icons), Logo, Mascot, GameRow, PickerSheet
  assets/                logo.js (the app icon as a data URI, so Snack's git import still works)
  data/                  Chat room topics
  state/                 store.js (session, saves, play history, language)
  theme/                 tokens.js (colours and type)
  lib/                   API client
  legacy/                Earlier screens nothing imports; kept for reference
backend/                 Express API, chat WebSocket, Gemini questions and SQL migrations
public/                  Web page template, install manifest and icons (Add to Device)
web/                     Web image: nginx serves the site and passes /api to the API
docker-compose.yml       Website, API and database as one deployment
.env.example             Copy to .env
```

## Deploy

```
cp .env.example .env     # set POSTGRES_PASSWORD and JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

No container publishes a port, so the stack is only reachable inside its Compose network. To serve it, connect a reverse proxy or tunnel to the `web` container on port 80, on the same Docker network. The proxy must forward WebSocket upgrades for `/api/ws` and set `X-Forwarded-For`, because rate limits use it to tell visitors apart. The database keeps its data in the `db-data` volume, and the API applies `backend/migrations/` when it starts.

To point a phone or a local preview at a deployment, set `EXPO_PUBLIC_API_URL` to its address and restart Expo. There is no TLS in this stack, so put an HTTPS proxy in front of it before using it publicly.

Set `DASHBOARD_PASSWORD` to turn on `/dashboard`, which shows Gemini status and all users. It is off when the password is empty or under 12 characters.

To change the schema, add a new numbered file to `backend/migrations/`. Each file runs once.
