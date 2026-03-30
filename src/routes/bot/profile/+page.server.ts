import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { loadBotProfile, saveBotProfile } from '$lib/server/bot-profile';
import { reloadBotProfile, getBotSession } from '../../../bot/index';
import { db } from '$lib/server/db';
import { diffs, socialPosts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getRedisConnection } from '$lib/server/workers/connection';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const IMAGE_DIR = process.env.IMAGE_DIR || './images';
const BOT_IMAGE_DIR = join(IMAGE_DIR, 'bot');

const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

async function processUpload(file: File, outputName: string): Promise<string | { error: string }> {
	if (file.size > MAX_IMAGE_SIZE) {
		return { error: `${outputName} must be under 5MB` };
	}
	const ext = file.name.split('.').pop()?.toLowerCase() || '';
	if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
		return { error: 'Only PNG, JPG, and WebP images are allowed' };
	}
	await mkdir(BOT_IMAGE_DIR, { recursive: true });
	const buffer = Buffer.from(await file.arrayBuffer());
	// Re-encode through sharp to validate content and strip metadata
	const sanitized = await sharp(buffer).png().toBuffer();
	const filename = `${outputName}.png`;
	await writeFile(join(BOT_IMAGE_DIR, filename), sanitized);
	return filename;
}

export const load: PageServerLoad = async () => {
	const profile = await loadBotProfile();

	// Load a recent non-boring diff for the post preview
	const recentDiff = await db.query.diffs.findFirst({
		where: eq(diffs.isBoring, false),
		with: { article: { with: { feed: true } }, newVersion: true },
		orderBy: (d, { desc }) => [desc(d.id)]
	});

	const previewData = recentDiff ? {
		title: recentDiff.newVersion.title || 'Untitled Article',
		feedName: recentDiff.article.feed.name,
		titleChanged: recentDiff.titleChanged,
		contentChanged: recentDiff.contentChanged,
		charsAdded: recentDiff.charsAdded,
		charsRemoved: recentDiff.charsRemoved,
		diffId: recentDiff.id
	} : null;

	return { profile, previewData };
};

export const actions = {
	save: async ({ request }) => {
		const formData = await request.formData();

		const profile = await loadBotProfile();

		// Update text fields with length limits
		const displayName = formData.get('displayName')?.toString().trim().slice(0, 200);
		const summary = formData.get('summary')?.toString().trim().slice(0, 2000);

		if (displayName !== undefined) profile.displayName = displayName || profile.displayName;
		if (summary !== undefined) profile.summary = summary || profile.summary;

		// Post template — ActivityPub
		const postPrefix = formData.get('postPrefix')?.toString().trim().slice(0, 200);
		const postSuffix = formData.get('postSuffix')?.toString().trim().slice(0, 500);
		if (postPrefix !== undefined) profile.postPrefix = postPrefix;
		if (postSuffix !== undefined) profile.postSuffix = postSuffix;

		// Post template — Bluesky
		const bskyPostPrefix = formData.get('bskyPostPrefix')?.toString().trim().slice(0, 100);
		const bskyPostSuffix = formData.get('bskyPostSuffix')?.toString().trim().slice(0, 200);
		if (bskyPostPrefix !== undefined) profile.bskyPostPrefix = bskyPostPrefix;
		if (bskyPostSuffix !== undefined) profile.bskyPostSuffix = bskyPostSuffix;

		// Handle avatar upload (cache-bust with timestamp so federated instances re-fetch)
		const avatar = formData.get('avatar') as File | null;
		if (avatar && avatar.size > 0) {
			const result = await processUpload(avatar, 'avatar');
			if (typeof result === 'object') return fail(400, result);
			const origin = process.env.ORIGIN || process.env.BOT_ORIGIN || '';
			profile.avatarUrl = `${origin}/bot-images/${result}`;
		}

		// Handle header upload
		const header = formData.get('header') as File | null;
		if (header && header.size > 0) {
			const result = await processUpload(header, 'header');
			if (typeof result === 'object') return fail(400, result);
			const origin = process.env.ORIGIN || process.env.BOT_ORIGIN || '';
			profile.headerUrl = `${origin}/bot-images/${result}`;
		}

		// Handle profile fields (up to 6, with length limits)
		const fields: { name: string; value: string }[] = [];
		for (let i = 0; i < 6; i++) {
			const name = formData.get(`field_name_${i}`)?.toString().trim().slice(0, 200);
			const value = formData.get(`field_value_${i}`)?.toString().trim().slice(0, 500);
			if (name && value) {
				fields.push({ name, value });
			}
		}
		profile.fields = fields;

		// Refresh cache busters on image URLs so federated instances re-fetch them
		const cacheBust = `v=${Date.now()}`;
		if (profile.avatarUrl) {
			profile.avatarUrl = profile.avatarUrl.replace(/\?v=\d+$/, '') + `?${cacheBust}`;
		}
		if (profile.headerUrl) {
			profile.headerUrl = profile.headerUrl.replace(/\?v=\d+$/, '') + `?${cacheBust}`;
		}

		await saveBotProfile(profile);

		try {
			await reloadBotProfile();
		} catch (err) {
			console.error('Failed to reload bot profile:', err);
		}

		return { success: true, message: 'Profile saved and bot updated.', profile };
	},

	removeAvatar: async () => {
		const profile = await loadBotProfile();
		profile.avatarUrl = '';
		await saveBotProfile(profile);
		try { await reloadBotProfile(); } catch {}
		return { success: true, profile };
	},

	removeHeader: async () => {
		const profile = await loadBotProfile();
		profile.headerUrl = '';
		await saveBotProfile(profile);
		try { await reloadBotProfile(); } catch {}
		return { success: true, profile };
	},

	deleteAllPosts: async () => {
		const session = getBotSession();

		// 1. Clear social_posts DB table
		const dbResult = await db.delete(socialPosts).returning({ id: socialPosts.id });
		console.log(`Cleared ${dbResult.length} social_posts DB records`);

		// 2. Clear all diffs so the counter resets
		const diffResult = await db.delete(diffs).returning({ id: diffs.id });
		console.log(`Cleared ${diffResult.length} diffs DB records`);

		// 3. Flush the BullMQ syndicate queue from Redis
		let queueKeysCleared = 0;
		try {
			const redis = getRedisConnection();
			const keys = await redis.keys('bull:syndicate:*');
			if (keys.length > 0) {
				await redis.del(...keys);
			}
			queueKeysCleared = keys.length;
			console.log(`Cleared ${queueKeysCleared} syndicate queue keys from Redis`);
		} catch (err: any) {
			console.error('Failed to clear syndicate queue:', err.message);
		}

		// 4. Fire-and-forget the AP outbox delete loop
		(async () => {
			let deleted = 0;
			let failed = 0;
			try {
				for await (const msg of session.getOutbox()) {
					try {
						await msg.delete();
						deleted++;
						if (deleted % 25 === 0) console.log(`Deleting AP posts: ${deleted} so far...`);
						await new Promise(r => setTimeout(r, 200));
					} catch {
						failed++;
					}
				}
			} catch (err: any) {
				console.error('Delete loop error:', err.message);
			}
			console.log(`AP post deletion complete: ${deleted} deleted, ${failed} failed`);
		})();

		return {
			success: true,
			message: `Cleared ${dbResult.length} social posts, ${diffResult.length} diffs, ${queueKeysCleared} queued jobs. AP deletion running in background.`
		};
	}
} satisfies Actions;
