import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { buildRssFeed } from '$lib/server/services/feed-builder';
import { diffToFeedEntry } from '$lib/server/services/feed-entries';

export const GET: RequestHandler = async ({ url }) => {
	const origin = process.env.ORIGIN || url.origin;

	const recentDiffs = await db.query.diffs.findMany({
		where: eq(diffs.isBoring, false),
		with: { article: { with: { feed: true } }, oldVersion: true, newVersion: true },
		orderBy: [desc(diffs.createdAt)],
		limit: 50
	});

	const entries = recentDiffs.map(d => diffToFeedEntry(d, origin));

	const xml = buildRssFeed({
		id: `${origin}/rss.xml`,
		title: 'NewsDiff — All Diffs',
		link: origin,
		updated: entries[0]?.updated || new Date().toISOString(),
		entries,
		hubUrl: `${origin}/api/websub/0`
	});

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
