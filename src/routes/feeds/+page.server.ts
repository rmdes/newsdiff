import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { feeds } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	const allFeeds = await db.select().from(feeds).orderBy(feeds.createdAt);
	return { feeds: allFeeds };
};

export const actions = {
	add: async ({ request }) => {
		const data = await request.formData();
		const url = data.get('url')?.toString().trim();
		const name = data.get('name')?.toString().trim();

		if (!url || !name) return fail(400, { error: 'URL and name are required' });

		try { new URL(url); } catch { return fail(400, { error: 'Invalid URL' }); }

		const existing = await db.select().from(feeds).where(eq(feeds.url, url)).limit(1);
		if (existing.length > 0) return fail(400, { error: 'Feed already exists' });

		await db.insert(feeds).values({ url, name });
		return { success: true };
	},

	toggle: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const isActive = data.get('isActive') === 'true';
		await db.update(feeds).set({ isActive }).where(eq(feeds.id, id));
		return { success: true };
	},

	remove: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.delete(feeds).where(eq(feeds.id, id));
		return { success: true };
	}
} satisfies Actions;
