# NewsDiff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a modern news article diff tracker with SvelteKit web UI, BullMQ feed polling, and Bluesky/Mastodon syndication, deployed on Cloudron.

**Architecture:** Single SvelteKit app (adapter-node) with BullMQ workers running in-process. Postgres for storage, Redis for job queue. Content extracted via @mozilla/readability, diffs computed with jsdiff, social card images generated with Satori+sharp.

**Tech Stack:** SvelteKit, Drizzle ORM, BullMQ, rss-parser, @mozilla/readability, linkedom, diff (jsdiff), @atproto/api, masto, satori, sharp, vitest

---

## Phase 1: Project Scaffold

### Task 1: Initialize SvelteKit project with dependencies

**Files:**
- Create: `package.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/app.html`
- Create: `src/app.d.ts`

**Step 1: Create SvelteKit project**

```bash
cd /home/rick/code/newsdiff
npx sv create . --template minimal --types ts --no-add-ons --no-install
```

If prompted about existing files, allow overwrite of scaffold files (keep CLAUDE.md and docs/).

**Step 2: Install core dependencies**

```bash
npm install drizzle-orm postgres bullmq rss-parser @mozilla/readability linkedom diff @atproto/api masto satori sharp
```

**Step 3: Install dev dependencies**

```bash
npm install -D drizzle-kit @sveltejs/adapter-node @types/diff vitest @testing-library/svelte jsdom dotenv tsx
```

**Step 4: Configure adapter-node**

Edit `svelte.config.js`:

```javascript
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			envPrefix: ''
		})
	}
};

export default config;
```

**Step 5: Configure vitest**

Edit `vite.config.ts`:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
```

**Step 6: Add scripts to package.json**

Ensure these scripts exist in `package.json`:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "tsx src/lib/server/db/migrate.ts",
    "generate": "drizzle-kit generate",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
  }
}
```

**Step 7: Create .env file for local development**

Create `.env`:

```bash
DATABASE_URL=postgresql://localhost:5432/newsdiff
REDIS_URL=redis://localhost:6379
ORIGIN=http://localhost:5173
```

Create `.env.example` (same content but empty values).

Add `.env` to `.gitignore`.

**Step 8: Verify project builds**

```bash
npm run check
```

Expected: No errors (may have warnings about unused files, that's fine).

**Step 9: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize SvelteKit project with dependencies"
```

---

## Phase 2: Database Schema & Migrations

### Task 2: Define Drizzle schema for all tables

**Files:**
- Create: `src/lib/server/db/schema.ts`
- Create: `src/lib/server/db/index.ts`
- Create: `drizzle.config.ts`

**Step 1: Write failing test for schema types**

Create `src/lib/server/db/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { feeds, articles, versions, diffs, socialPosts } from './schema';

describe('database schema', () => {
	it('feeds table has required columns', () => {
		expect(feeds.id).toBeDefined();
		expect(feeds.name).toBeDefined();
		expect(feeds.url).toBeDefined();
		expect(feeds.siteName).toBeDefined();
		expect(feeds.checkInterval).toBeDefined();
		expect(feeds.isActive).toBeDefined();
		expect(feeds.createdAt).toBeDefined();
	});

	it('articles table has required columns', () => {
		expect(articles.id).toBeDefined();
		expect(articles.feedId).toBeDefined();
		expect(articles.url).toBeDefined();
		expect(articles.firstSeenAt).toBeDefined();
		expect(articles.lastCheckedAt).toBeDefined();
		expect(articles.lastChangedAt).toBeDefined();
		expect(articles.checkCount).toBeDefined();
	});

	it('versions table has required columns', () => {
		expect(versions.id).toBeDefined();
		expect(versions.articleId).toBeDefined();
		expect(versions.title).toBeDefined();
		expect(versions.byline).toBeDefined();
		expect(versions.contentText).toBeDefined();
		expect(versions.contentHash).toBeDefined();
		expect(versions.versionNumber).toBeDefined();
		expect(versions.createdAt).toBeDefined();
	});

	it('diffs table has required columns', () => {
		expect(diffs.id).toBeDefined();
		expect(diffs.articleId).toBeDefined();
		expect(diffs.oldVersionId).toBeDefined();
		expect(diffs.newVersionId).toBeDefined();
		expect(diffs.titleChanged).toBeDefined();
		expect(diffs.contentChanged).toBeDefined();
		expect(diffs.diffHtml).toBeDefined();
		expect(diffs.charsAdded).toBeDefined();
		expect(diffs.charsRemoved).toBeDefined();
		expect(diffs.isBoring).toBeDefined();
		expect(diffs.createdAt).toBeDefined();
	});

	it('socialPosts table has required columns', () => {
		expect(socialPosts.id).toBeDefined();
		expect(socialPosts.diffId).toBeDefined();
		expect(socialPosts.platform).toBeDefined();
		expect(socialPosts.postUri).toBeDefined();
		expect(socialPosts.threadRootUri).toBeDefined();
		expect(socialPosts.imagePath).toBeDefined();
		expect(socialPosts.postedAt).toBeDefined();
		expect(socialPosts.error).toBeDefined();
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/db/schema.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement schema**

Create `src/lib/server/db/schema.ts`:

```typescript
import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const feeds = pgTable('feeds', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	url: text('url').notNull().unique(),
	siteName: text('site_name'),
	checkInterval: integer('check_interval').notNull().default(5),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const articles = pgTable('articles', {
	id: serial('id').primaryKey(),
	feedId: integer('feed_id')
		.notNull()
		.references(() => feeds.id, { onDelete: 'cascade' }),
	url: text('url').notNull().unique(),
	firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
	lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
	lastChangedAt: timestamp('last_changed_at', { withTimezone: true }),
	checkCount: integer('check_count').notNull().default(0)
});

export const versions = pgTable('versions', {
	id: serial('id').primaryKey(),
	articleId: integer('article_id')
		.notNull()
		.references(() => articles.id, { onDelete: 'cascade' }),
	title: text('title'),
	byline: text('byline'),
	contentText: text('content_text').notNull(),
	contentHash: text('content_hash').notNull(),
	versionNumber: integer('version_number').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const diffs = pgTable('diffs', {
	id: serial('id').primaryKey(),
	articleId: integer('article_id')
		.notNull()
		.references(() => articles.id, { onDelete: 'cascade' }),
	oldVersionId: integer('old_version_id')
		.notNull()
		.references(() => versions.id, { onDelete: 'cascade' }),
	newVersionId: integer('new_version_id')
		.notNull()
		.references(() => versions.id, { onDelete: 'cascade' }),
	titleChanged: boolean('title_changed').notNull().default(false),
	contentChanged: boolean('content_changed').notNull().default(false),
	diffHtml: text('diff_html').notNull(),
	charsAdded: integer('chars_added').notNull().default(0),
	charsRemoved: integer('chars_removed').notNull().default(0),
	isBoring: boolean('is_boring').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const socialPosts = pgTable('social_posts', {
	id: serial('id').primaryKey(),
	diffId: integer('diff_id')
		.notNull()
		.references(() => diffs.id, { onDelete: 'cascade' }),
	platform: text('platform').notNull(), // 'bluesky' | 'mastodon'
	postUri: text('post_uri'),
	threadRootUri: text('thread_root_uri'),
	imagePath: text('image_path'),
	postedAt: timestamp('posted_at', { withTimezone: true }),
	error: text('error')
});

// Relations (for Drizzle relational queries)
export const feedsRelations = relations(feeds, ({ many }) => ({
	articles: many(articles)
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
	feed: one(feeds, { fields: [articles.feedId], references: [feeds.id] }),
	versions: many(versions),
	diffs: many(diffs)
}));

export const versionsRelations = relations(versions, ({ one }) => ({
	article: one(articles, { fields: [versions.articleId], references: [articles.id] })
}));

export const diffsRelations = relations(diffs, ({ one, many }) => ({
	article: one(articles, { fields: [diffs.articleId], references: [articles.id] }),
	oldVersion: one(versions, { fields: [diffs.oldVersionId], references: [versions.id], relationName: 'oldVersion' }),
	newVersion: one(versions, { fields: [diffs.newVersionId], references: [versions.id], relationName: 'newVersion' }),
	socialPosts: many(socialPosts)
}));

export const socialPostsRelations = relations(socialPosts, ({ one }) => ({
	diff: one(diffs, { fields: [socialPosts.diffId], references: [diffs.id] })
}));
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/db/schema.test.ts
```

Expected: PASS

**Step 5: Create database connection module**

Create `src/lib/server/db/index.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

**Step 6: Create Drizzle config**

Create `drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './src/lib/server/db/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!
	}
});
```

**Step 7: Create migration runner**

Create `src/lib/server/db/migrate.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function runMigrations() {
	console.log('Running migrations...');
	await migrate(db, { migrationsFolder: './src/lib/server/db/migrations' });
	console.log('Migrations complete');
	await client.end();
}

runMigrations().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
```

**Step 8: Generate initial migration**

```bash
npx drizzle-kit generate
```

Expected: Migration SQL files created in `src/lib/server/db/migrations/`.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle schema with feeds, articles, versions, diffs, social_posts"
```

---

## Phase 3: Core Services

### Task 3: Content extraction service

**Files:**
- Create: `src/lib/server/services/extractor.ts`
- Create: `src/lib/server/services/extractor.test.ts`

**Step 1: Write failing test**

Create `src/lib/server/services/extractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractArticle, normalizeText, computeHash } from './extractor';

describe('extractArticle', () => {
	it('extracts title and content from HTML', () => {
		const html = `
			<html>
			<head><title>Test Article</title></head>
			<body>
				<article>
					<h1>Test Article</h1>
					<p>By John Doe</p>
					<p>This is the first paragraph of a longer article that needs enough content for readability to consider it worth extracting. The article discusses important topics.</p>
					<p>This is the second paragraph with more substantial content. It adds detail and context to the main points raised in the first paragraph above.</p>
					<p>This is the third paragraph concluding the article with final thoughts and a summary of the key points discussed throughout.</p>
				</article>
			</body>
			</html>
		`;
		const result = extractArticle(html, 'https://example.com/article');
		expect(result).not.toBeNull();
		expect(result!.title).toBe('Test Article');
		expect(result!.content).toContain('first paragraph');
	});
});

describe('normalizeText', () => {
	it('collapses whitespace', () => {
		expect(normalizeText('hello   world\n\nfoo')).toBe('hello world\nfoo');
	});

	it('trims leading and trailing whitespace', () => {
		expect(normalizeText('  hello  ')).toBe('hello');
	});
});

describe('computeHash', () => {
	it('returns consistent SHA-256 hex digest', () => {
		const hash1 = computeHash('hello world');
		const hash2 = computeHash('hello world');
		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
	});

	it('returns different hashes for different inputs', () => {
		expect(computeHash('hello')).not.toBe(computeHash('world'));
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/services/extractor.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement extractor**

Create `src/lib/server/services/extractor.ts`:

```typescript
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { createHash } from 'node:crypto';

export interface ExtractedArticle {
	title: string;
	byline: string | null;
	content: string;
}

export function extractArticle(html: string, url: string): ExtractedArticle | null {
	const { document } = parseHTML(html);

	// Set the document URL for relative link resolution
	const base = document.createElement('base');
	base.setAttribute('href', url);
	document.head.appendChild(base);

	const reader = new Readability(document);
	const article = reader.parse();

	if (!article || !article.textContent) {
		return null;
	}

	return {
		title: article.title || '',
		byline: article.byline || null,
		content: normalizeText(article.textContent)
	};
}

export function normalizeText(text: string): string {
	return text
		.replace(/[ \t]+/g, ' ')        // collapse horizontal whitespace
		.replace(/\n{3,}/g, '\n\n')      // collapse 3+ newlines to 2
		.replace(/^ +| +$/gm, '')        // trim each line
		.trim();
}

export function computeHash(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/services/extractor.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add article content extraction service"
```

---

### Task 4: Diff computation service

**Files:**
- Create: `src/lib/server/services/differ.ts`
- Create: `src/lib/server/services/differ.test.ts`

**Step 1: Write failing test**

Create `src/lib/server/services/differ.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeDiff, isBoring } from './differ';

describe('computeDiff', () => {
	it('detects word-level changes and produces ins/del HTML', () => {
		const result = computeDiff('The quick brown fox', 'The slow brown fox');
		expect(result.html).toContain('<del>quick</del>');
		expect(result.html).toContain('<ins>slow</ins>');
		expect(result.charsAdded).toBeGreaterThan(0);
		expect(result.charsRemoved).toBeGreaterThan(0);
	});

	it('returns empty diff for identical text', () => {
		const result = computeDiff('same text', 'same text');
		expect(result.html).not.toContain('<ins>');
		expect(result.html).not.toContain('<del>');
		expect(result.charsAdded).toBe(0);
		expect(result.charsRemoved).toBe(0);
	});

	it('handles additions', () => {
		const result = computeDiff('hello', 'hello world');
		expect(result.html).toContain('<ins>');
		expect(result.charsAdded).toBeGreaterThan(0);
		expect(result.charsRemoved).toBe(0);
	});

	it('handles deletions', () => {
		const result = computeDiff('hello world', 'hello');
		expect(result.html).toContain('<del>');
		expect(result.charsRemoved).toBeGreaterThan(0);
	});
});

describe('isBoring', () => {
	it('returns true for whitespace-only changes', () => {
		expect(isBoring('hello  world', 'hello world')).toBe(true);
	});

	it('returns false for substantive changes', () => {
		expect(isBoring('The quick brown fox', 'The slow brown fox')).toBe(false);
	});

	it('returns true for identical content', () => {
		expect(isBoring('same', 'same')).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/services/differ.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement differ**

Create `src/lib/server/services/differ.ts`:

```typescript
import { diffWords } from 'diff';

export interface DiffResult {
	html: string;
	charsAdded: number;
	charsRemoved: number;
}

export function computeDiff(oldText: string, newText: string): DiffResult {
	const changes = diffWords(oldText, newText);
	let charsAdded = 0;
	let charsRemoved = 0;

	const html = changes
		.map((part) => {
			const escaped = escapeHtml(part.value);
			if (part.added) {
				charsAdded += part.value.length;
				return `<ins>${escaped}</ins>`;
			}
			if (part.removed) {
				charsRemoved += part.value.length;
				return `<del>${escaped}</del>`;
			}
			return escaped;
		})
		.join('');

	return { html, charsAdded, charsRemoved };
}

export function isBoring(oldText: string, newText: string): boolean {
	const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
	return normalize(oldText) === normalize(newText);
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/services/differ.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add diff computation service with boring detection"
```

---

### Task 5: RSS feed parser service

**Files:**
- Create: `src/lib/server/services/feed-parser.ts`
- Create: `src/lib/server/services/feed-parser.test.ts`

**Step 1: Write failing test**

Create `src/lib/server/services/feed-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFeedItems, type FeedItem } from './feed-parser';

// Minimal RSS 2.0 feed
const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>Test Feed</title>
		<link>https://example.com</link>
		<item>
			<title>Article One</title>
			<link>https://example.com/article-1</link>
			<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
		</item>
		<item>
			<title>Article Two</title>
			<link>https://example.com/article-2</link>
		</item>
	</channel>
</rss>`;

describe('parseFeedItems', () => {
	it('extracts items from RSS feed XML', async () => {
		const items = await parseFeedItems(RSS_FEED);
		expect(items).toHaveLength(2);
		expect(items[0].title).toBe('Article One');
		expect(items[0].url).toBe('https://example.com/article-1');
		expect(items[1].title).toBe('Article Two');
	});

	it('returns empty array for empty feed', async () => {
		const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
		const items = await parseFeedItems(xml);
		expect(items).toHaveLength(0);
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/services/feed-parser.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement feed parser**

Create `src/lib/server/services/feed-parser.ts`:

```typescript
import Parser from 'rss-parser';

const parser = new Parser();

export interface FeedItem {
	title: string;
	url: string;
	publishedAt: Date | null;
}

export async function parseFeedItems(xml: string): Promise<FeedItem[]> {
	const feed = await parser.parseString(xml);
	return (feed.items || [])
		.filter((item) => item.link)
		.map((item) => ({
			title: item.title || '(untitled)',
			url: item.link!,
			publishedAt: item.pubDate ? new Date(item.pubDate) : null
		}));
}

export async function fetchAndParseFeed(feedUrl: string): Promise<{ siteName: string; items: FeedItem[] }> {
	const feed = await parser.parseURL(feedUrl);
	const items = (feed.items || [])
		.filter((item) => item.link)
		.map((item) => ({
			title: item.title || '(untitled)',
			url: item.link!,
			publishedAt: item.pubDate ? new Date(item.pubDate) : null
		}));
	return {
		siteName: feed.title || '',
		items
	};
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/services/feed-parser.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add RSS feed parser service"
```

---

### Task 6: Adaptive scheduling service

**Files:**
- Create: `src/lib/server/services/scheduler.ts`
- Create: `src/lib/server/services/scheduler.test.ts`

**Step 1: Write failing test**

Create `src/lib/server/services/scheduler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldCheckArticle } from './scheduler';

describe('shouldCheckArticle', () => {
	const now = new Date('2024-06-15T12:00:00Z');

	it('always checks articles younger than 3 hours', () => {
		const firstSeen = new Date('2024-06-15T10:00:00Z'); // 2h ago
		const lastChecked = new Date('2024-06-15T11:50:00Z'); // 10min ago
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('checks 3-24h old articles every 30 minutes', () => {
		const firstSeen = new Date('2024-06-15T06:00:00Z'); // 6h ago
		const lastChecked = new Date('2024-06-15T11:25:00Z'); // 35min ago
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('skips 3-24h old articles checked less than 30 minutes ago', () => {
		const firstSeen = new Date('2024-06-15T06:00:00Z'); // 6h ago
		const lastChecked = new Date('2024-06-15T11:45:00Z'); // 15min ago
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(false);
	});

	it('checks 1-7 day old articles every 3 hours', () => {
		const firstSeen = new Date('2024-06-13T12:00:00Z'); // 2 days ago
		const lastChecked = new Date('2024-06-15T08:00:00Z'); // 4h ago
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('checks 7-30 day old articles every 12 hours', () => {
		const firstSeen = new Date('2024-06-05T12:00:00Z'); // 10 days ago
		const lastChecked = new Date('2024-06-14T22:00:00Z'); // 14h ago
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('never checks articles older than 30 days', () => {
		const firstSeen = new Date('2024-05-01T12:00:00Z'); // 45 days ago
		const lastChecked = new Date('2024-05-15T12:00:00Z'); // 31 days ago
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(false);
	});

	it('checks articles never checked before', () => {
		const firstSeen = new Date('2024-06-15T11:00:00Z');
		expect(shouldCheckArticle(firstSeen, null, now)).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/services/scheduler.test.ts
```

Expected: FAIL

**Step 3: Implement scheduler**

Create `src/lib/server/services/scheduler.ts`:

```typescript
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface CheckInterval {
	maxAge: number;
	minInterval: number;
}

const INTERVALS: CheckInterval[] = [
	{ maxAge: 3 * HOUR, minInterval: 0 },           // < 3h: every poll cycle
	{ maxAge: 24 * HOUR, minInterval: 30 * MINUTE }, // 3-24h: every 30min
	{ maxAge: 7 * DAY, minInterval: 3 * HOUR },      // 1-7d: every 3h
	{ maxAge: 30 * DAY, minInterval: 12 * HOUR }     // 7-30d: every 12h
];

export function shouldCheckArticle(
	firstSeenAt: Date,
	lastCheckedAt: Date | null,
	now: Date = new Date()
): boolean {
	if (!lastCheckedAt) return true;

	const age = now.getTime() - firstSeenAt.getTime();
	const sinceLastCheck = now.getTime() - lastCheckedAt.getTime();

	for (const interval of INTERVALS) {
		if (age < interval.maxAge) {
			return sinceLastCheck >= interval.minInterval;
		}
	}

	// Older than 30 days: stop checking
	return false;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/services/scheduler.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add adaptive article check scheduling"
```

---

## Phase 4: BullMQ Workers

### Task 7: Queue and worker infrastructure

**Files:**
- Create: `src/lib/server/workers/queues.ts`
- Create: `src/lib/server/workers/feed-poller.ts`
- Create: `src/lib/server/workers/startup.ts`

**Step 1: Create queue definitions**

Create `src/lib/server/workers/queues.ts`:

```typescript
import { Queue } from 'bullmq';
import { getRedisConnection } from './connection';

export function createQueues() {
	const connection = getRedisConnection();

	const feedPollQueue = new Queue('feed-poll', { connection });
	const syndicateQueue = new Queue('syndicate', { connection });

	return { feedPollQueue, syndicateQueue };
}
```

Create `src/lib/server/workers/connection.ts`:

```typescript
import type { ConnectionOptions } from 'bullmq';

let connectionOptions: ConnectionOptions | undefined;

export function getRedisConnection(): ConnectionOptions {
	if (connectionOptions) return connectionOptions;

	const redisUrl = process.env.REDIS_URL;
	if (!redisUrl) {
		throw new Error('REDIS_URL environment variable is required');
	}

	const url = new URL(redisUrl);
	connectionOptions = {
		host: url.hostname,
		port: Number(url.port) || 6379,
		password: url.password || undefined
	};

	return connectionOptions;
}
```

**Step 2: Create feed poller worker**

Create `src/lib/server/workers/feed-poller.ts`:

```typescript
import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from './connection';
import { db } from '../db';
import { feeds, articles, versions, diffs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { fetchAndParseFeed } from '../services/feed-parser';
import { extractArticle, computeHash } from '../services/extractor';
import { computeDiff, isBoring } from '../services/differ';
import { shouldCheckArticle } from '../services/scheduler';

export interface FeedPollJobData {
	feedId: number;
	feedUrl: string;
}

async function processArticle(articleUrl: string, feedId: number) {
	// Fetch the article HTML
	const response = await fetch(articleUrl);
	if (!response.ok) return;
	const html = await response.text();

	// Extract content
	const extracted = extractArticle(html, articleUrl);
	if (!extracted) return;

	const contentHash = computeHash(extracted.content);

	// Find or create article record
	let [article] = await db
		.select()
		.from(articles)
		.where(eq(articles.url, articleUrl))
		.limit(1);

	if (!article) {
		const [newArticle] = await db
			.insert(articles)
			.values({ feedId, url: articleUrl })
			.returning();
		article = newArticle;
	}

	// Check if content changed
	const [latestVersion] = await db
		.select()
		.from(versions)
		.where(eq(versions.articleId, article.id))
		.orderBy(versions.versionNumber)
		.limit(1);

	// Update check metadata
	await db
		.update(articles)
		.set({
			lastCheckedAt: new Date(),
			checkCount: article.checkCount + 1
		})
		.where(eq(articles.id, article.id));

	if (latestVersion && latestVersion.contentHash === contentHash) {
		return; // No change
	}

	const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

	// Store new version
	const [newVersion] = await db
		.insert(versions)
		.values({
			articleId: article.id,
			title: extracted.title,
			byline: extracted.byline,
			contentText: extracted.content,
			contentHash,
			versionNumber
		})
		.returning();

	// If this isn't the first version, compute diff
	if (latestVersion) {
		const titleChanged = latestVersion.title !== extracted.title;
		const contentChanged = latestVersion.contentHash !== contentHash;

		const titleDiff = titleChanged
			? computeDiff(latestVersion.title || '', extracted.title)
			: { html: '', charsAdded: 0, charsRemoved: 0 };
		const contentDiffResult = computeDiff(latestVersion.contentText, extracted.content);

		const fullDiffHtml = [
			titleChanged ? `<div class="diff-title">${titleDiff.html}</div>` : '',
			`<div class="diff-content">${contentDiffResult.html}</div>`
		]
			.filter(Boolean)
			.join('\n');

		const boring = isBoring(latestVersion.contentText, extracted.content) &&
			(!titleChanged || isBoring(latestVersion.title || '', extracted.title));

		await db.insert(diffs).values({
			articleId: article.id,
			oldVersionId: latestVersion.id,
			newVersionId: newVersion.id,
			titleChanged,
			contentChanged,
			diffHtml: fullDiffHtml,
			charsAdded: titleDiff.charsAdded + contentDiffResult.charsAdded,
			charsRemoved: titleDiff.charsRemoved + contentDiffResult.charsRemoved,
			isBoring: boring
		});

		// Update last changed timestamp
		await db
			.update(articles)
			.set({ lastChangedAt: new Date() })
			.where(eq(articles.id, article.id));

		// TODO: Queue syndication job if not boring
	}
}

async function pollFeed(job: Job<FeedPollJobData>) {
	const { feedId, feedUrl } = job.data;

	const { siteName, items } = await fetchAndParseFeed(feedUrl);

	// Update feed site name if we learned it
	if (siteName) {
		await db.update(feeds).set({ siteName }).where(eq(feeds.id, feedId));
	}

	for (const item of items) {
		// Check adaptive scheduling
		const [existing] = await db
			.select()
			.from(articles)
			.where(eq(articles.url, item.url))
			.limit(1);

		if (existing && !shouldCheckArticle(existing.firstSeenAt, existing.lastCheckedAt)) {
			continue;
		}

		try {
			await processArticle(item.url, feedId);
		} catch (err) {
			console.error(`Failed to process article ${item.url}:`, err);
		}
	}
}

export function createFeedPollerWorker() {
	const worker = new Worker<FeedPollJobData>('feed-poll', pollFeed, {
		connection: getRedisConnection(),
		concurrency: 2
	});

	worker.on('failed', (job, err) => {
		console.error(`Feed poll job ${job?.id} failed:`, err.message);
	});

	return worker;
}
```

**Step 3: Create worker startup module**

Create `src/lib/server/workers/startup.ts`:

```typescript
import { createQueues } from './queues';
import { createFeedPollerWorker } from './feed-poller';
import { db } from '../db';
import { feeds } from '../db/schema';
import { eq } from 'drizzle-orm';

let initialized = false;

export async function startWorkers() {
	if (initialized) return;
	initialized = true;

	const { feedPollQueue } = createQueues();
	const pollerWorker = createFeedPollerWorker();

	// Schedule repeatable poll job for each active feed
	const activeFeeds = await db.select().from(feeds).where(eq(feeds.isActive, true));

	for (const feed of activeFeeds) {
		await feedPollQueue.upsertJobScheduler(
			`poll-feed-${feed.id}`,
			{ every: feed.checkInterval * 60 * 1000 },
			{
				name: `poll-feed-${feed.id}`,
				data: { feedId: feed.id, feedUrl: feed.url }
			}
		);
	}

	console.log(`Started feed poller with ${activeFeeds.length} active feeds`);
	return { feedPollQueue, pollerWorker };
}
```

**Step 4: Wire into SvelteKit server hooks**

Create `src/hooks.server.ts`:

```typescript
import { startWorkers } from '$lib/server/workers/startup';

// Start BullMQ workers when the server starts
startWorkers().catch((err) => {
	console.error('Failed to start workers:', err);
});
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add BullMQ feed polling worker with adaptive scheduling"
```

---

## Phase 5: Web UI

### Task 8: Health check and layout

**Files:**
- Create: `src/routes/health/+server.ts`
- Create: `src/routes/+layout.svelte`
- Create: `src/app.css`

**Step 1: Create health check endpoint**

Create `src/routes/health/+server.ts`:

```typescript
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return new Response('ok', { status: 200 });
};
```

**Step 2: Create app layout with basic styling**

Create `src/app.css`:

```css
:root {
	--color-bg: #fafafa;
	--color-text: #1a1a1a;
	--color-muted: #666;
	--color-border: #e0e0e0;
	--color-ins-bg: #d4edda;
	--color-ins-text: #155724;
	--color-del-bg: #f8d7da;
	--color-del-text: #721c24;
	--color-primary: #2563eb;
	--max-width: 960px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
	background: var(--color-bg);
	color: var(--color-text);
	line-height: 1.6;
}

.container { max-width: var(--max-width); margin: 0 auto; padding: 0 1rem; }

ins {
	background: var(--color-ins-bg);
	color: var(--color-ins-text);
	text-decoration: none;
	padding: 0.1em 0.2em;
	border-radius: 2px;
}

del {
	background: var(--color-del-bg);
	color: var(--color-del-text);
	padding: 0.1em 0.2em;
	border-radius: 2px;
}
```

Create `src/routes/+layout.svelte`:

```svelte
<script>
	import '../app.css';
	let { children } = $props();
</script>

<header>
	<nav class="container">
		<a href="/" class="logo">NewsDiff</a>
		<a href="/feeds">Feeds</a>
	</nav>
</header>

<main class="container">
	{@render children()}
</main>

<style>
	header {
		border-bottom: 1px solid var(--color-border);
		padding: 1rem 0;
		margin-bottom: 2rem;
	}
	nav {
		display: flex;
		gap: 1.5rem;
		align-items: center;
	}
	.logo {
		font-weight: 700;
		font-size: 1.25rem;
		text-decoration: none;
		color: var(--color-text);
	}
	nav a {
		color: var(--color-muted);
		text-decoration: none;
	}
	nav a:hover { color: var(--color-primary); }
</style>
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add health check endpoint and app layout"
```

---

### Task 9: Dashboard page (recent diffs)

**Files:**
- Create: `src/routes/+page.server.ts`
- Create: `src/routes/+page.svelte`

**Step 1: Create dashboard server load function**

Create `src/routes/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles, versions, feeds } from '$lib/server/db/schema';
import { eq, desc, and, not } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const showBoring = url.searchParams.get('boring') === '1';
	const feedFilter = url.searchParams.get('feed');
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const perPage = 20;

	const conditions = [];
	if (!showBoring) {
		conditions.push(eq(diffs.isBoring, false));
	}

	const recentDiffs = await db.query.diffs.findMany({
		where: conditions.length ? and(...conditions) : undefined,
		with: {
			article: {
				with: { feed: true }
			},
			oldVersion: true,
			newVersion: true
		},
		orderBy: [desc(diffs.createdAt)],
		limit: perPage,
		offset: (page - 1) * perPage
	});

	const allFeeds = await db.select().from(feeds).orderBy(feeds.name);

	return {
		diffs: recentDiffs,
		feeds: allFeeds,
		page,
		showBoring
	};
};
```

**Step 2: Create dashboard page**

Create `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>NewsDiff — Recent Changes</title>
</svelte:head>

<h1>Recent Changes</h1>

<div class="filters">
	<div class="feed-tabs">
		<a href="/" class:active={!data.feeds.some(() => false)}>All</a>
		{#each data.feeds as feed}
			<a href="?feed={feed.id}">{feed.name}</a>
		{/each}
	</div>
	<label>
		<input type="checkbox" checked={data.showBoring}
			onchange={(e) => {
				const url = new URL(window.location.href);
				if (e.currentTarget.checked) url.searchParams.set('boring', '1');
				else url.searchParams.delete('boring');
				window.location.href = url.toString();
			}} />
		Show boring diffs
	</label>
</div>

{#if data.diffs.length === 0}
	<p class="empty">No diffs found. Add some feeds to start monitoring.</p>
{:else}
	<div class="diff-list">
		{#each data.diffs as diff}
			<a href="/diff/{diff.id}" class="diff-card">
				<div class="diff-meta">
					<span class="feed-name">{diff.article.feed.name}</span>
					<time>{new Date(diff.createdAt).toLocaleString()}</time>
				</div>
				<h2>{diff.newVersion.title || diff.oldVersion.title || 'Untitled'}</h2>
				<div class="badges">
					{#if diff.titleChanged}
						<span class="badge badge-title">Headline</span>
					{/if}
					{#if diff.contentChanged}
						<span class="badge badge-content">Content</span>
					{/if}
				</div>
				<div class="stats">
					+{diff.charsAdded} / -{diff.charsRemoved} chars
				</div>
			</a>
		{/each}
	</div>

	<div class="pagination">
		{#if data.page > 1}
			<a href="?page={data.page - 1}">Previous</a>
		{/if}
		{#if data.diffs.length === 20}
			<a href="?page={data.page + 1}">Next</a>
		{/if}
	</div>
{/if}

<style>
	.filters { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
	.feed-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.feed-tabs a {
		padding: 0.25rem 0.75rem; border-radius: 1rem; text-decoration: none;
		background: var(--color-border); color: var(--color-text); font-size: 0.875rem;
	}
	.feed-tabs a.active, .feed-tabs a:hover { background: var(--color-primary); color: white; }
	.diff-list { display: flex; flex-direction: column; gap: 1rem; }
	.diff-card {
		display: block; padding: 1rem; border: 1px solid var(--color-border);
		border-radius: 0.5rem; text-decoration: none; color: var(--color-text);
		background: white; transition: border-color 0.15s;
	}
	.diff-card:hover { border-color: var(--color-primary); }
	.diff-meta { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--color-muted); margin-bottom: 0.25rem; }
	h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
	.badges { display: flex; gap: 0.5rem; margin-bottom: 0.25rem; }
	.badge { font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.stats { font-size: 0.8rem; color: var(--color-muted); }
	.empty { color: var(--color-muted); padding: 3rem 0; text-align: center; }
	.pagination { display: flex; gap: 1rem; justify-content: center; margin-top: 2rem; }
	.pagination a { color: var(--color-primary); }
</style>
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add dashboard page with recent diffs"
```

---

### Task 10: Diff view page

**Files:**
- Create: `src/routes/diff/[id]/+page.server.ts`
- Create: `src/routes/diff/[id]/+page.svelte`

**Step 1: Create diff page server load**

Create `src/routes/diff/[id]/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diffs } from '$lib/server/db/schema';
import { eq, and, lt, gt } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) throw error(404, 'Not found');

	const diff = await db.query.diffs.findFirst({
		where: eq(diffs.id, id),
		with: {
			article: {
				with: { feed: true }
			},
			oldVersion: true,
			newVersion: true
		}
	});

	if (!diff) throw error(404, 'Diff not found');

	// Previous and next diffs for the same article
	const prevDiff = await db.query.diffs.findFirst({
		where: and(eq(diffs.articleId, diff.articleId), lt(diffs.id, id)),
		orderBy: (d, { desc }) => [desc(d.id)]
	});

	const nextDiff = await db.query.diffs.findFirst({
		where: and(eq(diffs.articleId, diff.articleId), gt(diffs.id, id)),
		orderBy: (d, { asc }) => [asc(d.id)]
	});

	return {
		diff,
		prevDiffId: prevDiff?.id ?? null,
		nextDiffId: nextDiff?.id ?? null
	};
};
```

**Step 2: Create diff page component**

Create `src/routes/diff/[id]/+page.svelte`:

```svelte
<script lang="ts">
	let { data } = $props();
	const { diff, prevDiffId, nextDiffId } = data;
</script>

<svelte:head>
	<title>Diff: {diff.newVersion.title || 'Untitled'} — NewsDiff</title>
	<meta property="og:title" content="Article changed: {diff.newVersion.title}" />
	<meta property="og:image" content="/diff/{diff.id}.png" />
</svelte:head>

<article class="diff-view">
	<header>
		<a href="/feed/{diff.article.feed.id}" class="feed-link">{diff.article.feed.name}</a>
		<h1>{diff.newVersion.title || diff.oldVersion.title || 'Untitled'}</h1>
		<div class="meta">
			<a href={diff.article.url} target="_blank" rel="noopener">Original article</a>
			<span>Version {diff.oldVersion.versionNumber} → {diff.newVersion.versionNumber}</span>
			<time>{new Date(diff.createdAt).toLocaleString()}</time>
		</div>
		<div class="badges">
			{#if diff.titleChanged}<span class="badge badge-title">Headline changed</span>{/if}
			{#if diff.contentChanged}<span class="badge badge-content">Content changed</span>{/if}
			{#if diff.isBoring}<span class="badge badge-boring">Boring</span>{/if}
		</div>
	</header>

	{#if diff.titleChanged}
		<section class="diff-section">
			<h2>Title</h2>
			<div class="diff-body">{@html diff.diffHtml.match(/<div class="diff-title">(.*?)<\/div>/s)?.[1] || ''}</div>
		</section>
	{/if}

	<section class="diff-section">
		<h2>Content</h2>
		<div class="diff-body">{@html diff.diffHtml.match(/<div class="diff-content">(.*?)<\/div>/s)?.[1] || diff.diffHtml}</div>
	</section>

	<nav class="diff-nav">
		{#if prevDiffId}
			<a href="/diff/{prevDiffId}">← Previous diff</a>
		{:else}
			<span></span>
		{/if}
		<a href="/article/{diff.article.id}">All versions</a>
		{#if nextDiffId}
			<a href="/diff/{nextDiffId}">Next diff →</a>
		{:else}
			<span></span>
		{/if}
	</nav>
</article>

<style>
	.diff-view { max-width: 720px; }
	header { margin-bottom: 2rem; }
	.feed-link { font-size: 0.8rem; color: var(--color-muted); text-decoration: none; }
	.feed-link:hover { color: var(--color-primary); }
	h1 { font-size: 1.5rem; margin: 0.5rem 0; }
	.meta { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--color-muted); flex-wrap: wrap; }
	.meta a { color: var(--color-primary); }
	.badges { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.badge { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.badge-boring { background: #e2e8f0; color: #475569; }
	.diff-section { margin-bottom: 2rem; }
	.diff-section h2 { font-size: 1rem; color: var(--color-muted); margin-bottom: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.25rem; }
	.diff-body { line-height: 1.8; white-space: pre-wrap; word-wrap: break-word; }
	.diff-nav { display: flex; justify-content: space-between; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
	.diff-nav a { color: var(--color-primary); text-decoration: none; }
</style>
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add diff view page with navigation"
```

---

### Task 11: Feed management page

**Files:**
- Create: `src/routes/feeds/+page.server.ts`
- Create: `src/routes/feeds/+page.svelte`

**Step 1: Create feeds page with form actions**

Create `src/routes/feeds/+page.server.ts`:

```typescript
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { feeds } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	const allFeeds = await db.select().from(feeds).orderBy(feeds.createdAt);
	return { feeds: allFeeds };
};

export const actions = {
	add: async ({ request }) => {
		const data = await request.formData();
		const url = data.get('url')?.toString().trim();
		const name = data.get('name')?.toString().trim();

		if (!url || !name) {
			return fail(400, { error: 'URL and name are required' });
		}

		try {
			new URL(url); // validate URL
		} catch {
			return fail(400, { error: 'Invalid URL' });
		}

		const existing = await db.select().from(feeds).where(eq(feeds.url, url)).limit(1);
		if (existing.length > 0) {
			return fail(400, { error: 'Feed already exists' });
		}

		await db.insert(feeds).values({ url, name });
		return { success: true };
	},

	toggle: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const isActive = data.get('isActive') === 'true';

		await db.update(feeds).set({ isActive }).where(eq(feeds.id, id));
		return { success: true };
	},

	remove: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));

		await db.delete(feeds).where(eq(feeds.id, id));
		return { success: true };
	}
} satisfies Actions;
```

**Step 2: Create feeds page component**

Create `src/routes/feeds/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Manage Feeds — NewsDiff</title>
</svelte:head>

<h1>Manage Feeds</h1>

<form method="POST" action="?/add" use:enhance class="add-form">
	<input type="text" name="name" placeholder="Feed name" required />
	<input type="url" name="url" placeholder="https://example.com/rss" required />
	<button type="submit">Add Feed</button>
</form>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if data.feeds.length === 0}
	<p class="empty">No feeds yet. Add one above to start monitoring.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>URL</th>
				<th>Interval</th>
				<th>Active</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.feeds as feed}
				<tr>
					<td>{feed.name}</td>
					<td class="url">{feed.url}</td>
					<td>{feed.checkInterval}min</td>
					<td>
						<form method="POST" action="?/toggle" use:enhance>
							<input type="hidden" name="id" value={feed.id} />
							<input type="hidden" name="isActive" value={!feed.isActive} />
							<button type="submit" class="toggle" class:active={feed.isActive}>
								{feed.isActive ? 'Active' : 'Paused'}
							</button>
						</form>
					</td>
					<td>
						<form method="POST" action="?/remove" use:enhance
							onsubmit={(e) => { if (!confirm('Remove this feed and all its data?')) e.preventDefault(); }}>
							<input type="hidden" name="id" value={feed.id} />
							<button type="submit" class="remove">Remove</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.add-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
	.add-form input { flex: 1; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.25rem; }
	.add-form button { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.25rem; cursor: pointer; }
	.error { color: var(--color-del-text); background: var(--color-del-bg); padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 1rem; }
	table { width: 100%; border-collapse: collapse; }
	th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
	th { font-size: 0.8rem; color: var(--color-muted); text-transform: uppercase; }
	.url { font-size: 0.85rem; color: var(--color-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.toggle { background: none; border: 1px solid var(--color-border); padding: 0.2rem 0.5rem; border-radius: 1rem; cursor: pointer; font-size: 0.8rem; }
	.toggle.active { background: var(--color-ins-bg); color: var(--color-ins-text); border-color: var(--color-ins-text); }
	.remove { background: none; border: none; color: var(--color-del-text); cursor: pointer; font-size: 0.8rem; }
	.empty { color: var(--color-muted); padding: 3rem 0; text-align: center; }
</style>
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add feed management page with add/toggle/remove"
```

---

### Task 12: Article history page

**Files:**
- Create: `src/routes/article/[id]/+page.server.ts`
- Create: `src/routes/article/[id]/+page.svelte`

**Step 1: Create article history server load**

Create `src/routes/article/[id]/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { articles, versions, diffs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) throw error(404, 'Not found');

	const article = await db.query.articles.findFirst({
		where: eq(articles.id, id),
		with: {
			feed: true,
			versions: { orderBy: [desc(versions.versionNumber)] },
			diffs: {
				orderBy: [desc(diffs.createdAt)],
				with: { oldVersion: true, newVersion: true }
			}
		}
	});

	if (!article) throw error(404, 'Article not found');

	return { article };
};
```

**Step 2: Create article history page component**

Create `src/routes/article/[id]/+page.svelte`:

```svelte
<script lang="ts">
	let { data } = $props();
	const { article } = data;
</script>

<svelte:head>
	<title>{article.versions[0]?.title || 'Article'} — NewsDiff</title>
</svelte:head>

<h1>{article.versions[0]?.title || 'Untitled Article'}</h1>
<div class="meta">
	<a href={article.url} target="_blank" rel="noopener">{article.url}</a>
	<span>{article.feed.name}</span>
	<span>{article.versions.length} version{article.versions.length !== 1 ? 's' : ''}</span>
</div>

{#if article.diffs.length > 0}
	<h2>Changes</h2>
	<div class="diff-list">
		{#each article.diffs as diff}
			<a href="/diff/{diff.id}" class="diff-card">
				<time>{new Date(diff.createdAt).toLocaleString()}</time>
				<span>v{diff.oldVersion.versionNumber} → v{diff.newVersion.versionNumber}</span>
				<div class="badges">
					{#if diff.titleChanged}<span class="badge badge-title">Headline</span>{/if}
					{#if diff.contentChanged}<span class="badge badge-content">Content</span>{/if}
					{#if diff.isBoring}<span class="badge badge-boring">Boring</span>{/if}
				</div>
				<span class="stats">+{diff.charsAdded} / -{diff.charsRemoved}</span>
			</a>
		{/each}
	</div>
{:else}
	<p class="empty">No changes detected yet.</p>
{/if}

<style>
	.meta { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--color-muted); margin-bottom: 2rem; flex-wrap: wrap; }
	.meta a { color: var(--color-primary); word-break: break-all; }
	h2 { font-size: 1.1rem; margin-bottom: 1rem; }
	.diff-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.diff-card {
		display: flex; align-items: center; gap: 1rem; padding: 0.75rem;
		border: 1px solid var(--color-border); border-radius: 0.25rem;
		text-decoration: none; color: var(--color-text); background: white;
	}
	.diff-card:hover { border-color: var(--color-primary); }
	time { font-size: 0.8rem; color: var(--color-muted); min-width: 160px; }
	.badges { display: flex; gap: 0.25rem; }
	.badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.badge-boring { background: #e2e8f0; color: #475569; }
	.stats { font-size: 0.8rem; color: var(--color-muted); margin-left: auto; }
	.empty { color: var(--color-muted); padding: 2rem 0; }
</style>
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add article history page"
```

---

## Phase 6: Social Syndication

### Task 13: Diff card image generation (Satori + sharp)

**Files:**
- Create: `src/lib/server/services/card-generator.ts`
- Create: `src/lib/server/services/card-generator.test.ts`

**Step 1: Write failing test**

Create `src/lib/server/services/card-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateDiffCard } from './card-generator';

describe('generateDiffCard', () => {
	it('returns a PNG buffer', async () => {
		const png = await generateDiffCard({
			feedName: 'NYT',
			articleTitle: 'Test Article',
			titleChanged: true,
			contentChanged: false,
			charsAdded: 42,
			charsRemoved: 10,
			oldTitle: 'Old Title',
			newTitle: 'New Title'
		});
		expect(png).toBeInstanceOf(Buffer);
		// PNG magic bytes
		expect(png[0]).toBe(0x89);
		expect(png[1]).toBe(0x50); // P
		expect(png[2]).toBe(0x4e); // N
		expect(png[3]).toBe(0x47); // G
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/services/card-generator.test.ts
```

Expected: FAIL

**Step 3: Implement card generator**

Create `src/lib/server/services/card-generator.ts`:

```typescript
import satori from 'satori';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DiffCardData {
	feedName: string;
	articleTitle: string;
	titleChanged: boolean;
	contentChanged: boolean;
	charsAdded: number;
	charsRemoved: number;
	oldTitle?: string;
	newTitle?: string;
}

export async function generateDiffCard(data: DiffCardData): Promise<Buffer> {
	const changeType = data.titleChanged && data.contentChanged
		? 'Headline & Content changed'
		: data.titleChanged
			? 'Headline changed'
			: 'Content changed';

	const svg = await satori(
		{
			type: 'div',
			props: {
				style: {
					display: 'flex',
					flexDirection: 'column',
					width: '100%',
					height: '100%',
					backgroundColor: '#fafafa',
					padding: '40px',
					fontFamily: 'sans-serif'
				},
				children: [
					{
						type: 'div',
						props: {
							style: { fontSize: '18px', color: '#666', marginBottom: '12px' },
							children: `${data.feedName} — NewsDiff`
						}
					},
					{
						type: 'div',
						props: {
							style: { fontSize: '28px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '20px', lineHeight: 1.3 },
							children: data.articleTitle
						}
					},
					{
						type: 'div',
						props: {
							style: {
								display: 'flex',
								gap: '8px',
								marginBottom: '20px'
							},
							children: [
								{
									type: 'div',
									props: {
										style: {
											padding: '4px 12px',
											borderRadius: '999px',
											fontSize: '14px',
											fontWeight: '600',
											backgroundColor: data.titleChanged ? '#f8d7da' : '#d4edda',
											color: data.titleChanged ? '#721c24' : '#155724'
										},
										children: changeType
									}
								}
							]
						}
					},
					...(data.titleChanged && data.oldTitle && data.newTitle
						? [
							{
								type: 'div',
								props: {
									style: { fontSize: '16px', color: '#721c24', textDecoration: 'line-through', marginBottom: '8px' },
									children: data.oldTitle
								}
							},
							{
								type: 'div',
								props: {
									style: { fontSize: '16px', color: '#155724', fontWeight: 'bold' },
									children: data.newTitle
								}
							}
						]
						: []),
					{
						type: 'div',
						props: {
							style: { marginTop: 'auto', fontSize: '14px', color: '#666' },
							children: `+${data.charsAdded} / -${data.charsRemoved} characters`
						}
					}
				]
			}
		},
		{
			width: 800,
			height: 418, // ~1.91:1 ratio for social cards
			fonts: []    // Uses system sans-serif fallback
		}
	);

	return await sharp(Buffer.from(svg)).png().toBuffer();
}

export function generateAltText(data: DiffCardData): string {
	if (data.titleChanged && data.oldTitle && data.newTitle) {
		return `Before: ${data.oldTitle}\nAfter: ${data.newTitle}`;
	}
	return `Article content changed: ${data.charsAdded} characters added, ${data.charsRemoved} characters removed`;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/services/card-generator.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Satori-based diff card image generation"
```

---

### Task 14: Bluesky syndication service

**Files:**
- Create: `src/lib/server/services/bluesky.ts`
- Create: `src/lib/server/services/bluesky.test.ts`

**Step 1: Write failing test (mock-based)**

Create `src/lib/server/services/bluesky.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildBlueskyPost, isBlueskyConfigured } from './bluesky';

describe('isBlueskyConfigured', () => {
	it('returns false when env vars are empty', () => {
		expect(isBlueskyConfigured('', '')).toBe(false);
	});

	it('returns true when both env vars are set', () => {
		expect(isBlueskyConfigured('user.bsky.social', 'pass')).toBe(true);
	});
});

describe('buildBlueskyPost', () => {
	it('builds a root post with article link', () => {
		const post = buildBlueskyPost({
			isRoot: true,
			articleUrl: 'https://example.com/article',
			articleTitle: 'Test Article',
			feedName: 'NYT'
		});
		expect(post.text).toContain('Test Article');
		expect(post.text).toContain('example.com');
	});

	it('builds a reply post describing the change', () => {
		const post = buildBlueskyPost({
			isRoot: false,
			articleUrl: 'https://example.com/article',
			articleTitle: 'Test',
			feedName: 'NYT',
			titleChanged: true,
			contentChanged: false,
			charsAdded: 50,
			charsRemoved: 20
		});
		expect(post.text).toContain('Headline changed');
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/services/bluesky.test.ts
```

Expected: FAIL

**Step 3: Implement Bluesky service**

Create `src/lib/server/services/bluesky.ts`:

```typescript
import { BskyAgent, RichText } from '@atproto/api';

export function isBlueskyConfigured(handle?: string, password?: string): boolean {
	return Boolean(handle && password);
}

interface PostInput {
	isRoot: boolean;
	articleUrl: string;
	articleTitle: string;
	feedName: string;
	titleChanged?: boolean;
	contentChanged?: boolean;
	charsAdded?: number;
	charsRemoved?: number;
}

export function buildBlueskyPost(input: PostInput): { text: string } {
	if (input.isRoot) {
		return {
			text: `Tracking: ${input.articleTitle}\n\n${input.articleUrl}`
		};
	}

	const changes: string[] = [];
	if (input.titleChanged) changes.push('Headline changed');
	if (input.contentChanged) changes.push('Content changed');

	const changeDesc = changes.join(' & ') || 'Article updated';
	const stats = `+${input.charsAdded ?? 0} / -${input.charsRemoved ?? 0} chars`;

	return {
		text: `${changeDesc} in "${input.articleTitle}" (${input.feedName})\n${stats}\n\n${input.articleUrl}`
	};
}

export async function postToBluesky(params: {
	handle: string;
	password: string;
	text: string;
	imageBuffer?: Buffer;
	imageAltText?: string;
	replyTo?: { uri: string; cid: string };
	rootRef?: { uri: string; cid: string };
}): Promise<{ uri: string; cid: string }> {
	const agent = new BskyAgent({ service: 'https://bsky.social' });
	await agent.login({ identifier: params.handle, password: params.password });

	const rt = new RichText({ text: params.text });
	await rt.detectFacets(agent);

	let embed: any = undefined;
	if (params.imageBuffer) {
		const upload = await agent.uploadBlob(params.imageBuffer, { encoding: 'image/png' });
		embed = {
			$type: 'app.bsky.embed.images',
			images: [
				{
					alt: params.imageAltText || '',
					image: upload.data.blob,
					aspectRatio: { width: 800, height: 418 }
				}
			]
		};
	}

	let reply: any = undefined;
	if (params.replyTo && params.rootRef) {
		reply = {
			root: { uri: params.rootRef.uri, cid: params.rootRef.cid },
			parent: { uri: params.replyTo.uri, cid: params.replyTo.cid }
		};
	}

	const response = await agent.post({
		text: rt.text,
		facets: rt.facets,
		embed,
		reply
	});

	return { uri: response.uri, cid: response.cid };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/services/bluesky.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Bluesky syndication service"
```

---

### Task 15: Mastodon syndication service

**Files:**
- Create: `src/lib/server/services/mastodon.ts`
- Create: `src/lib/server/services/mastodon.test.ts`

**Step 1: Write failing test**

Create `src/lib/server/services/mastodon.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isMastodonConfigured, buildMastodonStatus } from './mastodon';

describe('isMastodonConfigured', () => {
	it('returns false when env vars are empty', () => {
		expect(isMastodonConfigured('', '')).toBe(false);
	});

	it('returns true when both are set', () => {
		expect(isMastodonConfigured('https://mastodon.social', 'token')).toBe(true);
	});
});

describe('buildMastodonStatus', () => {
	it('builds a root status with article link', () => {
		const status = buildMastodonStatus({
			isRoot: true,
			articleUrl: 'https://example.com/article',
			articleTitle: 'Test Article',
			feedName: 'NYT'
		});
		expect(status).toContain('Test Article');
		expect(status).toContain('https://example.com/article');
	});

	it('builds a reply status describing changes', () => {
		const status = buildMastodonStatus({
			isRoot: false,
			articleUrl: 'https://example.com/article',
			articleTitle: 'Test',
			feedName: 'NYT',
			titleChanged: true,
			contentChanged: true,
			charsAdded: 100,
			charsRemoved: 50
		});
		expect(status).toContain('Headline');
		expect(status).toContain('Content');
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/services/mastodon.test.ts
```

Expected: FAIL

**Step 3: Implement Mastodon service**

Create `src/lib/server/services/mastodon.ts`:

```typescript
import { createRestAPIClient } from 'masto';

export function isMastodonConfigured(instance?: string, token?: string): boolean {
	return Boolean(instance && token);
}

interface StatusInput {
	isRoot: boolean;
	articleUrl: string;
	articleTitle: string;
	feedName: string;
	titleChanged?: boolean;
	contentChanged?: boolean;
	charsAdded?: number;
	charsRemoved?: number;
}

export function buildMastodonStatus(input: StatusInput): string {
	if (input.isRoot) {
		return `Tracking: ${input.articleTitle}\n\n${input.articleUrl}`;
	}

	const changes: string[] = [];
	if (input.titleChanged) changes.push('Headline changed');
	if (input.contentChanged) changes.push('Content changed');

	const changeDesc = changes.join(' & ') || 'Article updated';
	const stats = `+${input.charsAdded ?? 0} / -${input.charsRemoved ?? 0} chars`;

	return `${changeDesc} in "${input.articleTitle}" (${input.feedName})\n${stats}\n\n${input.articleUrl}`;
}

export async function postToMastodon(params: {
	instance: string;
	accessToken: string;
	status: string;
	imageBuffer?: Buffer;
	imageAltText?: string;
	inReplyToId?: string;
}): Promise<{ id: string; url: string }> {
	const client = createRestAPIClient({
		url: params.instance,
		accessToken: params.accessToken
	});

	let mediaIds: string[] = [];
	if (params.imageBuffer) {
		const blob = new Blob([params.imageBuffer], { type: 'image/png' });
		const file = new File([blob], 'diff.png', { type: 'image/png' });
		const media = await client.v2.media.create({
			file,
			description: params.imageAltText || ''
		});
		mediaIds = [media.id];
	}

	const post = await client.v1.statuses.create({
		status: params.status,
		mediaIds,
		inReplyToId: params.inReplyToId,
		visibility: 'public'
	});

	return { id: post.id, url: post.url || '' };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/services/mastodon.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Mastodon syndication service"
```

---

### Task 16: Syndication worker (BullMQ)

**Files:**
- Create: `src/lib/server/workers/syndicator.ts`
- Modify: `src/lib/server/workers/startup.ts`
- Modify: `src/lib/server/workers/feed-poller.ts` (queue syndication job)

**Step 1: Create syndicator worker**

Create `src/lib/server/workers/syndicator.ts`:

```typescript
import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from './connection';
import { db } from '../db';
import { diffs, socialPosts, versions, articles, feeds } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateDiffCard, generateAltText } from '../services/card-generator';
import { postToBluesky, buildBlueskyPost, isBlueskyConfigured } from '../services/bluesky';
import { postToMastodon, buildMastodonStatus, isMastodonConfigured } from '../services/mastodon';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface SyndicateJobData {
	diffId: number;
}

const IMAGE_DIR = process.env.IMAGE_DIR || './images';

async function syndicate(job: Job<SyndicateJobData>) {
	const diff = await db.query.diffs.findFirst({
		where: eq(diffs.id, job.data.diffId),
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		}
	});

	if (!diff || diff.isBoring) return;

	// Generate diff card image
	const cardData = {
		feedName: diff.article.feed.name,
		articleTitle: diff.newVersion.title || diff.oldVersion.title || 'Untitled',
		titleChanged: diff.titleChanged,
		contentChanged: diff.contentChanged,
		charsAdded: diff.charsAdded,
		charsRemoved: diff.charsRemoved,
		oldTitle: diff.titleChanged ? (diff.oldVersion.title || undefined) : undefined,
		newTitle: diff.titleChanged ? (diff.newVersion.title || undefined) : undefined
	};

	const imageBuffer = await generateDiffCard(cardData);
	const altText = generateAltText(cardData);

	await mkdir(IMAGE_DIR, { recursive: true });
	const imagePath = join(IMAGE_DIR, `diff-${diff.id}.png`);
	await writeFile(imagePath, imageBuffer);

	// Find existing thread references for this article
	const existingPosts = await db
		.select()
		.from(socialPosts)
		.innerJoin(diffs, eq(socialPosts.diffId, diffs.id))
		.where(eq(diffs.articleId, diff.articleId))
		.orderBy(socialPosts.postedAt);

	// Bluesky
	const bskyHandle = process.env.BLUESKY_HANDLE;
	const bskyPassword = process.env.BLUESKY_PASSWORD;

	if (isBlueskyConfigured(bskyHandle, bskyPassword)) {
		try {
			const bskyThread = existingPosts.find(
				(p) => p.social_posts.platform === 'bluesky' && p.social_posts.threadRootUri
			);

			let rootRef: { uri: string; cid: string } | undefined;
			let parentRef: { uri: string; cid: string } | undefined;

			if (!bskyThread) {
				// Create root post first
				const rootPost = buildBlueskyPost({
					isRoot: true,
					articleUrl: diff.article.url,
					articleTitle: cardData.articleTitle,
					feedName: diff.article.feed.name
				});
				const root = await postToBluesky({
					handle: bskyHandle!,
					password: bskyPassword!,
					text: rootPost.text
				});
				rootRef = root;
				parentRef = root;
			} else {
				// Find the most recent bluesky post for this article
				const latest = existingPosts
					.filter((p) => p.social_posts.platform === 'bluesky')
					.pop();
				if (latest?.social_posts.postUri) {
					const [uri, cid] = latest.social_posts.postUri.split('|');
					const [rootUri, rootCid] = (latest.social_posts.threadRootUri || '').split('|');
					parentRef = { uri, cid };
					rootRef = { uri: rootUri, cid: rootCid };
				}
			}

			const replyPost = buildBlueskyPost({
				isRoot: false,
				articleUrl: diff.article.url,
				articleTitle: cardData.articleTitle,
				feedName: diff.article.feed.name,
				titleChanged: diff.titleChanged,
				contentChanged: diff.contentChanged,
				charsAdded: diff.charsAdded,
				charsRemoved: diff.charsRemoved
			});

			const result = await postToBluesky({
				handle: bskyHandle!,
				password: bskyPassword!,
				text: replyPost.text,
				imageBuffer,
				imageAltText: altText,
				replyTo: parentRef,
				rootRef
			});

			await db.insert(socialPosts).values({
				diffId: diff.id,
				platform: 'bluesky',
				postUri: `${result.uri}|${result.cid}`,
				threadRootUri: rootRef ? `${rootRef.uri}|${rootRef.cid}` : `${result.uri}|${result.cid}`,
				imagePath,
				postedAt: new Date()
			});
		} catch (err: any) {
			await db.insert(socialPosts).values({
				diffId: diff.id,
				platform: 'bluesky',
				imagePath,
				error: err.message
			});
		}
	}

	// Mastodon
	const mastoInstance = process.env.MASTODON_INSTANCE;
	const mastoToken = process.env.MASTODON_ACCESS_TOKEN;

	if (isMastodonConfigured(mastoInstance, mastoToken)) {
		try {
			const mastoThread = existingPosts.find(
				(p) => p.social_posts.platform === 'mastodon' && p.social_posts.threadRootUri
			);

			let replyToId: string | undefined;
			let threadRootId: string | undefined;

			if (!mastoThread) {
				const rootStatus = buildMastodonStatus({
					isRoot: true,
					articleUrl: diff.article.url,
					articleTitle: cardData.articleTitle,
					feedName: diff.article.feed.name
				});
				const root = await postToMastodon({
					instance: mastoInstance!,
					accessToken: mastoToken!,
					status: rootStatus
				});
				replyToId = root.id;
				threadRootId = root.id;
			} else {
				const latest = existingPosts
					.filter((p) => p.social_posts.platform === 'mastodon')
					.pop();
				replyToId = latest?.social_posts.postUri || undefined;
				threadRootId = latest?.social_posts.threadRootUri || undefined;
			}

			const replyStatus = buildMastodonStatus({
				isRoot: false,
				articleUrl: diff.article.url,
				articleTitle: cardData.articleTitle,
				feedName: diff.article.feed.name,
				titleChanged: diff.titleChanged,
				contentChanged: diff.contentChanged,
				charsAdded: diff.charsAdded,
				charsRemoved: diff.charsRemoved
			});

			const result = await postToMastodon({
				instance: mastoInstance!,
				accessToken: mastoToken!,
				status: replyStatus,
				imageBuffer,
				imageAltText: altText,
				inReplyToId: replyToId
			});

			await db.insert(socialPosts).values({
				diffId: diff.id,
				platform: 'mastodon',
				postUri: result.id,
				threadRootUri: threadRootId || result.id,
				imagePath,
				postedAt: new Date()
			});
		} catch (err: any) {
			await db.insert(socialPosts).values({
				diffId: diff.id,
				platform: 'mastodon',
				imagePath,
				error: err.message
			});
		}
	}
}

export function createSyndicatorWorker() {
	const worker = new Worker<SyndicateJobData>('syndicate', syndicate, {
		connection: getRedisConnection(),
		concurrency: 1
	});

	worker.on('failed', (job, err) => {
		console.error(`Syndication job ${job?.id} failed:`, err.message);
	});

	return worker;
}
```

**Step 2: Update feed-poller to queue syndication jobs**

In `src/lib/server/workers/feed-poller.ts`, replace the `// TODO: Queue syndication job if not boring` comment with:

```typescript
		if (!boring) {
			const { syndicateQueue } = await import('./queues').then(m => m.createQueues());
			await syndicateQueue.add(`syndicate-diff-${diff.id}`, { diffId: diff.id }, {
				attempts: 3,
				backoff: { type: 'exponential', delay: 5000 }
			});
		}
```

Note: The `diff` variable needs to be captured from the insert. Update the `db.insert(diffs).values(...)` call to use `.returning()`:

```typescript
		const [diff] = await db.insert(diffs).values({...}).returning();
```

**Step 3: Update startup to include syndicator**

In `src/lib/server/workers/startup.ts`, add:

```typescript
import { createSyndicatorWorker } from './syndicator';
```

And inside `startWorkers()`, after `createFeedPollerWorker()`:

```typescript
	const syndicatorWorker = createSyndicatorWorker();
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add social syndication worker for Bluesky and Mastodon"
```

---

## Phase 7: Cloudron Deployment

### Task 17: Cloudron packaging files

**Files:**
- Create: `CloudronManifest.json`
- Create: `Dockerfile`
- Create: `start.sh`
- Create: `env.sh.template`
- Create: `.dockerignore`

**Step 1: Create CloudronManifest.json**

```json
{
	"id": "com.newsdiff.app",
	"title": "NewsDiff",
	"author": "NewsDiff",
	"description": "Monitor RSS feeds for article changes and display visual diffs",
	"tagline": "News article diff tracker",
	"version": "0.1.0",
	"httpPort": 3000,
	"healthCheckPath": "/health",
	"addons": {
		"localstorage": {},
		"postgresql": {},
		"redis": {}
	},
	"manifestVersion": 2,
	"minBoxVersion": "7.6.0",
	"memoryLimit": 536870912
}
```

**Step 2: Create Dockerfile**

```dockerfile
FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c

RUN mkdir -p /app/code /app/pkg
WORKDIR /app/code

# Install Node.js 22
ARG NODE_VERSION=22.22.0
RUN mkdir -p /usr/local/node-$NODE_VERSION && \
    curl -L https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz | \
    tar zxf - --strip-components 1 -C /usr/local/node-$NODE_VERSION
ENV PATH="/usr/local/node-$NODE_VERSION/bin:$PATH"

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

ENV NODE_ENV=production

# Symlink writable paths (dangling during build, valid at runtime)
RUN rm -rf /app/code/images && ln -s /app/data/images /app/code/images

# Copy packaging files
COPY start.sh env.sh.template /app/pkg/

CMD ["/app/pkg/start.sh"]
```

**Step 3: Create start.sh**

```bash
#!/bin/bash
set -eu

echo "==> Ensure directories"
mkdir -p /app/data/config /app/data/images

# First-run: create env.sh template for user secrets
if [[ ! -f /app/data/config/env.sh ]]; then
    echo "==> Creating env.sh for social media credentials"
    cp /app/pkg/env.sh.template /app/data/config/env.sh
fi

# Source user secrets
source /app/data/config/env.sh

# Map Cloudron environment variables
export DATABASE_URL="postgresql://${CLOUDRON_POSTGRESQL_USERNAME}:${CLOUDRON_POSTGRESQL_PASSWORD}@${CLOUDRON_POSTGRESQL_HOST}:${CLOUDRON_POSTGRESQL_PORT}/${CLOUDRON_POSTGRESQL_DATABASE}"
export REDIS_URL="redis://:${CLOUDRON_REDIS_PASSWORD}@${CLOUDRON_REDIS_HOST}:${CLOUDRON_REDIS_PORT}"
export ORIGIN="${CLOUDRON_APP_ORIGIN}"
export PORT=3000
export IMAGE_DIR=/app/data/images

# Run database migrations (always, idempotent)
echo "==> Running database migrations"
gosu cloudron:cloudron node /app/code/build/migrate.js

echo "==> Setting permissions"
chown -R cloudron:cloudron /app/data

echo "==> Starting NewsDiff"
exec gosu cloudron:cloudron node /app/code/build/index.js
```

**Step 4: Create env.sh.template**

```bash
# NewsDiff — Social Media Credentials
# Edit this file and restart the app to enable social syndication.
# All settings are optional — the app works without them.

# Bluesky (get app password from Settings > App Passwords)
export BLUESKY_HANDLE=""
export BLUESKY_PASSWORD=""

# Mastodon (get access token from Settings > Development > Applications)
export MASTODON_INSTANCE=""
export MASTODON_ACCESS_TOKEN=""
```

**Step 5: Create .dockerignore**

```
node_modules
.env
.git
docs
newsdiffs
diffengine
NYTdiff
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Cloudron deployment packaging"
```

---

### Task 18: Custom server entry point with worker startup

**Files:**
- Create: `src/server.ts`
- Modify: `package.json` (update build script)

SvelteKit's adapter-node exports a `handler` that we wrap in a custom Express server (per the official docs) to start BullMQ workers alongside the HTTP server.

**Step 1: Create custom server**

Create `src/server.ts`:

```typescript
import { handler } from './build/handler.js';
import express from 'express';
import { startWorkers } from './lib/server/workers/startup.js';

const app = express();
const port = Number(process.env.PORT) || 3000;

// Health check before SvelteKit handler
app.get('/health', (_req, res) => res.end('ok'));

// SvelteKit handles everything else
app.use(handler);

app.listen(port, () => {
	console.log(`NewsDiff listening on port ${port}`);

	// Start BullMQ workers after server is listening
	startWorkers().catch((err) => {
		console.error('Failed to start workers:', err);
	});
});
```

Note: This file runs AFTER `vite build` — it imports from `./build/handler.js`. It needs to be compiled separately or run as a post-build step. The simpler approach is to use `hooks.server.ts` for worker startup (already done in Task 7) and skip the custom server. If the custom server approach is preferred, install Express as a dependency and add a separate build step.

**Decision: Use hooks.server.ts approach (already implemented).** Delete this task's custom server file — the `hooks.server.ts` from Task 7 already handles worker startup. The `/health` route from Task 8 handles health checks within SvelteKit.

**Step 2: Verify Dockerfile CMD points to the right entry**

The Dockerfile should use:

```dockerfile
CMD ["/app/pkg/start.sh"]
```

And start.sh runs:

```bash
exec gosu cloudron:cloudron node /app/code/build/index.js
```

Where `build/index.js` is the standard adapter-node output.

**Step 3: Commit** (skip if no changes)

---

### Task 19: End-to-end verification

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass.

**Step 2: Run type check**

```bash
npm run check
```

Expected: No type errors.

**Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds, outputs to `build/`.

**Step 4: Verify project structure matches design**

```bash
find src -type f | sort
```

Expected structure:
```
src/app.css
src/app.d.ts
src/app.html
src/hooks.server.ts
src/lib/server/db/index.ts
src/lib/server/db/migrate.ts
src/lib/server/db/migrations/...
src/lib/server/db/schema.test.ts
src/lib/server/db/schema.ts
src/lib/server/services/bluesky.test.ts
src/lib/server/services/bluesky.ts
src/lib/server/services/card-generator.test.ts
src/lib/server/services/card-generator.ts
src/lib/server/services/differ.test.ts
src/lib/server/services/differ.ts
src/lib/server/services/extractor.test.ts
src/lib/server/services/extractor.ts
src/lib/server/services/feed-parser.test.ts
src/lib/server/services/feed-parser.ts
src/lib/server/services/mastodon.test.ts
src/lib/server/services/mastodon.ts
src/lib/server/services/scheduler.test.ts
src/lib/server/services/scheduler.ts
src/lib/server/workers/connection.ts
src/lib/server/workers/feed-poller.ts
src/lib/server/workers/queues.ts
src/lib/server/workers/startup.ts
src/lib/server/workers/syndicator.ts
src/routes/+layout.svelte
src/routes/+page.server.ts
src/routes/+page.svelte
src/routes/article/[id]/+page.server.ts
src/routes/article/[id]/+page.svelte
src/routes/diff/[id]/+page.server.ts
src/routes/diff/[id]/+page.svelte
src/routes/feeds/+page.server.ts
src/routes/feeds/+page.svelte
src/routes/health/+server.ts
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: end-to-end verification complete"
```
