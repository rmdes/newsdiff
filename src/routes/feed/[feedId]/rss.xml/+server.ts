import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles, feeds } from '$lib/server/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { buildRssFeed } from '$lib/server/services/feed-builder';
import { diffToFeedEntry } from '$lib/server/services/feed-entries';

export const GET: RequestHandler = async ({ params, url }) => {
	const feedId = Number(params.feedId);
	if (isNaN(feedId)) throw error(404, 'Not found');

	const origin = process.env.ORIGIN || url.origin;
	const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
	if (!feed) throw error(404, 'Feed not found');

	const feedArticles = await db.select({ id: articles.id }).from(articles).where(eq(articles.feedId, feedId));
	const articleIds = feedArticles.map(a => a.id);

	const recentDiffs = articleIds.length > 0
		? await db.query.diffs.findMany({
			where: and(eq(diffs.isBoring, false), inArray(diffs.articleId, articleIds)),
			with: { article: { with: { feed: true } }, oldVersion: true, newVersion: true },
			orderBy: [desc(diffs.createdAt)],
			limit: 50
		})
		: [];

	const entries = recentDiffs.map(d => diffToFeedEntry(d, origin));

	const xml = buildRssFeed({
		id: `${origin}/feed/${feedId}/rss.xml`,
		title: `NewsDiff — ${feed.name}`,
		link: `${origin}/?feed=${feedId}`,
		updated: entries[0]?.updated || new Date().toISOString(),
		entries
	});

	return new Response(xml, {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
	});
};
