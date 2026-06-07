# Live-blog Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect live blogs and treat them correctly — suppress pure-append updates as boring, surface edits/deletions of already-published entries, and bound storage with a 30-minute snapshot cadence.

**Architecture:** A generic `detectLiveBlog()` (schema.org `LiveBlogPosting` or `/live/` URL) flags articles. A pure helper `isPureAddition()` (comparing time-stripped text) lets `evaluateChange` mark append-only live-blog diffs boring. The poller/WebSub set the flag and skip versioning within a 30-minute window. The homepage's existing per-article grouping auto-collapses boring updates; a badge marks live blogs.

**Tech Stack:** SvelteKit, Drizzle (PostgreSQL), Vitest, TypeScript. Run npm via Node 22: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`.

**Spec:** `docs/superpowers/specs/2026-06-07-live-blog-handling-design.md`

---

### Task 1: Extract shared `normalizeForCompare` from `isBoring` (no behavior change)

**Files:**
- Modify: `src/lib/server/services/differ.ts`
- Test: `src/lib/server/services/differ.test.ts` (existing — must stay green)

- [ ] **Step 1: Lift `normalize`/`stripTime` to module scope and add `normalizeForCompare`**

In `differ.ts`, add these module-level functions just above `export function isBoring`:

```ts
function normalizeWhitespace(s: string): string {
	return s.replace(/\s+/g, ' ').trim();
}

function stripTime(s: string): string {
	return s
		// Relative times: "8 HRS ago", "3 hours ago", "2 mins ago", "5 minutes read"
		.replace(/\d+\s*(hrs?|hours?|mins?|minutes?|secs?|seconds?|days?|weeks?|months?)\s*(ago|read|old)?/gi, '')
		// Abbreviated relative times ("16m ago", "2h ago", "1d ago") — ago/old required
		.replace(/\b\d+\s*(?:mo|s|m|h|d|w|y)\s+(?:ago|old)\b/gi, '')
		// Absolute times: "12:34", "3:10 PM"
		.replace(/\b\d{1,2}:\d{2}\s*(AM|PM)?\b/gi, '')
		// ISO dates
		.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
		// European/US dates
		.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '')
		// "Mar 24", "March 24, 2026"
		.replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(?:,?\s*\d{4})?\b/gi, '')
		// "24 March 2026"
		.replace(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*(?:\s+\d{4})?\b/gi, '')
		// "Updated/Published/Posted/Modified ..." clauses
		.replace(/[•·\-–—]?\s*(?:updated|published|posted|modified|last\s+modified)\s*:?\s*[^\n.]*/gi, '')
		// Timezone tokens
		.replace(/\b(?:GMT|UTC|EST|CST|MST|PST|CET|CEST|BST|IST|JST|KST|AEST|AEDT)[+-]?\d*\b/gi, '');
}

/** Normalize for change comparison: collapse whitespace AND strip timestamps. */
function normalizeForCompare(s: string): string {
	return normalizeWhitespace(stripTime(s));
}
```

Then replace the body of `isBoring` so it uses these (delete its local `normalize` and `stripTime`):

```ts
export function isBoring(oldText: string, newText: string): boolean {
	// Whitespace-only changes
	if (normalizeWhitespace(oldText) === normalizeWhitespace(newText)) return true;

	// Equal once timestamps/relative-times/update-metadata are stripped
	if (normalizeForCompare(oldText) === normalizeForCompare(newText)) return true;

	// Very small changes in large text that are only numbers/punctuation
	const changes = diffWords(oldText, newText);
	const added = changes.filter((c) => c.added);
	const removed = changes.filter((c) => c.removed);
	const totalChanged =
		added.reduce((s, c) => s + c.value.length, 0) + removed.reduce((s, c) => s + c.value.length, 0);
	const totalLength = Math.max(oldText.length, newText.length);

	if (totalChanged <= 10 && totalLength > 200) {
		const allChangedText = [...added, ...removed].map((c) => c.value).join('');
		if (/^[\d\s.,;:!?/\-–—]+$/.test(allChangedText)) return true;
	}

	return false;
}
```

- [ ] **Step 2: Run the existing differ tests — must all still pass (pure refactor)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run src/lib/server/services/differ.test.ts`
Expected: PASS (all existing tests; no count change).

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/services/differ.ts
git commit -m "refactor(differ): extract normalizeForCompare shared by isBoring"
```

---

### Task 2: Add `isPureAddition` helper

**Files:**
- Modify: `src/lib/server/services/differ.ts`
- Test: `src/lib/server/services/differ.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to `differ.test.ts` (after the `isBoring` block):

```ts
describe('isPureAddition', () => {
	it('true for a pure append', () => {
		expect(isPureAddition('Entry one. Entry two.', 'Entry one. Entry two. Entry three.')).toBe(true);
	});
	it('true for a pure prepend (reverse-chron live blog)', () => {
		expect(isPureAddition('Entry one. Entry two.', 'Entry zero. Entry one. Entry two.')).toBe(true);
	});
	it('false when an existing entry is edited', () => {
		expect(isPureAddition('DRS enabled. Lights out.', 'DRS disabled. Lights out.')).toBe(false);
	});
	it('false when an existing entry is deleted', () => {
		expect(isPureAddition('Entry one. Entry two. Entry three.', 'Entry one. Entry three.')).toBe(false);
	});
	it('true for identical or empty-old', () => {
		expect(isPureAddition('same', 'same')).toBe(true);
		expect(isPureAddition('', 'brand new content')).toBe(true);
	});
	it('true for a prepend even when older entries’ timers ticked', () => {
		const old = 'DRS enabled 18m ago. Lights out 1h ago.';
		const new_ = 'Crash at turn 1 2m ago. DRS enabled 27m ago. Lights out 2h ago.';
		expect(isPureAddition(old, new_)).toBe(true);
	});
	it('false for an edit even when timers also ticked', () => {
		const old = 'DRS enabled 18m ago. Lights out 1h ago.';
		const new_ = 'DRS disabled 27m ago. Lights out 2h ago.';
		expect(isPureAddition(old, new_)).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run src/lib/server/services/differ.test.ts`
Expected: FAIL — `isPureAddition is not exported` / undefined.

- [ ] **Step 3: Implement `isPureAddition`**

Add to `differ.ts` (after `isBoring`):

```ts
/**
 * True when newText only ADDS to oldText — every previously-published character
 * is still present, with new text inserted (prepend or append). Comparison runs
 * on time-stripped/normalized text so ticking relative timers on older entries
 * (common in live blogs) don't defeat detection. An edit or deletion of existing
 * text returns false.
 */
export function isPureAddition(oldText: string, newText: string): boolean {
	const o = normalizeForCompare(oldText);
	const n = normalizeForCompare(newText);
	if (o.length === 0 || o === n) return true;

	let start = 0;
	while (start < o.length && start < n.length && o[start] === n[start]) start++;

	let oEnd = o.length;
	let nEnd = n.length;
	while (oEnd > start && nEnd > start && o[oEnd - 1] === n[nEnd - 1]) {
		oEnd--;
		nEnd--;
	}

	// If nothing of OLD remains between the shared prefix and suffix, only new
	// text was inserted — a pure addition.
	return o.slice(start, oEnd).trim().length === 0;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run src/lib/server/services/differ.test.ts`
Expected: PASS (all, including 7 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/differ.ts src/lib/server/services/differ.test.ts
git commit -m "feat(differ): add isPureAddition (append vs edit detection)"
```

---

### Task 3: Teach `evaluateChange` about live blogs

**Files:**
- Modify: `src/lib/server/services/differ.ts`
- Test: `src/lib/server/services/differ.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the existing `describe('evaluateChange', ...)` block:

```ts
it('marks a live-blog pure append as boring', () => {
	const r = evaluateChange(
		'', 'Entry one. Entry two.',
		'', 'Entry one. Entry two. Entry three.',
		{ isLiveBlog: true }
	);
	expect(r.isBoring).toBe(true);
});

it('marks a live-blog append-with-ticking-timers as boring', () => {
	const r = evaluateChange(
		'', 'DRS enabled 18m ago. Lights out 1h ago.',
		'', 'Crash 2m ago. DRS enabled 27m ago. Lights out 2h ago.',
		{ isLiveBlog: true }
	);
	expect(r.isBoring).toBe(true);
});

it('keeps a live-blog edit of a past entry visible (not boring)', () => {
	const r = evaluateChange(
		'', 'DRS enabled 18m ago. Lights out 1h ago.',
		'', 'DRS disabled 27m ago. Lights out 2h ago.',
		{ isLiveBlog: true }
	);
	expect(r.isBoring).toBe(false);
});

it('does NOT treat a regular-article addition as boring', () => {
	const r = evaluateChange(
		'', 'Para one.',
		'', 'Para one. Para two added later.',
		{} // not a live blog
	);
	expect(r.isBoring).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run src/lib/server/services/differ.test.ts`
Expected: FAIL — live-blog append cases return `isBoring: false` (and `isLiveBlog` not on the policy type).

- [ ] **Step 3: Implement**

In `differ.ts`, add `isLiveBlog` to the `FeedPolicy` interface:

```ts
export interface FeedPolicy {
	siteName?: string | null;
	/** When true, title changes on this feed are never treated as real edits. */
	ignoreTitleChanges?: boolean;
	/** When true (per-article), pure-append content changes are boring. */
	isLiveBlog?: boolean;
}
```

In `evaluateChange`, replace the `isBoringResult` line:

```ts
	// A diff is boring when its content change is noise (timestamps, or — for live
	// blogs — a pure append of new entries) AND its title change is absent/noise.
	const contentBoring =
		isBoring(oldContent, newContent) ||
		(policy.isLiveBlog === true && isPureAddition(oldContent, newContent));
	const isBoringResult = contentBoring && !titleChanged;
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run src/lib/server/services/differ.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/differ.ts src/lib/server/services/differ.test.ts
git commit -m "feat(differ): evaluateChange treats live-blog pure appends as boring"
```

---

### Task 4: `detectLiveBlog` + `isLiveBlog` on extraction

**Files:**
- Modify: `src/lib/server/services/extractor.ts`
- Test: `src/lib/server/services/extractor.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `extractor.test.ts`:

```ts
import { extractArticle, detectLiveBlog, normalizeText, computeHash } from './extractor';

describe('detectLiveBlog', () => {
	it('detects schema.org LiveBlogPosting in JSON-LD', () => {
		const html = '<html><head><script type="application/ld+json">{"@type":"LiveBlogPosting"}</script></head><body></body></html>';
		expect(detectLiveBlog(html, 'https://example.com/x')).toBe(true);
	});
	it('detects LiveBlogPosting inside a @type array', () => {
		const html = '<script type="application/ld+json">{"@type":["LiveBlogPosting","NewsArticle"]}</script>';
		expect(detectLiveBlog(html, 'https://example.com/x')).toBe(true);
	});
	it('treats a NewsArticle as not a live blog', () => {
		const html = '<script type="application/ld+json">{"@type":"NewsArticle"}</script>';
		expect(detectLiveBlog(html, 'https://example.com/news/story')).toBe(false);
	});
	it('detects a /live/ URL path as fallback', () => {
		expect(detectLiveBlog('<html></html>', 'https://www.theguardian.com/sport/live/2026/jun/07/race')).toBe(true);
	});
	it('does not false-positive on "live" inside a word', () => {
		expect(detectLiveBlog('<html></html>', 'https://example.com/delivery/123')).toBe(false);
	});
});
```

Update the existing import line at the top of `extractor.test.ts` to include `detectLiveBlog` (shown above).

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run src/lib/server/services/extractor.test.ts`
Expected: FAIL — `detectLiveBlog is not exported`.

- [ ] **Step 3: Implement detection + attach `isLiveBlog`**

In `extractor.ts`, add `isLiveBlog` to the interface and an internal content type:

```ts
export interface ExtractedArticle {
	title: string;
	byline: string | null;
	content: string;
	isLiveBlog: boolean;
}

type ExtractedContent = Omit<ExtractedArticle, 'isLiveBlog'>;
```

Change the return type of `extractFromMicroformats` and `extractWithReadability` from `ExtractedArticle | null` to `ExtractedContent | null` (signatures only — their bodies already return `{ title, byline, content }`).

Add the detector (near the top of the file):

```ts
/** Detect a live blog generically: schema.org LiveBlogPosting, or a /live/ URL path. */
export function detectLiveBlog(html: string, url: string): boolean {
	if (html.includes('"LiveBlogPosting"')) return true;
	try {
		if (new URL(url).pathname.split('/').includes('live')) return true;
	} catch {
		// invalid URL — ignore
	}
	return false;
}
```

Rename the current `export async function extractArticle(html, url)` to `async function extractContent(html: string, url: string): Promise<ExtractedContent | null>` (body unchanged), and add a new wrapper:

```ts
export async function extractArticle(html: string, url: string): Promise<ExtractedArticle | null> {
	const content = await extractContent(html, url);
	if (!content) return null;
	return { ...content, isLiveBlog: detectLiveBlog(html, url) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run src/lib/server/services/extractor.test.ts`
Expected: PASS (existing extractor tests + 5 new). Existing tests that assert `result!.title`/`content` still pass (those fields unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/extractor.ts src/lib/server/services/extractor.test.ts
git commit -m "feat(extractor): detectLiveBlog + isLiveBlog on ExtractedArticle"
```

---

### Task 5: Schema column + migration

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create: `src/lib/server/db/migrations/NNNN_*.sql` (generated)

- [ ] **Step 1: Add the column to the `articles` table**

In `schema.ts`, inside `export const articles = pgTable('articles', { ... })`, add after `checkCount`:

```ts
	checkCount: integer('check_count').notNull().default(0),
	isLiveBlog: boolean('is_live_blog').notNull().default(false)
```

(Ensure the previous line keeps/gets its trailing comma.)

- [ ] **Step 2: Generate the migration**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npm run generate`
Expected: a new `src/lib/server/db/migrations/NNNN_*.sql` containing
`ALTER TABLE "articles" ADD COLUMN "is_live_blog" boolean DEFAULT false NOT NULL;`

- [ ] **Step 3: Verify the generated SQL**

Run: `cat $(ls -t src/lib/server/db/migrations/*.sql | head -1)`
Expected: the single additive `ALTER TABLE ... ADD COLUMN "is_live_blog"` statement.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/db/migrations/
git commit -m "feat(db): add articles.is_live_blog column + migration"
```

---

### Task 6: Wire the poller — flag, cadence, policy

**Files:**
- Modify: `src/lib/server/workers/feed-poller.ts`

- [ ] **Step 1: Set the flag on article upsert**

In `processArticle`, change the article upsert so a detected live blog is recorded (never unset):

```ts
	const [article] = await db
		.insert(articles)
		.values({ feedId: feed.id, url: finalUrl, isLiveBlog: extracted.isLiveBlog })
		.onConflictDoUpdate({
			target: articles.url,
			set: {
				lastCheckedAt: new Date(),
				...(extracted.isLiveBlog ? { isLiveBlog: true } : {})
			}
		})
		.returning();
```

- [ ] **Step 2: Add the snapshot-cadence guard**

Near the top of `feed-poller.ts` (with the other consts) add:

```ts
const LIVE_BLOG_SNAPSHOT_MS = 30 * 60 * 1000; // coalesce live-blog updates into ~30-min snapshots
```

In `processArticle`, immediately AFTER the existing no-change check
(`if (latestVersion && latestVersion.contentHash === contentHash) return;`) add:

```ts
	// Live blogs change constantly by design — snapshot at most every 30 min.
	if (
		extracted.isLiveBlog &&
		latestVersion &&
		Date.now() - latestVersion.createdAt.getTime() < LIVE_BLOG_SNAPSHOT_MS
	) {
		return;
	}
```

- [ ] **Step 3: Pass `isLiveBlog` into `evaluateChange`**

In the `evaluateChange(...)` call inside `processArticle`, add the field:

```ts
		const change = evaluateChange(
			latestVersion.title,
			latestVersion.contentText,
			extracted.title,
			extracted.content,
			{ siteName: feed.siteName, ignoreTitleChanges: feed.ignoreTitleChanges, isLiveBlog: extracted.isLiveBlog }
		);
```

- [ ] **Step 4: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i 'feed-poller' | grep -i error || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/workers/feed-poller.ts
git commit -m "feat(poller): live-blog flag, 30-min snapshot cadence, append-aware policy"
```

---

### Task 7: Wire the WebSub handler — identical three changes

**Files:**
- Modify: `src/routes/api/websub/[feedId]/+server.ts`

- [ ] **Step 1: Set the flag on article upsert**

In `processArticlePush`, update the article upsert:

```ts
	const [article] = await db
		.insert(articles)
		.values({ feedId: feed.id, url: finalUrl, isLiveBlog: extracted.isLiveBlog })
		.onConflictDoUpdate({
			target: articles.url,
			set: { lastCheckedAt: new Date(), ...(extracted.isLiveBlog ? { isLiveBlog: true } : {}) }
		})
		.returning();
```

- [ ] **Step 2: Add the cadence const + guard**

Near the top of the file (after the imports) add:

```ts
const LIVE_BLOG_SNAPSHOT_MS = 30 * 60 * 1000;
```

In `processArticlePush`, immediately after `if (latestVersion && latestVersion.contentHash === contentHash) return;` add:

```ts
	if (
		extracted.isLiveBlog &&
		latestVersion &&
		Date.now() - latestVersion.createdAt.getTime() < LIVE_BLOG_SNAPSHOT_MS
	) {
		return;
	}
```

- [ ] **Step 3: Pass `isLiveBlog` into `evaluateChange`**

```ts
		const change = evaluateChange(
			latestVersion.title,
			latestVersion.contentText,
			extracted.title,
			extracted.content,
			{ siteName: feed.siteName, ignoreTitleChanges: feed.ignoreTitleChanges, isLiveBlog: extracted.isLiveBlog }
		);
```

- [ ] **Step 4: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i 'websub' | grep -i error || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/websub/[feedId]/+server.ts"
git commit -m "feat(websub): live-blog flag, snapshot cadence, append-aware policy"
```

---

### Task 8: "Live blog" badge in the UI

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/article/[id]/+page.svelte`

- [ ] **Step 1: Homepage card badge**

In `src/routes/+page.svelte`, the diff cards render inside the per-article group loop where the feed name/title is shown (search for `feed.name` / `diff-card`). Where the source/feed label is rendered, add, using the group's article:

```svelte
{#if group.article.isLiveBlog}<span class="badge badge-live">Live blog</span>{/if}
```

(Drizzle returns camelCase keys, so the property is `isLiveBlog`, not `is_live_blog` — consistent with existing usage like `feed.isActive`. `group.article` is already in scope in the group loop; use the existing loop-variable name if it differs from `group` — check the `{#each ... as group}` binding.)

Add a style rule alongside the other badge styles:

```css
.badge-live { background: var(--color-del-bg); color: var(--color-del-text); border-radius: 1rem; padding: 0.1rem 0.5rem; font-size: 0.72rem; }
```

- [ ] **Step 2: Article-page badge**

In `src/routes/article/[id]/+page.svelte`, in the `<div class="meta">` block (near `{article.feed.name}`), add:

```svelte
{#if article.isLiveBlog}<span class="badge-live">Live blog</span>{/if}
```

Add a matching style if the page has a `<style>` block:

```css
.badge-live { background: var(--color-del-bg); color: var(--color-del-text); border-radius: 1rem; padding: 0.1rem 0.5rem; font-size: 0.72rem; }
```

- [ ] **Step 3: Typecheck + build the frontend**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -iE '\+page.svelte|article/\[id\]' | grep -i error || echo CLEAN`
Expected: `CLEAN` (pre-existing unrelated warnings elsewhere are fine).

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte "src/routes/article/[id]/+page.svelte"
git commit -m "feat(ui): show a Live blog badge on cards and article pages"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx vitest run`
Expected: PASS — all suites (prior 87 + new isPureAddition/evaluateChange/detectLiveBlog tests).

- [ ] **Step 2: Typecheck the whole project**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -1`
Expected: error count unchanged from baseline (34 pre-existing, unrelated to changed files). Confirm none of the changed files appear in the error list.

- [ ] **Step 3: Real-data smoke test (optional but recommended)**

Using the cached `/tmp/glive.html` (Guardian live blog) and `/tmp/gart.html` (regular), confirm `extractArticle(...).isLiveBlog` is `true` for the live blog and `false` for the regular article, and that a simulated timers-only-plus-prepend change is boring while an edit-to-past-entry is not. (Mirror the ad-hoc `repro.mts` approach used previously; delete the temp script after.)

---

## Ship (established flow — after the plan is implemented)

Not a code task, but the deploy sequence used throughout this project:

1. App is already committed per-task; push: `git push origin main` (triggers ghcr build).
2. Bump submodule: in `cloudron-newsdiff/newsdiff` checkout the new app HEAD, then in `cloudron-newsdiff` `git add newsdiff && git commit && git push`.
3. `cloudron build` (from `cloudron-newsdiff`) → Docker Hub.
4. **Requires the user to `cloudron login` to the rmendes cluster** (it reverts between sessions). Then `cloudron update --app diff.rmendes.net --image docker.io/rmdes/com.newsdiff.app:<tag>`.
5. Migration (`is_live_blog`) runs automatically on startup via `start.sh` → `migrate.ts`.
6. Verify `/health` 200; watch the Guardian feed (id 22) — live blogs should stop producing visible append diffs and gain the "Live blog" badge.

---

## Notes for the implementer

- **Node version:** always `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"` before npm/npx (the default `node` is Homebrew v25 and dirties the lockfile).
- **No new dependencies.**
- **TDD order matters:** Tasks 1→3 build differ logic bottom-up; Task 4 is independent; Task 5 must precede 6/7 (they reference the column); 8 is UI; 9 verifies.
