import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from './connection';
import { db } from '../db';
import { feeds, articles, versions, diffs } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { fetchAndParseFeed } from '../services/feed-parser';
import { extractArticle, computeHash } from '../services/extractor';
import { evaluateChange } from '../services/differ';
import { archiveUrl, isArchiveEnabled } from '../services/archive';

export interface FeedPollJobData {
	feedId: number;
	feedUrl: string;
}

const USER_AGENT = 'NewsDiff/0.1 (+https://github.com/newsdiff; RSS feed monitor)';
const MAX_CONSECUTIVE_ERRORS = 5;
const FETCH_TIMEOUT = 15000; // 15 seconds
const LIVE_BLOG_SNAPSHOT_MS = 30 * 60 * 1000; // coalesce live-blog updates into ~30-min snapshots

async function fetchWithUA(url: string): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

	try {
		return await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.5'
			},
			signal: controller.signal,
			redirect: 'follow'
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function processArticle(articleUrl: string, feed: typeof feeds.$inferSelect) {
	const response = await fetchWithUA(articleUrl);
	if (!response.ok) return;

	// Limit response size to prevent OOM from huge pages
	const contentLength = Number(response.headers.get('content-length') || 0);
	if (contentLength > 10 * 1024 * 1024) return;
	const html = await response.text();
	if (html.length > 10 * 1024 * 1024) return;

	// Use the final URL after redirects (e.g., http:// -> https://)
	const finalUrl = response.url || articleUrl;

	const extracted = await extractArticle(html, finalUrl);
	if (!extracted) return;

	const contentHash = computeHash(extracted.content);

	// Find or create article record (upsert to handle concurrent inserts and redirected URLs)
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

	// Get latest version
	const [latestVersion] = await db
		.select()
		.from(versions)
		.where(eq(versions.articleId, article.id))
		.orderBy(desc(versions.versionNumber))
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

	// Live blogs change constantly by design — snapshot at most every 30 min.
	if (
		extracted.isLiveBlog &&
		latestVersion &&
		Date.now() - latestVersion.createdAt.getTime() < LIVE_BLOG_SNAPSHOT_MS
	) {
		return;
	}

	const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

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
		.onConflictDoNothing({ target: [versions.articleId, versions.versionNumber] })
		.returning();

	// Lost a race: another concurrent poll of the same URL already inserted this
	// version number. It will (or already did) record the diff, so bail.
	if (!newVersion) return;

	// Archive this version on the Wayback Machine (fire-and-forget, requires credentials)
	if (isArchiveEnabled()) {
		archiveUrl(finalUrl).then(async (archived) => {
			if (archived) {
				await db.update(versions).set({ archiveUrl: archived }).where(eq(versions.id, newVersion.id));
			}
		}).catch(() => {});
	}

	// Compute diff if not first version
	if (latestVersion) {
		const change = evaluateChange(
			latestVersion.title,
			latestVersion.contentText,
			extracted.title,
			extracted.content,
			{ siteName: feed.siteName, ignoreTitleChanges: feed.ignoreTitleChanges, isLiveBlog: extracted.isLiveBlog }
		);

		const [newDiff] = await db
			.insert(diffs)
			.values({
				articleId: article.id,
				oldVersionId: latestVersion.id,
				newVersionId: newVersion.id,
				titleChanged: change.titleChanged,
				contentChanged: change.contentChanged,
				diffHtml: change.diffHtml,
				charsAdded: change.charsAdded,
				charsRemoved: change.charsRemoved,
				isBoring: change.isBoring
			})
			.returning();

		await db
			.update(articles)
			.set({ lastChangedAt: new Date() })
			.where(eq(articles.id, article.id));

		// Queue syndication only if this feed broadcasts and the diff is interesting
		if (feed.syndicate && !change.isBoring) {
			const { createQueues } = await import('./queues');
			const { syndicateQueue } = createQueues();
			await syndicateQueue.add(`syndicate-diff-${newDiff.id}`, { diffId: newDiff.id }, {
				attempts: 3,
				backoff: { type: 'exponential', delay: 5000 }
			});
		}
	}
}

async function pollFeed(job: Job<FeedPollJobData>) {
	const { feedId, feedUrl } = job.data;

	// Check if feed is still active
	const [feed] = await db.select().from(feeds).where(eq(feeds.id, feedId)).limit(1);
	if (!feed || !feed.isActive) return;

	try {
		const { siteName, items, hubUrl } = await fetchAndParseFeed(feedUrl);

		// Feed fetch succeeded — reset error counter, store hub if discovered
		const feedUpdates: Record<string, any> = {
			siteName: siteName || feed.siteName,
			lastError: null,
			lastErrorAt: null,
			consecutiveErrors: 0,
			lastSuccessAt: new Date()
		};

		// WebSub: if a hub was discovered and we're not already subscribed, subscribe
		if (hubUrl && hubUrl !== feed.hubUrl) {
			try {
				const { subscribeToHub } = await import('../services/websub');
				const origin = process.env.ORIGIN || process.env.BOT_ORIGIN || '';
				const callbackUrl = `${origin}/api/websub/${feedId}`;
				const { secret } = await subscribeToHub({ hubUrl, feedUrl, callbackUrl });
				feedUpdates.hubUrl = hubUrl;
				feedUpdates.hubSecret = secret;
				console.log(`WebSub: subscribed feed ${feedId} (${feed.name}) to hub ${hubUrl}`);
			} catch (err: any) {
				console.warn(`WebSub: failed to subscribe feed ${feedId}: ${err.message}`);
			}
		}

		await db.update(feeds).set(feedUpdates).where(eq(feeds.id, feedId));

		let articleErrors = 0;
		for (const item of items) {

			try {
				await processArticle(item.url, feed);
			} catch (err: any) {
				articleErrors++;
				console.error(`Failed to process article ${item.url}: ${err.message || err}`);
			}
		}

		if (articleErrors > 0) {
			console.log(`Feed ${feed.name}: ${items.length - articleErrors}/${items.length} articles processed (${articleErrors} failed)`);
		}
	} catch (err: any) {
		// Feed-level failure (couldn't fetch or parse the RSS feed itself)
		const errorMsg = err.message || String(err);
		const newErrorCount = (feed.consecutiveErrors || 0) + 1;

		console.error(`Feed "${feed.name}" poll failed (${newErrorCount}/${MAX_CONSECUTIVE_ERRORS}): ${errorMsg}`);

		const updates: Record<string, any> = {
			lastError: errorMsg.slice(0, 500),
			lastErrorAt: new Date(),
			consecutiveErrors: newErrorCount
		};

		// Auto-disable after MAX_CONSECUTIVE_ERRORS
		if (newErrorCount >= MAX_CONSECUTIVE_ERRORS) {
			updates.isActive = false;
			console.error(`Feed "${feed.name}" auto-disabled after ${MAX_CONSECUTIVE_ERRORS} consecutive failures`);

			// Remove the scheduler so it stops polling
			const { unscheduleFeed } = await import('./startup');
			await unscheduleFeed(feedId);
		}

		await db.update(feeds).set(updates).where(eq(feeds.id, feedId));
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
