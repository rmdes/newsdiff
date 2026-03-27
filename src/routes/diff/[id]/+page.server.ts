import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diffs, socialPosts } from '$lib/server/db/schema';
import { eq, and, lt, gt } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) throw error(404, 'Not found');

	const diff = await db.query.diffs.findFirst({
		where: eq(diffs.id, id),
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		}
	});

	if (!diff) throw error(404, 'Diff not found');

	const prevDiff = await db.query.diffs.findFirst({
		where: and(eq(diffs.articleId, diff.articleId), lt(diffs.id, id)),
		orderBy: (d, { desc }) => [desc(d.id)]
	});

	const nextDiff = await db.query.diffs.findFirst({
		where: and(eq(diffs.articleId, diff.articleId), gt(diffs.id, id)),
		orderBy: (d, { asc }) => [asc(d.id)]
	});

	// Find the AP post URI for this diff
	const apPost = await db.query.socialPosts.findFirst({
		where: and(eq(socialPosts.diffId, id), eq(socialPosts.platform, 'activitypub'))
	});

	return {
		diff,
		prevDiffId: prevDiff?.id ?? null,
		nextDiffId: nextDiff?.id ?? null,
		apPostUri: apPost?.postUri ?? null
	};
};
