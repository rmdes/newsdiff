import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { buildRssFeed } from '$lib/server/services/feed-builder';
import { diffToFeedEntry } from '$lib/server/services/feed-entries';

export const GET: RequestHandler = async ({ params, url }) => {
	const articleId = Number(params.id);
	if (isNaN(articleId)) throw error(404, 'Not found');

	const origin = process.env.ORIGIN || url.origin;
	const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId), with: { feed: true } });
	if (!article) throw error(404, 'Article not found');

	const articleDiffs = await db.query.diffs.findMany({
		where: eq(diffs.articleId, articleId),
		with: { article: { with: { feed: true } }, oldVersion: true, newVersion: true },
		orderBy: [desc(diffs.createdAt)]
	});

	const latestTitle = articleDiffs[0]?.newVersion?.title || article.url;
	const entries = articleDiffs.map(d => diffToFeedEntry(d, origin));

	const xml = buildRssFeed({
		id: `${origin}/article/${articleId}/rss.xml`,
		title: `NewsDiff — ${latestTitle}`,
		link: `${origin}/article/${articleId}`,
		updated: entries[0]?.updated || new Date().toISOString(),
		entries
	});

	return new Response(xml, {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
	});
};
