/**
 * Delete all ActivityPub posts from the bot's outbox.
 * Run via: node --import tsx/esm scripts/delete-all-posts.ts
 *
 * This sends Delete activities to all federated instances and
 * clears the social_posts table in the database.
 */

import { getBotSession } from '../src/bot/index';
import { db } from '../src/lib/server/db';
import { socialPosts } from '../src/lib/server/db/schema';
import { sql } from 'drizzle-orm';

const DELAY_MS = 500; // delay between deletes to be polite to federated servers

async function main() {
	const session = getBotSession();

	console.log('Collecting posts from outbox...');
	const messages = [];
	for await (const msg of session.getOutbox()) {
		messages.push(msg);
	}
	console.log(`Found ${messages.length} posts to delete.`);

	if (messages.length === 0) {
		console.log('Nothing to delete.');
		return;
	}

	let deleted = 0;
	let failed = 0;

	for (const msg of messages) {
		try {
			await msg.delete();
			deleted++;
			if (deleted % 10 === 0) {
				console.log(`Deleted ${deleted}/${messages.length}...`);
			}
			await new Promise(r => setTimeout(r, DELAY_MS));
		} catch (err: any) {
			failed++;
			console.error(`Failed to delete ${msg.id?.href}: ${err.message}`);
		}
	}

	console.log(`\nAP posts: ${deleted} deleted, ${failed} failed.`);

	// Clear the social_posts table
	const result = await db.delete(socialPosts).returning({ id: socialPosts.id });
	console.log(`DB: cleared ${result.length} social_posts records.`);

	console.log('Done.');
	process.exit(0);
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
