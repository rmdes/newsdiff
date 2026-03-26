import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from './connection';
import { db } from '../db';
import { feeds, articles, versions, diffs } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { fetchAndParseFeed } from '../services/feed-parser';
import { extractArticle, computeHash } from '../services/extractor';
import { computeDiff, isBoring } from '../services/differ';
import { shouldCheckArticle } from '../services/scheduler';

export interface FeedPollJobData {
	feedId: number;
	feedUrl: string;
}

async function processArticle(articleUrl: string, feedId: number) {
	const response = await fetch(articleUrl);
	if (!response.ok) return;
	const html = await response.text();

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
		.returning();

	// Compute diff if not first version
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

		const boring =
			isBoring(latestVersion.contentText, extracted.content) &&
			(!titleChanged || isBoring(latestVersion.title || '', extracted.title));

		const [newDiff] = await db
			.insert(diffs)
			.values({
				articleId: article.id,
				oldVersionId: latestVersion.id,
				newVersionId: newVersion.id,
				titleChanged,
				contentChanged,
				diffHtml: fullDiffHtml,
				charsAdded: titleDiff.charsAdded + contentDiffResult.charsAdded,
				charsRemoved: titleDiff.charsRemoved + contentDiffResult.charsRemoved,
				isBoring: boring
			})
			.returning();

		await db
			.update(articles)
			.set({ lastChangedAt: new Date() })
			.where(eq(articles.id, article.id));

		// Queue syndication if not boring
		if (!boring) {
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

	const { siteName, items } = await fetchAndParseFeed(feedUrl);

	if (siteName) {
		await db.update(feeds).set({ siteName }).where(eq(feeds.id, feedId));
	}

	for (const item of items) {
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
