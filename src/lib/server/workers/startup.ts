import { createQueues } from './queues';
import { createFeedPollerWorker } from './feed-poller';
import { db } from '../db';
import { feeds } from '../db/schema';
import { eq } from 'drizzle-orm';

let initialized = false;

export async function startWorkers() {
	if (initialized) return;
	initialized = true;

	const { feedPollQueue } = createQueues();
	createFeedPollerWorker();

	const activeFeeds = await db.select().from(feeds).where(eq(feeds.isActive, true));

	for (const feed of activeFeeds) {
		await feedPollQueue.upsertJobScheduler(
			`poll-feed-${feed.id}`,
			{ every: feed.checkInterval * 60 * 1000 },
			{
				name: `poll-feed-${feed.id}`,
				data: { feedId: feed.id, feedUrl: feed.url }
			}
		);
	}

	console.log(`Started feed poller with ${activeFeeds.length} active feeds`);
}
