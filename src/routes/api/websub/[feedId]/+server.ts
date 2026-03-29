import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { createHmac } from 'node:crypto';
import { db } from '$lib/server/db';
import { feeds, articles, versions, diffs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { parseFeedItems } from '$lib/server/services/feed-parser';
import { extractArticle, computeHash } from '$lib/server/services/extractor';
import { computeDiff, isBoring } from '$lib/server/services/differ';

/**
 * WebSub verification callback (GET).
 * The hub sends a challenge that we echo back to confirm our subscription.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const feedId = Number(params.feedId);
	if (isNaN(feedId)) throw error(404, 'Not found');

	const mode = url.searchParams.get('hub.mode');
	const topic = url.searchParams.get('hub.topic');
	const challenge = url.searchParams.get('hub.challenge');
	const leaseSeconds = url.searchParams.get('hub.lease_seconds');

	if (!challenge) throw error(400, 'Missing hub.challenge');

	// Verify the feed exists
	const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
	if (!feed) throw error(404, 'Feed not found');

	// Verify the topic matches our feed URL
	if (topic && topic !== feed.url) {
		console.warn(`WebSub: topic mismatch for feed ${feedId}: ${topic} !== ${feed.url}`);
		throw error(404, 'Topic mismatch');
	}

	if (mode === 'subscribe' && leaseSeconds) {
		const expiry = new Date(Date.now() + Number(leaseSeconds) * 1000);
		await db.update(feeds).set({ hubLeaseExpiry: expiry }).where(eq(feeds.id, feedId));
		console.log(`WebSub: verified subscription for feed ${feedId} (${feed.name}), lease ${leaseSeconds}s`);
	} else if (mode === 'unsubscribe') {
		await db.update(feeds).set({ hubUrl: null, hubSecret: null, hubLeaseExpiry: null }).where(eq(feeds.id, feedId));
		console.log(`WebSub: verified unsubscription for feed ${feedId} (${feed.name})`);
	}

	// Echo the challenge back as plain text
	return new Response(challenge, {
		status: 200,
		headers: { 'Content-Type': 'text/plain' }
	});
};

/**
 * WebSub content delivery callback (POST).
 * The hub pushes updated feed content when the source changes.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const feedId = Number(params.feedId);
	if (isNaN(feedId)) throw error(404, 'Not found');

	const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
	if (!feed || !feed.isActive) throw error(404, 'Feed not found');

	// Verify HMAC signature if we have a secret
	const body = await request.text();
	if (feed.hubSecret) {
		const signature = request.headers.get('x-hub-signature');
		if (signature) {
			const [algo, sig] = signature.split('=');
			const expected = createHmac(algo || 'sha256', feed.hubSecret).update(body).digest('hex');
			if (sig !== expected) {
				console.warn(`WebSub: HMAC signature mismatch for feed ${feedId}`);
				throw error(403, 'Invalid signature');
			}
		}
	}

	console.log(`WebSub: received push for feed ${feedId} (${feed.name})`);

	// Parse the pushed feed content
	const items = await parseFeedItems(body);

	// Process each article (same logic as feed-poller but triggered by push)
	let processed = 0;
	for (const item of items) {
		try {
			await processArticlePush(item.url, feedId);
			processed++;
		} catch (err: any) {
			console.error(`WebSub: failed to process ${item.url}: ${err.message}`);
		}
	}

	console.log(`WebSub: processed ${processed}/${items.length} articles for feed ${feedId}`);

	return new Response('ok', { status: 200 });
};

/**
 * Process a single article from a WebSub push.
 * Mirrors the logic in feed-poller.ts processArticle().
 */
async function processArticlePush(articleUrl: string, feedId: number) {
	const response = await fetch(articleUrl, {
		headers: {
			'User-Agent': 'NewsDiff/0.1 (+https://github.com/rmdes/newsdiff)',
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
		},
		signal: AbortSignal.timeout(15000),
		redirect: 'follow'
	});

	if (!response.ok) return;

	const contentLength = Number(response.headers.get('content-length') || 0);
	if (contentLength > 10 * 1024 * 1024) return;
	const html = await response.text();
	if (html.length > 10 * 1024 * 1024) return;

	const finalUrl = response.url || articleUrl;
	const extracted = await extractArticle(html, finalUrl);
	if (!extracted) return;

	const contentHash = computeHash(extracted.content);

	const [article] = await db
		.insert(articles)
		.values({ feedId, url: finalUrl })
		.onConflictDoUpdate({ target: articles.url, set: { lastCheckedAt: new Date() } })
		.returning();

	const [latestVersion] = await db
		.select()
		.from(versions)
		.where(eq(versions.articleId, article.id))
		.orderBy(desc(versions.versionNumber))
		.limit(1);

	await db
		.update(articles)
		.set({ lastCheckedAt: new Date(), checkCount: article.checkCount + 1 })
		.where(eq(articles.id, article.id));

	if (latestVersion && latestVersion.contentHash === contentHash) return;

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
		].filter(Boolean).join('\n');

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

		await db.update(articles).set({ lastChangedAt: new Date() }).where(eq(articles.id, article.id));

		if (!boring) {
			const { createQueues } = await import('$lib/server/workers/queues');
			const { syndicateQueue } = createQueues();
			await syndicateQueue.add(`syndicate-diff-${newDiff.id}`, { diffId: newDiff.id }, {
				attempts: 3,
				backoff: { type: 'exponential', delay: 5000 }
			});
		}

		console.log(`WebSub: diff ${newDiff.id} created for "${extracted.title}" (${boring ? 'boring' : 'non-boring'})`);
	}
}
