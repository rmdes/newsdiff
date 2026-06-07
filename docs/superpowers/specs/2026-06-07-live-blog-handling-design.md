# Live-blog handling — design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Problem

NewsDiff tracks how articles change after publication. Live blogs (e.g. the
Guardian's `/sport/live/...` "as it happened" pages) break the core assumption
that *a change is newsworthy*: they are **designed** to change constantly,
appending a new entry every few minutes. This produces two problems:

1. **Noise** — every poll yields a "content changed" diff that is just a new
   appended entry (plus ticking timers, already handled by `isBoring`'s relative-
   time stripping). These are not corrections; they are normal live-blogging.
2. **Storage / clutter** — a live blog versions on every poll (~12/hour during an
   event, 10–20 KB of `content_text` each), accumulating hundreds of versions and
   diffs per article.

Evidence (Guardian, 2026-06-07): in two live-blog diffs every change was
concentrated in the **top 0–11 %** of the document with a long unchanged tail —
i.e. pure prepends. Live blogs are reverse-chronological, so `old_content` is
effectively a **suffix** of `new_content` on a pure append.

The genuinely interesting signal from a live blog is the **opposite** of a
regular article: not that a new entry was added (expected), but that an
**already-published entry was edited or deleted** (quietly altering the record).

## Goals

- Detect live blogs generically (no per-site rules).
- Suppress pure-append updates as boring; surface edits/deletions of
  already-published content.
- Bound storage growth from live blogs.
- Keep a live blog's history browsable in the web UI.
- Leave regular-article behavior unchanged.

## Non-goals (YAGNI)

- No version pruning / foreign-key cleanup (cadence bounds growth at the source).
- No per-feed "live blog" config toggle.
- No separate `kind` column or new content-type table.
- No attempt to catch an edit-then-revert that happens entirely within one
  30-minute snapshot window (accepted trade-off of cadence).

## Design

### 1. Detection

`detectLiveBlog(html, url)` returns `true` when:

- the raw HTML contains the JSON-LD token `"LiveBlogPosting"` (substring check —
  robust to `@type` being a string *or* an array, e.g.
  `"@type":["LiveBlogPosting","NewsArticle"]`), **or**
- the URL path contains a `/live/` segment (cheap fallback).

`ExtractedArticle` gains `isLiveBlog: boolean`. `extractArticle()` sets it via
`detectLiveBlog()` on every successful extraction (mf2 and fallback paths).

Persisted on `articles.is_live_blog` (boolean, NOT NULL, default false). Set to
`true` whenever detection reports a live blog; never unset (once a live blog,
stays one — harmless and avoids flapping).

### 2. Append-aware diffing (B)

New pure helper in `differ.ts`:

```
isPureAddition(oldText, newText): boolean
  - normalize both via the SAME normalize + time-strip used by isBoring
    (so ticking relative timers on older entries don't defeat detection)
  - trim the longest common prefix of (old, new)
  - trim the longest common suffix of the remainders
  - return true if what remains of OLD is empty/whitespace
    (everything previously published is still present; only new text inserted)
```

To share the normalization, `isBoring`'s internal `normalize` and `stripTime`
are lifted to a module-level helper (e.g. `normalizeForCompare(text)`) that both
`isBoring` and `isPureAddition` call — no behavior change to `isBoring`, just a
refactor so the two stay consistent.

Char-level prefix/suffix comparison on the normalized text. Cases:

- Pure prepend (new entries at top) → old is a common suffix → `oldMiddle` empty → `true`.
- Pure append (new entries at bottom) → old is a common prefix → `oldMiddle` empty → `true`.
- Edit of an existing entry → changed old text remains in the middle → `false`.
- Deletion of an existing entry → removed old text remains in the middle → `false`.

`evaluateChange`'s policy object gains `isLiveBlog?: boolean`. Content is treated
as boring when:

```
contentBoring = isBoring(oldContent, newContent)
             || (policy.isLiveBlog && isPureAddition(oldContent, newContent))
isBoring(result) = contentBoring && !titleChanged    // unchanged outer rule
```

So append-only live-blog updates become boring; edits/deletions of past entries
stay non-boring. Regular articles never hit the new branch.

### 3. Snapshot cadence (C)

Constant `LIVE_BLOG_SNAPSHOT_MS = 30 * 60 * 1000`.

In `processArticle` (poller) and `processArticlePush` (WebSub), after a content
change is detected (`latestVersion.contentHash !== contentHash`) and **only for
live-blog articles**:

```
if (isLiveBlog && latestVersion
    && (now - latestVersion.createdAt) < LIVE_BLOG_SNAPSHOT_MS) {
  return; // coalesce rapid updates into ~30-min snapshots
}
```

The baseline (first) version is always created. Regular articles are unaffected.
This bounds a live blog to ~1 version / 30 min with no pruning.

### 4. UI (D)

The homepage already groups diffs by `articleId` and drops groups whose visible
(non-boring) diff count is zero — so an appends-only live blog disappears
automatically and reappears when a real edit occurs. Additions:

- A **"Live blog"** badge on the grouped card (homepage) and on the article page,
  driven by `article.is_live_blog`.
- The article page continues to list the (now ~30-min-spaced) version history for
  browsing; boring append diffs keep their existing "Boring" badge.

## Data flow

```
poll/push → fetch HTML → extractArticle()
  → { title, byline, content, isLiveBlog }
  → upsert article (set is_live_blog = isLiveBlog OR existing)
  → latestVersion
  → if hash unchanged: stop
  → if isLiveBlog && latestVersion age < 30m: stop (cadence)
  → insert version (onConflictDoNothing on (article_id, version_number); bail if lost race)
  → evaluateChange(old, new, { siteName, ignoreTitleChanges, isLiveBlog })
      → isBoring via isPureAddition for live blogs
  → insert diff; syndicate iff feed.syndicate && !isBoring
```

## Schema change

```sql
ALTER TABLE "articles" ADD COLUMN "is_live_blog" boolean NOT NULL DEFAULT false;
```

Additive, backfills existing rows to `false`. Drizzle migration generated +
applied on deploy via `migrate.ts` (same flow as prior migrations).

## Affected files

- `src/lib/server/services/extractor.ts` — `detectLiveBlog()`, `isLiveBlog` on result.
- `src/lib/server/services/differ.ts` — `isPureAddition()`, `isLiveBlog` in policy.
- `src/lib/server/db/schema.ts` + new migration — `articles.is_live_blog`.
- `src/lib/server/workers/feed-poller.ts` — set flag, cadence, pass `isLiveBlog`.
- `src/routes/api/websub/[feedId]/+server.ts` — same three changes.
- `src/routes/+page.svelte` and `src/routes/article/[id]/+page.svelte` — badge.

## Testing

- `isPureAddition`: prepend, append, edit-in-middle, deletion, identical, empty,
  and **prepend + ticked timers on older entries → still pure addition** (the
  normalization case).
- `evaluateChange`: live-blog pure append → boring; live-blog append with timer
  churn → boring; live-blog edit-of-past-entry → not boring; regular-article
  addition → not boring (unchanged).
- `detectLiveBlog`: LiveBlogPosting JSON-LD → true; NewsArticle → false;
  `/live/` URL → true; regular URL → false.
- Cadence: covered by reasoning + live verification (worker is integration-tested
  against the deployment, consistent with existing project practice).

## Rollout

Ship via the established flow: commit + push app (CI builds ghcr), bump
`cloudron-newsdiff` submodule, `cloudron build` → Docker Hub, `cloudron update`
(migration runs on startup). The Guardian feed (id 22, not syndicated) is the
live test bed.
