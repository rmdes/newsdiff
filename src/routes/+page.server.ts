import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles, feeds } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const showBoring = url.searchParams.get('boring') === '1';
	const feedFilter = url.searchParams.get('feed');
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const perPage = 20;

	const conditions = [];
	if (!showBoring) {
		conditions.push(eq(diffs.isBoring, false));
	}
	if (feedFilter) {
		// Filter diffs by feed: diffs -> articles -> feeds
		// We need to find article IDs belonging to this feed, then filter diffs
		const feedArticles = await db
			.select({ id: articles.id })
			.from(articles)
			.where(eq(articles.feedId, Number(feedFilter)));
		const articleIds = feedArticles.map(a => a.id);

		if (articleIds.length === 0) {
			return { diffs: [], feeds: await db.select().from(feeds).orderBy(feeds.name), page, showBoring, feedFilter };
		}

		// Use inArray for filtering
		const { inArray } = await import('drizzle-orm');
		conditions.push(inArray(diffs.articleId, articleIds));
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

	return { diffs: recentDiffs, feeds: allFeeds, page, showBoring, feedFilter };
};
