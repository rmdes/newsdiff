import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles, feeds } from '$lib/server/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { buildAtomFeed, type AtomEntry } from '$lib/server/services/atom-builder';

export const GET: RequestHandler = async ({ params, url }) => {
	const feedId = Number(params.feedId);
	if (isNaN(feedId)) throw error(404, 'Not found');

	const origin = process.env.ORIGIN || url.origin;

	const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
	if (!feed) throw error(404, 'Feed not found');

	const feedArticles = await db
		.select({ id: articles.id })
		.from(articles)
		.where(eq(articles.feedId, feedId));

	const articleIds = feedArticles.map(a => a.id);

	if (articleIds.length === 0) {
		const xml = buildAtomFeed({
			id: `${origin}/feed/${feedId}.xml`,
			title: `NewsDiff — ${feed.name}`,
			link: `${origin}/?feed=${feedId}`,
			updated: new Date().toISOString(),
			entries: []
		});
		return new Response(xml, {
			headers: { 'Content-Type': 'application/atom+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
		});
	}

	const recentDiffs = await db.query.diffs.findMany({
		where: and(eq(diffs.isBoring, false), inArray(diffs.articleId, articleIds)),
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		},
		orderBy: [desc(diffs.createdAt)],
		limit: 50
	});

	const entries: AtomEntry[] = recentDiffs.map(d => {
		const title = d.newVersion.title || d.oldVersion.title || 'Untitled';
		const changes = [d.titleChanged ? 'headline' : '', d.contentChanged ? 'content' : ''].filter(Boolean).join(' & ');
		const changeDesc = changes ? `${changes.charAt(0).toUpperCase() + changes.slice(1)} changed` : 'Updated';

		return {
			id: `${origin}/diff/${d.id}`,
			title: `${changeDesc}: ${title}`,
			link: `${origin}/diff/${d.id}`,
			updated: new Date(d.createdAt).toISOString(),
			summary: `${changeDesc} in "${title}" (${d.article.feed.name}). +${d.charsAdded} / -${d.charsRemoved} chars.`
		};
	});

	const xml = buildAtomFeed({
		id: `${origin}/feed/${feedId}.xml`,
		title: `NewsDiff — ${feed.name}`,
		link: `${origin}/?feed=${feedId}`,
		updated: entries[0]?.updated || new Date().toISOString(),
		entries
	});

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/atom+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
