import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { buildAtomFeed, type AtomEntry } from '$lib/server/services/atom-builder';

export const GET: RequestHandler = async ({ url }) => {
	const origin = process.env.ORIGIN || url.origin;

	const recentDiffs = await db.query.diffs.findMany({
		where: eq(diffs.isBoring, false),
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
		id: `${origin}/feed.xml`,
		title: 'NewsDiff — All Diffs',
		link: origin,
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
