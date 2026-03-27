# NewsDiff

Monitor RSS feeds for article changes and display visual diffs. When a news article silently updates its headline or content, NewsDiff catches it, stores every version, and shows you exactly what changed.

Draws inspiration from [newsdiffs](https://github.com/danielsci/newsdiffs), [diffengine](https://github.com/edsu/diffengine), and [NYTdiff](https://github.com/j-e-d/NYTdiff) — rebuilt with modern tooling.

## Features

- Monitor any RSS/Atom/JSON Feed for article changes
- Automatic content extraction via Mozilla Readability (no per-site parsers)
- Word-level diffs with inline highlighting
- Visual diff card images for social sharing + full-height diff image download
- ActivityPub bot (Fediverse/Mastodon-compatible) via [Botkit](https://botkit.fedify.dev) with threaded replies
- Bluesky syndication with image embeds, rich link cards, and threaded replies
- Internet Archive integration — each version archived to the Wayback Machine
- Atom output feeds: `/feed.xml` (all diffs), `/feed/{feedId}.xml` (per source), `/article/{id}/feed.xml` (per article)
- Web Share API on mobile, share dropdown on desktop
- "Boring" diff detection — skips timestamp-only changes and minor numeric updates
- Rate-limited syndication (configurable, default: 1 post per 5 minutes)
- OIDC-protected feed management and bot profile editor

## Tech Stack

| Component | Library |
|-----------|---------|
| Framework | SvelteKit (adapter-node) |
| Database | PostgreSQL + Drizzle ORM |
| Job Queue | BullMQ (Redis-backed) |
| RSS Parsing | rss-parser |
| Content Extraction | @mozilla/readability + linkedom |
| Diffing | diff (jsdiff) — word-level |
| ActivityPub | @fedify/botkit |
| Bluesky | @atproto/api |
| Diff Images | satori + sharp (no browser needed) |
| Runtime | Node.js 22 |

## Deployment on Cloudron

NewsDiff is packaged as a [Cloudron](https://cloudron.io) app. It requires the following addons:

- **postgresql** — database
- **redis** — job queue
- **localstorage** — bot profile config and uploaded images
- **oidc** — protects `/feeds` and `/bot/profile` routes

### Build and install

```bash
# Build the Docker image
cloudron build

# Install on your Cloudron instance
cloudron install --image <your-registry>/com.newsdiff.app:<tag>

# Update an existing install
cloudron update --app <app-id> --image <your-registry>/com.newsdiff.app:<tag>
```

### Environment variables (injected by Cloudron addons)

| Variable | Source | Purpose |
|----------|--------|---------|
| `CLOUDRON_POSTGRESQL_URL` | postgresql addon | Database connection |
| `CLOUDRON_REDIS_URL` | redis addon | Job queue |
| `CLOUDRON_OIDC_ISSUER` | oidc addon | Auth provider URL |
| `CLOUDRON_OIDC_CLIENT_ID` | oidc addon | Auth client ID |
| `CLOUDRON_OIDC_CLIENT_SECRET` | oidc addon | Auth client secret |
| `CLOUDRON_APP_ORIGIN` | Cloudron runtime | Public URL of the app |
| `CLOUDRON_DATA_DIR` | Cloudron runtime | Persistent storage path |

These are mapped to the app's internal env vars in `start.sh`.

## Self-hosted (without Cloudron)

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
npm install
npm run migrate
npm run build
node build/index.js
```

The ActivityPub bot server runs on port 8001. An nginx reverse proxy (see `nginx.conf.template`) routes ActivityPub paths to Botkit and everything else to SvelteKit on port 3000.

## Development

```bash
npm install
npm run dev     # SvelteKit dev server on :5173
npm test        # Vitest unit tests
npm run migrate # Run DB migrations
```

## Architecture

```
RSS feeds
  └─ feed-poller (BullMQ)
       └─ readability extraction
       └─ word-level diff
       └─ PostgreSQL
            └─ syndicator (BullMQ)
                 ├─ Bluesky (atproto)
                 └─ ActivityPub (Botkit/Fedify)

SvelteKit (:3000) ─┐
                    ├─ nginx (:8000, public)
Botkit (:8001) ────┘
```

nginx routes ActivityPub paths (`/.well-known/webfinger`, `/users/`, `/ap/`, `/nodeinfo/`) to Botkit; everything else goes to SvelteKit.

## ActivityPub Bot

The bot exposes a Fediverse actor at `@<BOT_USERNAME>@<your-domain>`. Configure the profile at `/bot/profile` (login required). Users can follow the bot from any ActivityPub client (Mastodon, Misskey, etc.) to receive diffs in their feed.

## Credits

- [newsdiffs](https://github.com/danielsci/newsdiffs) — full body diffing, web UI, boring-version filtering
- [diffengine](https://github.com/edsu/diffengine) — feed-agnostic design, readability extraction
- [NYTdiff](https://github.com/j-e-d/NYTdiff) — visual diff images, Bluesky support
- [Botkit](https://botkit.fedify.dev) — ActivityPub bot framework
- [Fedify](https://fedify.dev) — ActivityPub federation library

## License

MIT
