# CLAUDE.md — newsdiff

## Project Vision

A modern news article diff tracker that monitors RSS feeds for changes in titles and content, displays diffs on a web frontend, and optionally syndicates diff posts to Bluesky and Mastodon. Draws inspiration from three legacy projects (newsdiffs, diffengine, NYTdiff) but built with modern technologies.

## Core Goals

1. **Monitor RSS/Atom/JSON Feed** for article changes (titles, content, metadata)
2. **Extract article content** automatically (no per-site parsers)
3. **Detect and visualize diffs** between article versions
4. **Web frontend** as the primary interface for browsing and viewing diffs
5. **Social syndication** — post diff summaries/images to Bluesky and ActivityPub (Fediverse)
6. **Internet Archive** — archive each version to the Wayback Machine
7. **Atom output feeds** — subscribe to diffs via RSS reader
8. **No Twitter/X** — explicitly excluded from scope

## Tech Stack

| Component | Library |
|-----------|---------|
| Framework | SvelteKit (adapter-node) |
| Database | PostgreSQL (Cloudron addon) |
| ORM | Drizzle |
| Job Queue | BullMQ (Redis-backed, Cloudron addon) |
| Feed Parsing | rss-parser + JSON Feed |
| Content Extraction | Defuddle (primary) + @mozilla/readability (fallback) + JSDOM |
| Diffing | diff (jsdiff) — word-level |
| Bluesky SDK | @atproto/api |
| ActivityPub | @fedify/botkit |
| Diff Card Images | satori + sharp |
| Runtime | Node.js 22 |
| Deployment | Cloudron or Docker Compose |

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server
npm run build        # Production build
npm run migrate      # Run database migrations
```

## Project Structure

```
src/
  lib/
    server/
      db/             # Drizzle schema + migrations
      workers/        # BullMQ job processors (feed poller, syndicator)
      services/       # Content extraction, diffing, social posting
    components/       # Svelte UI components
  routes/             # SvelteKit pages and API routes
static/               # Static assets
CloudronManifest.json # Cloudron app manifest
Dockerfile            # Cloudron deployment image
start.sh              # Cloudron startup script
```

---

## Predecessor Audit

This project is informed by analysis of three existing news diff tools. All are functional concepts with rotting implementations.

### 1. newsdiffs (2012, Knight-Mozilla hackathon)

**What it does:** Full article body diffing with a Django web UI. Scrapes 5 hardcoded news sites (NYT, CNN, Politico, BBC, WashPo), stores every version as a file in Git repos (one per month), renders diffs client-side with Google diff-match-patch.

**Architecture:**
- Scraper (cron) -> per-site BeautifulSoup parsers -> Git repo storage -> Django web frontend
- `Articles` and `Version` tables in SQL; article text retrieved via `git show <sha>:<path>`
- Adaptive check frequency: 15min for new articles, tapering to monthly for old ones
- "Boring" version filtering (skips whitespace-only / encoding-only changes)

**Web UI pages:** Homepage with URL lookup, browse recent changes (filterable by source), article history, side-by-side diff view, Atom feeds per source.

**What's broken:**
- Python 2 only (fatal — `urllib2`, `cookielib`, `print` statements, `except X, e:` syntax)
- Django 1.5 (current is 5.x; uses removed APIs everywhere)
- Requires BOTH BeautifulSoup 3.2 AND 4.0 simultaneously
- All 5 site parsers target 2012-era HTML that no longer exists
- Hardcoded MIT infrastructure paths (`/mit/newsdiffs/.my.cnf`)
- `cleanup.py` has a bare variable name that causes `NameError` at runtime
- Pagination disabled ("overloading the server")
- Secret key committed to repo

**Key insight to preserve:** Full body diffing + web UI + adaptive scheduling + boring-version filtering. Git-based storage is space-efficient and provides queryable history.

### 2. diffengine (~2017, Ed Summers)

**What it does:** Feed-agnostic article diff tracker. Monitors any RSS/Atom feed, extracts content via readability-lxml, generates HTML diffs + PNG screenshots, submits to Internet Archive, notifies via Twitter and SendGrid email.

**Architecture:**
- Single-package Python app, monolith `__init__.py` (743 lines)
- Peewee ORM (Feed, Entry, FeedEntry, EntryVersion, Diff tables)
- Config via YAML with `${ENV_VAR}` interpolation (envyaml)
- Diff files stored at `{home}/diffs/{id % 257}/{id}.html|.png|thumb.png`
- Selenium (geckodriver/chromedriver) for screenshots
- htmldiff2 for server-side HTML diffing, Jinja2 for diff page template

**Data flow:** RSS feed -> feedparser -> readability-lxml extraction -> fingerprint comparison -> htmldiff2 diff -> Selenium screenshot -> Twitter thread / SendGrid email -> Internet Archive submission

**What's broken:**
- Twitter API completely broken (`update_with_media` removed June 2023)
- Selenium `executable_path` deprecated/removed in Selenium 4.x
- `stale` property uses `.seconds` instead of `.total_seconds()` (wraps at 86400s)
- Archive.org dependency: if snapshot fails, no notification is sent at all
- `blogged` field is dead code
- Travis CI on Python 3.7 only

**Key insight to preserve:** Feed-agnostic design + readability for automatic content extraction (no per-site parsers) + Internet Archive integration + YAML config with env var support.

### 3. NYTdiff (~2020+)

**What it does:** Monitors NYT Top Stories API for metadata changes (headline, abstract, kicker, URL). Generates visual diff images via Selenium screenshots, posts to Twitter and Bluesky as threaded replies.

**Architecture:**
- Single file `nytdiff.py` (617 lines), two classes (BaseParser, NYTParser)
- SQLite via `dataset` (nyt_ids + nyt_versions tables)
- simplediff for word-level diffing -> HTML with `<ins>`/`<del>` -> Selenium screenshot -> PNG
- Thread continuity: all diffs for one article accumulate in one social media thread
- Bluesky support via atproto SDK, with image aspect ratio hints and alt text

**What's broken:**
- `PHANTOMJS_PATH` env var required but unused (crashes on startup if missing)
- `TemporaryDirectory(delete=False)` in `with` block = resource leak
- Bare `except:` clauses throughout
- Hardcoded `America/Buenos_Aires` timezone
- Chinese article filter hardcoded
- Hash covers thumbnail/byline but diffs are only generated for 4 fields (silent version bumps)
- No Mastodon code despite README claiming Mastodon support
- Only tracks metadata, not article body text

**Key insight to preserve:** Thread-based social posting (all diffs for one article in one thread) + Bluesky support + visual diff images with CSS styling + alt text accessibility.

### Cross-Cutting Comparison

| Aspect | newsdiffs | diffengine | NYTdiff |
|--------|-----------|------------|---------|
| Content scope | Full body + title + byline | Full body + title + URL | Metadata only |
| Source flexibility | 5 hardcoded sites | Any RSS/Atom feed | NYT API only |
| Content extraction | Per-site BS parsers | readability-lxml (automatic) | API (no extraction) |
| Diff algorithm | diff-match-patch (client JS) | htmldiff2 (server HTML) | simplediff (word-level) |
| Storage | Git repos + SQL | Peewee SQL + filesystem | dataset/SQLite |
| Web UI | Yes (Django) | No | No |
| Social posting | No | Twitter (broken) + email | Twitter + Bluesky |
| Screenshots | No | Selenium | Selenium |
| Archive.org | No | Yes | No |
| Scheduling | Adaptive backoff | External cron | External cron |

### Patterns to Carry Forward

1. **Feed-agnostic RSS monitoring** (from diffengine)
2. **Automatic content extraction via readability** (from diffengine, eliminates per-site parsers)
3. **Full article body diffing** (from newsdiffs — the most valuable feature)
4. **Web UI for browsing diffs** (from newsdiffs — primary interface)
5. **Thread-based social syndication** (from NYTdiff — Bluesky thread model)
6. **Adaptive check frequency** (from newsdiffs — check new articles more often)
7. **Boring version filtering** (from newsdiffs — skip noise)
8. **Visual diff images for social posts** (from NYTdiff/diffengine)
9. **Internet Archive integration** (from diffengine — preserve evidence)
10. **Alt text on diff images** (from NYTdiff — accessibility)

### Anti-Patterns to Avoid

1. Per-site HTML parsers (newsdiffs) — use readability instead
2. Selenium for screenshots — heavy, fragile, slow
3. Single-file monoliths (NYTdiff, diffengine) — proper module structure
4. Bare except clauses — proper error handling
5. Twitter/X dependency — dead platform for bots
6. Hardcoded news sources — must be configurable
7. Git subprocess calls for storage (newsdiffs) — use a proper database
8. Python 2 anything
