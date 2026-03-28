import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { loadBotProfile, saveBotProfile } from '$lib/server/bot-profile';
import { reloadBotProfile, getBotSession } from '../../../bot/index';
import { db } from '$lib/server/db';
import { socialPosts } from '$lib/server/db/schema';
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
	return { profile };
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

		// Handle avatar upload
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

		let deleted = 0;
		let failed = 0;
		for await (const msg of session.getOutbox()) {
			try {
				await msg.delete();
				deleted++;
				await new Promise(r => setTimeout(r, 200));
			} catch {
				failed++;
			}
		}

		const dbResult = await db.delete(socialPosts).returning({ id: socialPosts.id });

		console.log(`Deleted ${deleted} AP posts (${failed} failed), cleared ${dbResult.length} DB records`);
		return { success: true, message: `Deleted ${deleted} posts from fediverse, ${dbResult.length} records from database.` };
	}
} satisfies Actions;
