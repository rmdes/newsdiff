# NewsDiff — Design Document

**Date:** 2026-03-26
**Status:** Approved

## Overview

NewsDiff is a modern news article diff tracker that monitors RSS feeds for changes in article titles and content, displays diffs on a web frontend, and optionally syndicates diff posts to Bluesky and Mastodon. It draws inspiration from three legacy projects (newsdiffs, diffengine, NYTdiff) while using modern technologies and avoiding their accumulated technical debt.

## Goals

1. Monitor any RSS/Atom feed for article changes (titles, content, metadata)
2. Extract article content automatically via readability (no per-site parsers)
3. Detect and visualize diffs between article versions
4. Web frontend as the primary interface for browsing and viewing diffs
5. Optional social syndication — post diff summaries/images to Bluesky and Mastodon
6. Deploy on Cloudron with native Postgres and Redis addons

## Non-Goals

- Twitter/X support (explicitly excluded)
- Per-site HTML parsers (readability handles extraction generically)
- Real-time/WebSocket updates (polling-based is sufficient)
- User accounts or multi-tenancy (single-operator tool)

## Tech Stack

| Component | Library | Version | Rationale |
|-----------|---------|---------|-----------|
| Framework | SvelteKit (adapter-node) | latest | SSR + API routes + form actions, all-in-one |
| Database | PostgreSQL | Cloudron addon | Production-grade, queryable full-text |
| ORM | Drizzle | 0.45+ | Schema-as-code, typed, excellent Postgres support |
| Job Queue | BullMQ | 5.x | Redis-backed, crash-safe, retry with backoff |
| Cache/Queue Backend | Redis | Cloudron addon | Required by BullMQ |
| RSS Parsing | rss-parser | 3.x | Stable, handles RSS/Atom, typed |
| Content Extraction | @mozilla/readability + linkedom | latest | Firefox-grade extraction, lightweight (no jsdom) |
| Diffing | diff (jsdiff) | 8.x | Word-level diffs, 25M/week downloads, actively maintained |
| Bluesky SDK | @atproto/api | 0.19+ | Official AT Protocol SDK |
| Mastodon SDK | masto | 7.x | Full TypeScript, actively maintained |
| Diff Card Images | satori + sharp | latest | Generate PNG from JSX without a browser |
| Runtime | Node.js 22 | LTS | Required by dependencies |

## Architecture

### Container Layout

Single Cloudron container running multiple concerns in one Node.js process:

```
┌─ Cloudron Container ──────────────────────────────────────┐
│                                                            │
│  start.sh                                                  │
│    ├── Drizzle migrations (on every startup)               │
│    ├── Source /app/data/config/env.sh (user secrets)       │
│    │                                                       │
│    ├── SvelteKit (adapter-node) on port 3000               │
│    │     ├── Web UI (browse feeds, view diffs, manage)     │
│    │     └── API routes (add/remove feeds, settings)       │
│    │                                                       │
│    └── BullMQ Workers (in-process, same Node runtime)      │
│          ├── Feed Poller (repeatable job, every N min)     │
│          │     ├── rss-parser → fetch feed                 │
│          │     ├── readability + linkedom → extract        │
│          │     ├── jsdiff → detect changes                 │
│          │     └── Store versions + diffs in Postgres      │
│          │                                                 │
│          └── Social Syndicator (triggered on new diff)     │
│                ├── satori + sharp → diff card PNG          │
│                ├── @atproto/api → post to Bluesky          │
│                └── masto → post to Mastodon                │
│                                                            │
│  Cloudron Addons:                                          │
│    PostgreSQL ← CLOUDRON_POSTGRESQL_URL                    │
│    Redis      ← CLOUDRON_REDIS_URL                         │
│    localstorage ← /app/data (diff images, config)         │
└────────────────────────────────────────────────────────────┘
```

### Data Flow

```
RSS Feed
  → rss-parser (parse feed, extract article URLs)
  → readability + linkedom (fetch article, extract clean text)
  → SHA-256 hash comparison against last stored version
  → if changed:
      → Store new version in versions table
      → jsdiff (compute word-level diff)
      → Store diff_html in diffs table
      → Queue social syndication job (BullMQ)
  → Social Syndicator worker:
      → Generate diff card PNG (satori + sharp)
      → Post to Bluesky thread (if configured)
      → Post to Mastodon thread (if configured)
      → Store post references in social_posts table
```

## Data Model

### feeds

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| name | text | Display name |
| url | text unique | RSS/Atom feed URL |
| site_name | text | Extracted from feed metadata |
| check_interval | integer | Minutes between checks (default: 5) |
| is_active | boolean | Toggle feed on/off |
| created_at | timestamp | |

### articles

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| feed_id | FK → feeds | |
| url | text unique | Canonical article URL |
| first_seen_at | timestamp | When first discovered in feed |
| last_checked_at | timestamp | Last time we fetched the article |
| last_changed_at | timestamp | Last time content actually changed |
| check_count | integer | Total times checked (for adaptive scheduling) |

### versions

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| article_id | FK → articles | |
| title | text | Article title at this version |
| byline | text | Author/byline |
| content_text | text | Full extracted article text |
| content_hash | text | SHA-256 of normalized text (for fast change detection) |
| version_number | integer | Incrementing per article |
| created_at | timestamp | When this version was captured |

### diffs

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| article_id | FK → articles | |
| old_version_id | FK → versions | |
| new_version_id | FK → versions | |
| title_changed | boolean | Quick flag for UI badges |
| content_changed | boolean | Quick flag for UI badges |
| diff_html | text | Pre-rendered jsdiff output with `<ins>`/`<del>` |
| chars_added | integer | For summary stats |
| chars_removed | integer | For summary stats |
| is_boring | boolean | Whitespace-only, encoding-only, or cycle detection |
| created_at | timestamp | |

### social_posts

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| diff_id | FK → diffs | |
| platform | text | 'bluesky' or 'mastodon' |
| post_uri | text | Platform-specific post identifier |
| thread_root_uri | text | First post in the article's thread |
| image_path | text | Path to diff card PNG in /app/data/images/ |
| posted_at | timestamp | |
| error | text | Null on success, error message on failure |

## Web UI

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — recent diffs across all feeds, filterable by feed, paginated. Hides boring diffs by default. |
| `/feeds` | Manage feeds — add/remove/toggle RSS sources. Simple admin page. |
| `/feed/[slug]` | All articles + diffs for one feed. Timeline view. |
| `/article/[id]` | Version history for one article. All versions with links to diffs. |
| `/diff/[id]` | Single diff view. Inline diff with `<ins>` (green) / `<del>` (red). Title diff at top, content diff below. Metadata sidebar. |
| `/diff/[id].png` | Diff card image. Generated on first request, cached to /app/data/images/. Used for OG tags and social posts. |
| `/health` | Returns 200. Used by Cloudron health check. |

### Diff View Details

- Title diff shown prominently at top (if title changed)
- Content diff below — inline with green insertions, red/strikethrough deletions
- Metadata sidebar: source, article URL, old → new timestamps, version numbers
- Navigation links: previous/next diff for same article, back to feed
- OG meta tags point to `/diff/[id].png` for rich social sharing

### Dashboard

- Cards: feed name, article title, change type badge ("Headline" / "Content" / "Both"), timestamp
- Default filter hides boring diffs, toggle to show all
- Feed filter tabs across the top

## Social Syndication

### Thread Model

One thread per article on each platform. First diff creates a root post (link card embed with article URL). Each subsequent diff is a reply to the thread, building a chronological edit history.

### Bluesky

- Root post: website card embed (title + description + thumbnail)
- Replies: diff card image (`AppBskyEmbedImages`) + text describing the change
- Threading via `reply: { root: rootRef, parent: parentRef }`
- Store `post_uri`, `post_cid`, `thread_root_uri`, `thread_root_cid` in social_posts

### Mastodon

- Root toot: article link + description text
- Replies: diff card image attachment + change description
- Threading via `inReplyToId`
- Store `post_uri`, `thread_root_uri` in social_posts

### Alt Text

Every diff card image gets alt text:
- Title change: `"Before: {old_title}\nAfter: {new_title}"`
- Content change: `"Article content changed: {chars_added} characters added, {chars_removed} characters removed"`

### Retry

BullMQ handles retries: 3 attempts with exponential backoff. Failed posts are logged in `social_posts.error` for visibility.

### Configuration

Via `/app/data/config/env.sh` (Cloudron pattern, editable via `cloudron exec`):

```bash
# Bluesky (optional)
export BLUESKY_HANDLE=""
export BLUESKY_PASSWORD=""

# Mastodon (optional)
export MASTODON_INSTANCE=""
export MASTODON_ACCESS_TOKEN=""
```

Both platforms are independently optional. If no credentials are provided, syndication is skipped.

## Feed Polling Strategy

### Adaptive Check Frequency (from newsdiffs)

Articles are checked more frequently when new, less frequently as they age:

| Article Age | Check Interval |
|-------------|---------------|
| < 3 hours | Every check_interval (default 5 min) |
| 3h - 24h | Every 30 min |
| 1d - 7d | Every 3 hours |
| 7d - 30d | Every 12 hours |
| > 30d | Stop checking |

This prevents wasting resources on old articles that are unlikely to change.

### Boring Diff Detection (from newsdiffs)

A diff is marked `is_boring = true` if:
- Only whitespace changes
- Only date/timestamp metadata changes
- Character encoding normalization artifacts
- Same content cycling back (seen 3+ times)

Boring diffs are stored but hidden from the default UI and never syndicated to social media.

## Cloudron Deployment

### CloudronManifest.json

```json
{
  "id": "com.newsdiff.app",
  "title": "NewsDiff",
  "version": "0.1.0",
  "httpPort": 3000,
  "healthCheckPath": "/health",
  "addons": {
    "localstorage": {},
    "postgresql": {},
    "redis": {}
  },
  "manifestVersion": 2,
  "minBoxVersion": "7.6.0"
}
```

### Dockerfile Pattern

```dockerfile
FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c

ARG NODE_VERSION=22.22.0
RUN mkdir -p /usr/local/node-$NODE_VERSION && \
    curl -L https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz | \
    tar zxf - --strip-components 1 -C /usr/local/node-$NODE_VERSION
ENV PATH="/usr/local/node-$NODE_VERSION/bin:$PATH"

WORKDIR /app/code
COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production

# Symlink writable paths (dangling during build, valid at runtime)
RUN mkdir -p /app/code/images && rm -rf /app/code/images && \
    ln -s /app/data/images /app/code/images

COPY start.sh /app/pkg/start.sh
CMD ["/app/pkg/start.sh"]
```

### start.sh Pattern

```bash
#!/bin/bash
set -eu

mkdir -p /app/data/config /app/data/images

# First-run: create env.sh template
if [[ ! -f /app/data/config/env.sh ]]; then
    cp /app/pkg/env.sh.template /app/data/config/env.sh
fi
source /app/data/config/env.sh

# Map Cloudron env vars
export DATABASE_URL="postgresql://${CLOUDRON_POSTGRESQL_USERNAME}:${CLOUDRON_POSTGRESQL_PASSWORD}@${CLOUDRON_POSTGRESQL_HOST}:${CLOUDRON_POSTGRESQL_PORT}/${CLOUDRON_POSTGRESQL_DATABASE}"
export REDIS_URL="redis://:${CLOUDRON_REDIS_PASSWORD}@${CLOUDRON_REDIS_HOST}:${CLOUDRON_REDIS_PORT}"
export ORIGIN="${CLOUDRON_APP_ORIGIN}"
export PORT=3000

# Run migrations (always, idempotent)
gosu cloudron:cloudron node /app/code/build/migrate.js

chown -R cloudron:cloudron /app/data

exec gosu cloudron:cloudron node /app/code/build/index.js
```

## Patterns Preserved from Predecessors

| Pattern | Source | Implementation |
|---------|--------|----------------|
| Feed-agnostic RSS monitoring | diffengine | rss-parser, any feed URL |
| Automatic content extraction | diffengine | @mozilla/readability + linkedom |
| Full article body diffing | newsdiffs | jsdiff word-level diffs |
| Web UI for browsing diffs | newsdiffs | SvelteKit SSR pages |
| Thread-based social posting | NYTdiff | One thread per article on Bluesky/Mastodon |
| Adaptive check frequency | newsdiffs | Age-based interval scaling |
| Boring version filtering | newsdiffs | Skip noise in UI and syndication |
| Visual diff images | NYTdiff/diffengine | Satori + sharp (no Selenium) |
| Alt text on images | NYTdiff | Accessibility for social posts |
| Internet Archive integration | diffengine | Future consideration (not in v0.1) |

## Anti-Patterns Avoided

| Anti-Pattern | Source | Our Approach |
|--------------|--------|-------------|
| Per-site HTML parsers | newsdiffs | readability handles extraction generically |
| Selenium for screenshots | all three | Satori + sharp (no browser process) |
| Single-file monoliths | NYTdiff, diffengine | Proper SvelteKit module structure |
| Client-side diff computation | newsdiffs | Pre-rendered server-side, stored in DB |
| Git subprocess for storage | newsdiffs | Postgres directly |
| Twitter/X dependency | diffengine, NYTdiff | Bluesky + Mastodon only |
| Hardcoded news sources | newsdiffs, NYTdiff | Configurable via web UI |
