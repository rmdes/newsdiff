import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { generateFullDiffImage } from '$lib/server/services/card-generator';
import { rateLimit } from '$lib/server/rate-limit';

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	const id = Number(params.id);
	if (isNaN(id)) throw error(404, 'Not found');

	// Rate limit: 10 full-image requests per minute per IP (more expensive, no disk cache)
	const clientIp = getClientAddress();
	if (!rateLimit(`fullimg:${clientIp}`, 10, 60_000)) {
		throw error(429, 'Too many image generation requests');
	}

	const diff = await db.query.diffs.findFirst({
		where: eq(diffs.id, id),
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		}
	});

	if (!diff) throw error(404, 'Diff not found');

	const cardData = {
		feedName: diff.article.feed.name,
		articleTitle: diff.newVersion.title || diff.oldVersion.title || 'Untitled',
		titleChanged: diff.titleChanged,
		contentChanged: diff.contentChanged,
		charsAdded: diff.charsAdded,
		charsRemoved: diff.charsRemoved,
		oldTitle: diff.titleChanged ? (diff.oldVersion.title || undefined) : undefined,
		newTitle: diff.titleChanged ? (diff.newVersion.title || undefined) : undefined,
		diffHtml: diff.diffHtml
	};

	const imageBuffer = await generateFullDiffImage(cardData);

	return new Response(imageBuffer, {
		headers: {
			'Content-Type': 'image/png',
			'Content-Disposition': `attachment; filename="diff-${id}-full.png"`,
			'Cache-Control': 'public, max-age=86400'
		}
	});
};
