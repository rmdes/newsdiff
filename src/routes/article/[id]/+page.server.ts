import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { articles, versions, diffs } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) throw error(404, 'Not found');

	const article = await db.query.articles.findFirst({
		where: eq(articles.id, id),
		with: {
			feed: true,
			versions: { orderBy: [desc(versions.versionNumber)] },
			diffs: {
				orderBy: [desc(diffs.createdAt)],
				with: { oldVersion: true, newVersion: true }
			}
		}
	});

	if (!article) throw error(404, 'Article not found');

	return { article };
};
