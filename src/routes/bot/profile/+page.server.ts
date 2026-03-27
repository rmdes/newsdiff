import type { Actions, PageServerLoad } from './$types';
import { loadBotProfile, saveBotProfile } from '$lib/server/bot-profile';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const IMAGE_DIR = process.env.IMAGE_DIR || './images';
const BOT_IMAGE_DIR = join(IMAGE_DIR, 'bot');

export const load: PageServerLoad = async () => {
	const profile = await loadBotProfile();
	return { profile };
};

export const actions = {
	save: async ({ request }) => {
		const formData = await request.formData();

		const profile = await loadBotProfile();

		// Update text fields — use formData values directly (allow clearing)
		const displayName = formData.get('displayName')?.toString().trim();
		const summary = formData.get('summary')?.toString().trim();

		if (displayName !== undefined) profile.displayName = displayName || profile.displayName;
		if (summary !== undefined) profile.summary = summary || profile.summary;

		// Handle avatar upload
		const avatar = formData.get('avatar') as File | null;
		if (avatar && avatar.size > 0) {
			await mkdir(BOT_IMAGE_DIR, { recursive: true });
			const ext = avatar.name.split('.').pop() || 'png';
			const filename = `avatar.${ext}`;
			const buffer = Buffer.from(await avatar.arrayBuffer());
			await writeFile(join(BOT_IMAGE_DIR, filename), buffer);
			const origin = process.env.ORIGIN || process.env.BOT_ORIGIN || '';
			profile.avatarUrl = `${origin}/bot-images/${filename}`;
		}

		// Handle header upload
		const header = formData.get('header') as File | null;
		if (header && header.size > 0) {
			await mkdir(BOT_IMAGE_DIR, { recursive: true });
			const ext = header.name.split('.').pop() || 'png';
			const filename = `header.${ext}`;
			const buffer = Buffer.from(await header.arrayBuffer());
			await writeFile(join(BOT_IMAGE_DIR, filename), buffer);
			const origin = process.env.ORIGIN || process.env.BOT_ORIGIN || '';
			profile.headerUrl = `${origin}/bot-images/${filename}`;
		}

		// Handle profile fields (up to 6)
		const fields: { name: string; value: string }[] = [];
		for (let i = 0; i < 6; i++) {
			const name = formData.get(`field_name_${i}`)?.toString().trim();
			const value = formData.get(`field_value_${i}`)?.toString().trim();
			if (name && value) {
				fields.push({ name, value });
			}
		}
		profile.fields = fields;

		await saveBotProfile(profile);

		// Return the saved profile so the page updates immediately
		return { success: true, message: 'Profile saved. Restart the app to apply changes.', profile };
	},

	removeAvatar: async () => {
		const profile = await loadBotProfile();
		profile.avatarUrl = '';
		await saveBotProfile(profile);
		return { success: true, profile };
	},

	removeHeader: async () => {
		const profile = await loadBotProfile();
		profile.headerUrl = '';
		await saveBotProfile(profile);
		return { success: true, profile };
	}
} satisfies Actions;
