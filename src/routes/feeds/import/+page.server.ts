import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { feeds, articles, versions } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { extractArticle, computeHash } from '$lib/server/services/extractor';
import { JSDOM } from 'jsdom';

const USER_AGENT = 'NewsDiff/0.1 (+https://github.com/rmdes/newsdiff; sitemap importer)';

interface ImportStatus {
	running: boolean;
	total: number;
	processed: number;
	stored: number;
	skipped: number;
	failed: number;
	errors: string[];
}

// In-memory import status (survives across requests within the same process)
let importStatus: ImportStatus = {
	running: false, total: 0, processed: 0, stored: 0, skipped: 0, failed: 0, errors: []
};

export const load: PageServerLoad = async () => {
	const allFeeds = await db.select({ id: feeds.id, name: feeds.name }).from(feeds).orderBy(feeds.name);
	return { feeds: allFeeds, status: { ...importStatus } };
};

export const actions = {
	import: async ({ request }) => {
		if (importStatus.running) {
			return fail(400, { error: 'Import already in progress. Check status below.' });
		}

		const formData = await request.formData();
		const sitemapUrl = formData.get('sitemapUrl')?.toString().trim();
		const feedId = Number(formData.get('feedId'));

		if (!sitemapUrl) return fail(400, { error: 'Sitemap URL is required' });
		if (!feedId) return fail(400, { error: 'Select a feed to associate articles with' });

		// Validate URL
		let parsedUrl: URL;
		try { parsedUrl = new URL(sitemapUrl); } catch { return fail(400, { error: 'Invalid URL' }); }
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			return fail(400, { error: 'Only HTTP/HTTPS URLs allowed' });
		}

		// Verify feed exists
		const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
		if (!feed) return fail(400, { error: 'Feed not found' });

		// Fetch and parse sitemap
		let urls: string[];
		try {
			const response = await fetch(sitemapUrl, {
				headers: { 'User-Agent': USER_AGENT },
				signal: AbortSignal.timeout(30000)
			});
			if (!response.ok) return fail(400, { error: `Failed to fetch sitemap: ${response.status}` });

			const text = await response.text();
			urls = parseSitemap(text);
		} catch (err: any) {
			return fail(400, { error: `Failed to fetch sitemap: ${err.message}` });
		}

		if (urls.length === 0) {
			return fail(400, { error: 'No URLs found in sitemap' });
		}

		// Reset status and start background import
		importStatus = {
			running: true, total: urls.length,
			processed: 0, stored: 0, skipped: 0, failed: 0, errors: []
		};

		console.log(`Sitemap import: starting ${urls.length} URLs for feed ${feed.name}`);

		// Fire-and-forget background import
		(async () => {
			for (const url of urls) {
				try {
					const result = await importUrl(url, feedId);
					if (result === 'stored') importStatus.stored++;
					else if (result === 'skipped') importStatus.skipped++;
				} catch (err: any) {
					importStatus.failed++;
					if (importStatus.errors.length < 20) {
						importStatus.errors.push(`${url}: ${err.message}`);
					}
				}
				importStatus.processed++;

				if (importStatus.processed % 50 === 0) {
					console.log(`Sitemap import: ${importStatus.processed}/${importStatus.total} (${importStatus.stored} stored, ${importStatus.skipped} skipped, ${importStatus.failed} failed)`);
				}

				// Small delay to avoid hammering the target site
				await new Promise(r => setTimeout(r, 500));
			}

			importStatus.running = false;
			console.log(`Sitemap import complete: ${importStatus.stored} stored, ${importStatus.skipped} skipped, ${importStatus.failed} failed out of ${importStatus.total}`);
		})();

		return { success: true, message: `Import started: ${urls.length} URLs queued. Refresh to see progress.` };
	}
} satisfies Actions;

/**
 * Parse a sitemap XML and extract all URLs.
 * Handles both sitemap index files and regular sitemaps.
 */
function parseSitemap(xml: string): string[] {
	const urls: string[] = [];

	// Match <loc>...</loc> tags
	const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
	for (const match of xml.matchAll(locRegex)) {
		const url = match[1].trim();
		if (url.startsWith('http')) {
			urls.push(url);
		}
	}

	return urls;
}

/**
 * Import a single URL: fetch, extract, store as version 1.
 * Returns 'stored' if new version created, 'skipped' if already exists.
 */
async function importUrl(url: string, feedId: number): Promise<'stored' | 'skipped'> {
	// Check if article already has versions
	const [existing] = await db
		.select()
		.from(articles)
		.where(eq(articles.url, url))
		.limit(1);

	if (existing) {
		const [existingVersion] = await db
			.select()
			.from(versions)
			.where(eq(versions.articleId, existing.id))
			.limit(1);

		if (existingVersion) return 'skipped'; // Already have a baseline
	}

	// Fetch the page
	const response = await fetch(url, {
		headers: {
			'User-Agent': USER_AGENT,
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
		},
		signal: AbortSignal.timeout(15000),
		redirect: 'follow'
	});

	if (!response.ok) throw new Error(`HTTP ${response.status}`);

	const contentLength = Number(response.headers.get('content-length') || 0);
	if (contentLength > 10 * 1024 * 1024) throw new Error('Response too large');

	const html = await response.text();
	const finalUrl = response.url || url;

	const extracted = await extractArticle(html, finalUrl);
	if (!extracted) throw new Error('Extraction failed');

	const contentHash = computeHash(extracted.content);

	// Upsert article
	const [article] = await db
		.insert(articles)
		.values({ feedId, url: finalUrl })
		.onConflictDoUpdate({ target: articles.url, set: { lastCheckedAt: new Date() } })
		.returning();

	// Check again after upsert (race condition safety)
	const [existingVersion] = await db
		.select()
		.from(versions)
		.where(eq(versions.articleId, article.id))
		.limit(1);

	if (existingVersion) return 'skipped';

	// Store version 1 — no diff, no syndication
	await db.insert(versions).values({
		articleId: article.id,
		title: extracted.title,
		byline: extracted.byline,
		contentText: extracted.content,
		contentHash,
		versionNumber: 1
	});

	return 'stored';
}
