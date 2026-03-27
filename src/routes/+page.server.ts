import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diffs, articles, feeds } from '$lib/server/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';

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

	// Fetch more diffs than perPage so we can group and still fill the page
	const recentDiffs = await db.query.diffs.findMany({
		where: conditions.length ? and(...conditions) : undefined,
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		},
		orderBy: [desc(diffs.createdAt)],
		limit: 100,
		offset: (page - 1) * 100
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

	// Convert to array, limit to perPage groups
	const groups = [...groupMap.values()]
		.slice(0, perPage)
		.map(diffs => ({
			articleId: diffs[0].articleId,
			article: diffs[0].article,
			latestDiff: diffs[0],
			olderDiffs: diffs.slice(1),
			totalChanges: diffs.length
		}));

	const allFeeds = await db.select().from(feeds).orderBy(feeds.name);

	return { groups, feeds: allFeeds, page, showBoring, feedFilter };
};
