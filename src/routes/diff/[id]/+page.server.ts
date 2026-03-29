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

	// Find syndicated posts for this diff
	const apPost = await db.query.socialPosts.findFirst({
		where: and(eq(socialPosts.diffId, id), eq(socialPosts.platform, 'activitypub'))
	});

	const bskyPost = await db.query.socialPosts.findFirst({
		where: and(eq(socialPosts.diffId, id), eq(socialPosts.platform, 'bluesky'))
	});

	// Convert Bluesky post URI (at://) to bsky.app URL
	// Stored format: at://did:plc:xxx/app.bsky.feed.post/rkey|cid — strip the |cid part
	let bskyPostUrl: string | null = null;
	if (bskyPost?.postUri) {
		const uri = bskyPost.postUri.split('|')[0]; // strip CID suffix
		const match = uri.match(/at:\/\/[^/]+\/app\.bsky\.feed\.post\/(.+)/);
		if (match) {
			const handle = process.env.BLUESKY_HANDLE || '';
			bskyPostUrl = `https://bsky.app/profile/${handle}/post/${match[1]}`;
		}
	}

	return {
		diff,
		prevDiffId: prevDiff?.id ?? null,
		nextDiffId: nextDiff?.id ?? null,
		apPostUri: apPost?.postUri ?? null,
		bskyPostUrl
	};
};
