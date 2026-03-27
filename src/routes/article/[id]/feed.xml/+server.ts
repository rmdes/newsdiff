import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { buildAtomFeed, type AtomEntry } from '$lib/server/services/atom-builder';

export const GET: RequestHandler = async ({ params, url }) => {
	const articleId = Number(params.id);
	if (isNaN(articleId)) throw error(404, 'Not found');

	const origin = process.env.ORIGIN || url.origin;

	const article = await db.query.articles.findFirst({
		where: eq(articles.id, articleId),
		with: { feed: true }
	});
	if (!article) throw error(404, 'Article not found');

	const articleDiffs = await db.query.diffs.findMany({
		where: eq(diffs.articleId, articleId),
		with: { oldVersion: true, newVersion: true },
		orderBy: [desc(diffs.createdAt)]
	});

	const latestTitle = articleDiffs[0]?.newVersion.title || article.url;

	const entries: AtomEntry[] = articleDiffs.map(d => {
		const title = d.newVersion.title || d.oldVersion.title || 'Untitled';
		const changes = [d.titleChanged ? 'headline' : '', d.contentChanged ? 'content' : ''].filter(Boolean).join(' & ');
		const changeDesc = changes ? `${changes.charAt(0).toUpperCase() + changes.slice(1)} changed` : 'Updated';

		return {
			id: `${origin}/diff/${d.id}`,
			title: `${changeDesc}: ${title}`,
			link: `${origin}/diff/${d.id}`,
			updated: new Date(d.createdAt).toISOString(),
			summary: `${changeDesc} in "${title}" (${article.feed.name}). +${d.charsAdded} / -${d.charsRemoved} chars.`
		};
	});

	const xml = buildAtomFeed({
		id: `${origin}/article/${articleId}/feed.xml`,
		title: `NewsDiff — ${latestTitle}`,
		link: `${origin}/article/${articleId}`,
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
