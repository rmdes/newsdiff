/**
 * Delete all ActivityPub posts, diffs, social_posts, and flush the syndicate queue.
 * Run via: node --import tsx/esm scripts/delete-all-posts.ts
 */

import { getBotSession } from '../src/bot/index';
import { db } from '../src/lib/server/db';
import { diffs, socialPosts } from '../src/lib/server/db/schema';
import { getRedisConnection } from '../src/lib/server/workers/connection';

const DELAY_MS = 500;

async function main() {
	// 1. Clear DB
	const spResult = await db.delete(socialPosts).returning({ id: socialPosts.id });
	console.log(`Cleared ${spResult.length} social_posts records`);

	const diffResult = await db.delete(diffs).returning({ id: diffs.id });
	console.log(`Cleared ${diffResult.length} diffs records`);

	// 2. Flush syndicate queue
	const redis = getRedisConnection();
	const keys = await redis.keys('bull:syndicate:*');
	if (keys.length > 0) await redis.del(...keys);
	console.log(`Cleared ${keys.length} syndicate queue keys`);

	// 3. Delete AP outbox posts
	const session = getBotSession();
	const messages = [];
	for await (const msg of session.getOutbox()) {
		messages.push(msg);
	}
	console.log(`Found ${messages.length} AP posts to delete`);

	let deleted = 0;
	let failed = 0;
	for (const msg of messages) {
		try {
			await msg.delete();
			deleted++;
			if (deleted % 10 === 0) console.log(`Deleted ${deleted}/${messages.length}...`);
			await new Promise(r => setTimeout(r, DELAY_MS));
		} catch {
			failed++;
		}
	}

	console.log(`\nDone: ${deleted} AP posts deleted, ${failed} failed`);
	process.exit(0);
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
