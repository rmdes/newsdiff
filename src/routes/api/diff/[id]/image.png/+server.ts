import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { diffs } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { generateDiffCard } from '$lib/server/services/card-generator';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

const IMAGE_DIR = process.env.IMAGE_DIR || './images';

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export const GET: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (isNaN(id)) throw error(404, 'Not found');

	const cachedPath = join(IMAGE_DIR, `diff-${id}.png`);

	// Serve from cache if available
	if (await fileExists(cachedPath)) {
		const buffer = await readFile(cachedPath);
		return new Response(buffer, {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	}

	// Generate the image
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
		newTitle: diff.titleChanged ? (diff.newVersion.title || undefined) : undefined
	};

	const imageBuffer = await generateDiffCard(cardData);

	// Cache to disk
	await mkdir(IMAGE_DIR, { recursive: true });
	await writeFile(cachedPath, imageBuffer);

	return new Response(imageBuffer, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
