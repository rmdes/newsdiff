import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const IMAGE_DIR = process.env.IMAGE_DIR || './images';
const BOT_IMAGE_DIR = join(IMAGE_DIR, 'bot');

const MIME_TYPES: Record<string, string> = {
	'png': 'image/png',
	'jpg': 'image/jpeg',
	'jpeg': 'image/jpeg',
	'webp': 'image/webp',
	'gif': 'image/gif',
	'svg': 'image/svg+xml'
};

export const GET: RequestHandler = async ({ params }) => {
	const filename = params.path;
	if (!filename || filename.includes('..') || filename.includes('/')) {
		throw error(400, 'Invalid path');
	}

	const ext = filename.split('.').pop()?.toLowerCase() || '';
	const mimeType = MIME_TYPES[ext];
	if (!mimeType) throw error(400, 'Unsupported image type');

	try {
		const buffer = await readFile(join(BOT_IMAGE_DIR, filename));
		return new Response(buffer, {
			headers: {
				'Content-Type': mimeType,
				'Cache-Control': 'public, max-age=86400'
			}
		});
	} catch {
		throw error(404, 'Image not found');
	}
};
