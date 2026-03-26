import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diffs, feeds } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const showBoring = url.searchParams.get('boring') === '1';
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const perPage = 20;

	const conditions = [];
	if (!showBoring) {
		conditions.push(eq(diffs.isBoring, false));
	}

	const recentDiffs = await db.query.diffs.findMany({
		where: conditions.length ? and(...conditions) : undefined,
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		},
		orderBy: [desc(diffs.createdAt)],
		limit: perPage,
		offset: (page - 1) * perPage
	});

	const allFeeds = await db.select().from(feeds).orderBy(feeds.name);

	return { diffs: recentDiffs, feeds: allFeeds, page, showBoring };
};
