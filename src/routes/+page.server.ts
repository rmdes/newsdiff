import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles, feeds } from '$lib/server/db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const showBoring = url.searchParams.get('boring') === '1';
	const feedFilter = url.searchParams.get('feed');
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const perPage = 20;

	const conditions = [];
	if (feedFilter) {
		const feedArticles = await db
			.select({ id: articles.id })
			.from(articles)
			.where(eq(articles.feedId, Number(feedFilter)));
		const articleIds = feedArticles.map(a => a.id);

		if (articleIds.length === 0) {
			return { groups: [], feeds: await db.select().from(feeds).orderBy(feeds.name), page, showBoring, feedFilter };
		}

		conditions.push(inArray(diffs.articleId, articleIds));
	}

	// Always fetch all diffs (including boring) so grouping is complete.
	// We filter boring at the display level, not the query level.
	const recentDiffs = await db.query.diffs.findMany({
		where: conditions.length ? and(...conditions) : undefined,
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		},
		orderBy: [desc(diffs.createdAt)],
		limit: 200,
		offset: (page - 1) * 200
	});

	// Group by articleId, preserving order of first appearance
	const groupMap = new Map<number, typeof recentDiffs>();
	for (const diff of recentDiffs) {
		const existing = groupMap.get(diff.articleId);
		if (existing) {
			existing.push(diff);
		} else {
			groupMap.set(diff.articleId, [diff]);
		}
	}

	// Build groups — filter boring at group level unless showBoring is on
	const groups = [...groupMap.values()]
		.map(allDiffs => {
			const visibleDiffs = showBoring ? allDiffs : allDiffs.filter(d => !d.isBoring);
			if (visibleDiffs.length === 0) return null;

			return {
				articleId: allDiffs[0].articleId,
				article: allDiffs[0].article,
				latestDiff: visibleDiffs[0],
				olderDiffs: visibleDiffs.slice(1),
				totalChanges: allDiffs.length,
				visibleChanges: visibleDiffs.length,
				boringCount: allDiffs.filter(d => d.isBoring).length
			};
		})
		.filter(Boolean)
		.slice(0, perPage);

	const allFeeds = await db.select().from(feeds).orderBy(feeds.name);

	return { groups, feeds: allFeeds, page, showBoring, feedFilter };
};
